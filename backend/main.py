# main.py

import asyncio
import os
import uuid
import re
import logging
import time

from dataclasses import dataclass, field
from typing import List, Dict, Optional

from contextlib import asynccontextmanager

import pyaudio
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from openai import AsyncOpenAI

from config.tts_service import AzureTTSConfig, TTSServiceConfig

# Load environment variables from a .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration Management using Dataclasses
@dataclass
class Config:
    MINIMUM_PHRASE_LENGTH: int = 50
    TTS_CHUNK_SIZE: int = 1024
    DEFAULT_RESPONSE_MODEL: str = "gpt-4o-mini"
    AUDIO_FORMAT: int = pyaudio.paInt16
    CHANNELS: int = 1
    RATE: int = 24000
    TEMPERATURE: float = 1.0
    TOP_P: float = 1.0
    DELIMITERS: List[str] = field(default_factory=lambda: [".", "?", "!"])
    SYSTEM_PROMPT: Dict[str, str] = field(default_factory=lambda: {
        "role": "system",
        "content": "You are a helpful but witty and dry assistant"
    })
    tts_service_config: TTSServiceConfig = field(default_factory=TTSServiceConfig.load_from_env)
    
    # Dynamically create the regex pattern based on DELIMITERS
    DELIMITER_REGEX: str = field(init=False)
    DELIMITER_PATTERN: re.Pattern = field(init=False)
    
    def __post_init__(self):
        escaped_delimiters = ''.join(re.escape(d) for d in self.DELIMITERS)
        self.DELIMITER_REGEX = f"[{escaped_delimiters}]"
        self.DELIMITER_PATTERN = re.compile(self.DELIMITER_REGEX)

# Utility Functions
def find_next_phrase_end(text: str, config: Config) -> int:
    match = config.DELIMITER_PATTERN.search(text, pos=config.MINIMUM_PHRASE_LENGTH)
    return match.start() if match else -1

# OpenAI Client
class OpenAIClient:
    def __init__(self, api_key: str, config: Config):
        self.client = AsyncOpenAI(api_key=api_key)
        self.config = config

    async def stream_completion(self, messages: List[dict], phrase_queue: asyncio.Queue, stop_event: asyncio.Event, stream_id: str):
        try:
            response = await self.client.chat.completions.create(
                model=self.config.DEFAULT_RESPONSE_MODEL,
                messages=messages,
                stream=True,
                temperature=self.config.TEMPERATURE,
                top_p=self.config.TOP_P,
            )

            working_string, in_code_block = "", False
            async for chunk in response:
                if stop_event.is_set():
                    logger.info(f"Stop event set for stream ID: {stream_id}. Terminating stream_completion.")
                    await phrase_queue.put(None)
                    break

                content = getattr(chunk.choices[0].delta, 'content', "") if chunk.choices else ""
                if content:
                    yield content
                    working_string += content

                    while True:
                        if in_code_block:
                            code_block_end = working_string.find("\n```", 3)
                            if code_block_end != -1:
                                working_string = working_string[code_block_end + 3:]
                                await phrase_queue.put("Code presented on screen")
                                in_code_block = False
                            else:
                                break
                        else:
                            code_block_start = working_string.find("```")
                            if code_block_start != -1:
                                phrase, working_string = working_string[:code_block_start], working_string[code_block_start:]
                                if phrase.strip():
                                    await phrase_queue.put(phrase.strip())
                                in_code_block = True
                            else:
                                next_phrase_end = find_next_phrase_end(working_string, self.config)
                                if next_phrase_end == -1:
                                    break
                                phrase, working_string = working_string[:next_phrase_end + 1].strip(), working_string[next_phrase_end + 1:]
                                await phrase_queue.put(phrase)

            if working_string.strip() and not in_code_block:
                logger.info(f"Final working_string for stream ID {stream_id}: {working_string.strip()}")
                await phrase_queue.put(working_string.strip())
            await phrase_queue.put(None)

        except Exception as e:
            logger.error(f"Error in stream_completion (Stream ID: {stream_id}): {e}")
            await phrase_queue.put(None)
            yield f"Error: {e}"

        finally:
            logger.info(f"Stream completion ended for stream ID: {stream_id}")

# Text-to-Speech Processor
class TTSProcessor:
    def __init__(self, client: OpenAIClient, config: TTSServiceConfig):
        self.client = client
        self.config = config

    async def process(self, phrase_queue: asyncio.Queue, audio_queue: asyncio.Queue, stop_event: asyncio.Event, stream_id: str):
        try:
            while not stop_event.is_set():
                phrase = await phrase_queue.get()
                if phrase is None:
                    await audio_queue.put(None)
                    break

                try:
                    if self.config.service_type == "openai":
                        await self._process_openai_tts(phrase, audio_queue, stop_event, stream_id)
                    elif self.config.service_type == "azure":
                        await self._process_azure_tts(phrase, audio_queue, stop_event, stream_id)
                    else:
                        raise ValueError(f"Unsupported TTS service type: {self.config.service_type}")
                    
                    # Add silence at the end to indicate completion
                    await audio_queue.put(b'\x00' * 2400)
                except Exception as e:
                    logger.error(f"Error in TTS processing (Stream ID: {stream_id}): {e}")
                    await audio_queue.put(None)
                    break
        finally:
            await audio_queue.put(None)

    async def _process_openai_tts(self, phrase: str, audio_queue: asyncio.Queue, stop_event: asyncio.Event, stream_id: str):
        async with self.client.client.audio.speech.with_streaming_response.create(
            model=self.config.config.default_tts_model,
            voice=self.config.config.default_voice,
            input=phrase,
            speed=self.config.config.speed,
            response_format=self.config.config.response_format
        ) as response:
            async for audio_chunk in response.iter_bytes(self.config.config.chunk_size):
                if stop_event.is_set():
                    break
                await audio_queue.put(audio_chunk)

    async def _process_azure_tts(self, phrase: str, audio_queue: asyncio.Queue, stop_event: asyncio.Event, stream_id: str):
        azure_config: AzureTTSConfig = self.config.config  # Type casting for clarity
        voice = azure_config.select_voice()
        async with self.client.client.audio.speech.with_streaming_response.create(
            model=azure_config.default_tts_model,
            voice=voice,
            input=phrase,
            speed=azure_config.speed,
            response_format=azure_config.response_format
        ) as response:
            async for audio_chunk in response.iter_bytes(azure_config.chunk_size):
                if stop_event.is_set():
                    break
                await audio_queue.put(audio_chunk)

# Audio Player
class AudioPlayer:
    def __init__(self, config: Config, output_device_index: Optional[int] = None):
        self.pyaudio_instance = pyaudio.PyAudio()
        self.config = config
        self.output_device_index = output_device_index  # Optional: specify output device

    async def play(self, audio_queue: asyncio.Queue, stop_event: asyncio.Event, stream_id: str, start_time: float):
        stream = None
        try:
            stream = self.pyaudio_instance.open(
                format=self.config.AUDIO_FORMAT,
                channels=self.config.CHANNELS,
                rate=self.config.RATE,
                output=True,
                frames_per_buffer=self.config.TTS_CHUNK_SIZE,
                output_device_index=self.output_device_index  # Specify device index if needed
            )
            logger.info(f"Audio stream opened for Stream ID: {stream_id}")

            first_audio = True  # Flag to check for the first audio chunk

            while not stop_event.is_set():
                audio_data = await audio_queue.get()
                if audio_data is None:
                    logger.info(f"No more audio data to play for Stream ID: {stream_id}")
                    break

                # Save the first audio chunk to a file for verification
                if first_audio:
                    with open(f"first_audio_chunk_{stream_id}.pcm", "wb") as f:
                        f.write(audio_data)
                    logger.info(f"Saved first audio chunk to first_audio_chunk_{stream_id}.pcm for verification.")

                # Measure time when the first audio data is processed
                if first_audio:
                    elapsed_time = time.time() - start_time
                    logger.info(f"Time taken for the first audio to be heard: {elapsed_time:.2f} seconds")
                    first_audio = False  # Reset the flag after the first chunk is processed

                logger.debug(f"Writing audio chunk of size {len(audio_data)} bytes for Stream ID: {stream_id}")
                await asyncio.to_thread(stream.write, audio_data)
        except Exception as e:
            logger.error(f"Error in audio player (Stream ID: {stream_id}): {e}")
        finally:
            if stream:
                await asyncio.to_thread(stream.stop_stream)
                await asyncio.to_thread(stream.close)
                logger.info(f"Audio stream closed for Stream ID: {stream_id}")

    def terminate(self):
        self.pyaudio_instance.terminate()
        logger.info("PyAudio instance terminated.")

# Stream Manager
class StreamManager:
    def __init__(self):
        self.active_streams: Dict[str, Dict[str, asyncio.Event | asyncio.Task]] = {}
        self.lock = asyncio.Lock()

    async def add_stream(self, stream_id: str, stop_event: asyncio.Event, task: asyncio.Task):
        async with self.lock:
            self.active_streams[stream_id] = {
                "stop_event": stop_event,
                "task": task
            }

    async def remove_stream(self, stream_id: str):
        async with self.lock:
            if stream_id in self.active_streams:
                del self.active_streams[stream_id]
                logger.info(f"Cleaned up stream with ID: {stream_id}")

    async def stop_all(self):
        async with self.lock:
            if not self.active_streams:
                logger.info("No active streams to stop.")
                return

            logger.info("Stopping all active streams...")
            for stream_id, stream_info in self.active_streams.items():
                logger.info(f"Setting stop_event for stream ID: {stream_id}")
                stream_info["stop_event"].set()
                stream_info["task"].cancel()

            await asyncio.sleep(0.1)
            self.active_streams.clear()
            logger.info("All active streams have been stopped.")

    async def stop_stream(self, stream_id: str):
        async with self.lock:
            if stream_id not in self.active_streams:
                logger.warning(f"Attempted to stop non-existent stream ID: {stream_id}")
                return False

            logger.info(f"Stopping specific stream with ID: {stream_id}")
            stream_info = self.active_streams[stream_id]
            stream_info["stop_event"].set()
            stream_info["task"].cancel()
            await asyncio.sleep(0.1)
            if stream_id in self.active_streams:
                await self.remove_stream(stream_id)
            return True

# Application Lifecycle Manager
class AppLifecycle:
    def __init__(self, stream_manager: StreamManager, audio_player: AudioPlayer):
        self.stream_manager = stream_manager
        self.audio_player = audio_player

    @asynccontextmanager
    async def lifespan(self, app: FastAPI):
        logger.info("Starting up application...")
        try:
            yield
        finally:
            logger.info("Shutting down application...")
            await self.stream_manager.stop_all()
            self.audio_player.terminate()
            logger.info("Shutdown complete.")

# API Routes
class API:
    def __init__(self, app: FastAPI, openai_client: OpenAIClient, tts_processor: TTSProcessor, audio_player: AudioPlayer, stream_manager: StreamManager, config: Config):
        self.app = app
        self.openai_client = openai_client
        self.tts_processor = tts_processor
        self.audio_player = audio_player
        self.stream_manager = stream_manager
        self.config = config

        self.setup_routes()

    def setup_routes(self):
        @self.app.post("/api/openai")
        async def openai_stream(request: Request):
            logger.info("Received new /api/openai request. Stopping all existing streams...")
            await self.stream_manager.stop_all()

            stream_id = str(uuid.uuid4())
            logger.info(f"Starting new stream with ID: {stream_id}")

            stop_event = asyncio.Event()

            try:
                data = await request.json()
            except Exception as e:
                logger.error(f"Invalid JSON payload: {e}")
                raise HTTPException(status_code=400, detail="Invalid JSON payload")

            messages = [{"role": msg["sender"], "content": msg["text"]} for msg in data.get("messages", [])]
            messages.insert(0, self.config.SYSTEM_PROMPT)

            phrase_queue = asyncio.Queue()
            audio_queue = asyncio.Queue()

            start_time = time.time()  # Record the start time here

            tts_task = asyncio.create_task(
                self.tts_processor.process(phrase_queue, audio_queue, stop_event, stream_id)
            )
            audio_task = asyncio.create_task(
                self.audio_player.play(audio_queue, stop_event, stream_id, start_time)  # Pass the start_time to AudioPlayer
            )
            process_task = asyncio.create_task(
                self.process_streams(tts_task, audio_task, stream_id)
            )

            await self.stream_manager.add_stream(stream_id, stop_event, process_task)

            return StreamingResponse(
                self.stream_completion_generator(messages, phrase_queue, stop_event, stream_id),
                media_type="text/plain"
            )

        @self.app.post("/api/stop_all")
        async def stop_all_streams_endpoint():
            await self.stream_manager.stop_all()
            return {"status": "All active streams have been stopped."}

        @self.app.post("/api/stop/{stream_id}")
        async def stop_specific_stream(stream_id: str):
            success = await self.stream_manager.stop_stream(stream_id)
            if not success:
                raise HTTPException(status_code=404, detail="Stream ID not found.")
            return {"status": f"Stream {stream_id} has been stopped."}

    async def process_streams(self, tts_task: asyncio.Task, audio_task: asyncio.Task, stream_id: str):
        try:
            await asyncio.gather(tts_task, audio_task)
        except asyncio.CancelledError:
            logger.info(f"Process streams tasks cancelled (Stream ID: {stream_id})")
        except Exception as e:
            logger.error(f"Error in process_streams (Stream ID: {stream_id}): {e}")
        finally:
            await self.stream_manager.remove_stream(stream_id)

    async def stream_completion_generator(self, messages: List[dict], phrase_queue: asyncio.Queue, stop_event: asyncio.Event, stream_id: str):
        try:
            async for content in self.openai_client.stream_completion(messages, phrase_queue, stop_event, stream_id):
                yield content
        except Exception as e:
            logger.error(f"Error in stream_completion_generator (Stream ID: {stream_id}): {e}")
            yield f"Error: {e}"
        finally:
            logger.info(f"Stream completion generator ended for stream ID: {stream_id}")

# Main Application Setup
def create_app() -> FastAPI:
    config = Config()
    app = FastAPI()

    # Initialize components
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        logger.error("OPENAI_API_KEY is not set in environment variables.")
        raise EnvironmentError("OPENAI_API_KEY is required.")

    openai_client = OpenAIClient(api_key=openai_api_key, config=config)
    stream_manager = StreamManager()
    audio_player = AudioPlayer(config=config)  # Optionally, pass output_device_index
    tts_processor = TTSProcessor(client=openai_client, config=config.tts_service_config)
    lifecycle = AppLifecycle(stream_manager=stream_manager, audio_player=audio_player)
    api = API(app, openai_client, tts_processor, audio_player, stream_manager, config)

    # Add Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],  # Update this as needed
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Setup lifespan
    app.router.lifespan = lifecycle.lifespan

    return app

# Initialize the app
app = create_app()

# Run the application
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
