import os
import asyncio
from typing import List
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import pyaudio
import threading
from dotenv import load_dotenv
from openai import AsyncOpenAI

# Load environment variables and initialize constants
load_dotenv()

MINIMUM_PHRASE_LENGTH = 50
TTS_CHUNK_SIZE = 1024
DEFAULT_RESPONSE_MODEL = "gpt-4o-mini"
DEFAULT_TTS_MODEL = "tts-1"
DEFAULT_VOICE = "alloy"
AUDIO_FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 24000

# Delimiters to determine where one phrase ends
DELIMITERS = [f"{d} " for d in (".", "?", "!")]  # Sentence-ending characters followed by a space

# Initialize OpenAI client and global stop event
aclient = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
stop_event = threading.Event()

# Create FastAPI app and configure CORS
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def stream_completion(messages: List[dict], phrase_queue: asyncio.Queue, model: str = DEFAULT_RESPONSE_MODEL):
    try:
        response = await aclient.chat.completions.create(
            model=model,
            messages=messages,
            stream=True,
            stream_options={"include_usage": True},
        )

        working_string = ""
        last_chunk = None
        sentence_accumulator = ""

        async for chunk in response:
            if stop_event.is_set():
                return

            last_chunk = chunk  # Keep track of the last chunk

            # Check if 'choices' is not empty and has a 'delta' with 'content'
            if chunk.choices and hasattr(chunk.choices[0].delta, 'content'):
                content = chunk.choices[0].delta.content or ""
                if content:
                    sentence_accumulator += content  # Accumulate content
                    yield content  # Stream raw text directly
                    working_string += content

                    # Check if the working_string has a complete phrase based on the delimiters
                    while len(working_string) >= MINIMUM_PHRASE_LENGTH:
                        delimiter_index = -1
                        for delimiter in DELIMITERS:
                            index = working_string.find(delimiter, MINIMUM_PHRASE_LENGTH)
                            if index != -1 and (delimiter_index == -1 or index < delimiter_index):
                                delimiter_index = index

                        if delimiter_index == -1:
                            break

                        phrase, working_string = (
                            working_string[: delimiter_index + len(delimiter)],
                            working_string[delimiter_index + len(delimiter):],
                        )
                        await phrase_queue.put(phrase.strip())  # Queue complete phrases for TTS

        # Print the accumulated sentence as a horizontal sentence
        print(f"Final Sentence: {sentence_accumulator.strip()}")

        # After the loop ends, print the final chunk's details
        if last_chunk:
            print("****************")
            print(f"Final Chunk - Choices: {last_chunk.choices}")
            print(f"Final Chunk - Usage: {last_chunk.usage}")

        if working_string.strip():
            await phrase_queue.put(working_string.strip())

        await phrase_queue.put(None)  # Signal end of phrase stream
    except Exception as e:
        yield f"Error: {e}"



async def text_to_speech_processor(phrase_queue: asyncio.Queue, audio_queue: asyncio.Queue, model: str = DEFAULT_TTS_MODEL, voice: str = DEFAULT_VOICE):
    while not stop_event.is_set():
        phrase = await phrase_queue.get()
        if phrase is None:
            await audio_queue.put(None)
            return

        try:
            response = await aclient.audio.speech.create(
                model=model,
                voice=voice,
                input=phrase,
                response_format="pcm"
            )

            audio_data = b''
            for chunk in response.iter_bytes(chunk_size=TTS_CHUNK_SIZE):
                audio_data += chunk

            for i in range(0, len(audio_data), TTS_CHUNK_SIZE):
                audio_chunk = audio_data[i:i + TTS_CHUNK_SIZE]
                await audio_queue.put(audio_chunk)
        except Exception as e:
            await audio_queue.put(None)
            return

async def audio_player(audio_queue: asyncio.Queue):
    p = pyaudio.PyAudio()
    player_stream = p.open(format=AUDIO_FORMAT, channels=CHANNELS, rate=RATE, output=True)

    try:
        while not stop_event.is_set():
            audio_data = await audio_queue.get()
            if audio_data is None:
                break
            player_stream.write(audio_data)
    finally:
        player_stream.stop_stream()
        player_stream.close()
        p.terminate()

@app.post("/api/openai")
async def openai_stream(request: Request):
    data = await request.json()
    messages = data.get('messages', [])

    system_message = {"role": "system", "content": "You are a witty but dry assistant."}
    formatted_messages = [{"role": msg["sender"], "content": msg["text"]} for msg in messages]
    formatted_messages.insert(0, system_message)

    phrase_queue = asyncio.Queue()
    audio_queue = asyncio.Queue()

    async def process_streams():
        await asyncio.gather(
            text_to_speech_processor(phrase_queue, audio_queue, model=DEFAULT_TTS_MODEL, voice=DEFAULT_VOICE),
            audio_player(audio_queue)
        )

    # Start the processing tasks in the background
    asyncio.create_task(process_streams())

    return StreamingResponse(stream_completion(formatted_messages, phrase_queue, model=DEFAULT_RESPONSE_MODEL), media_type='text/plain')

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000)