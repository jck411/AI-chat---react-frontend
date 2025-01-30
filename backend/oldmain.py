import atexit
import os
import json
import asyncio
import signal
import threading
import openai
import inspect
import re
import requests  
from datetime import datetime, timedelta, timezone
from timezonefinder import TimezoneFinder
import pytz
from typing import Any, AsyncIterator, Callable, Dict, List, Optional, Sequence, Tuple, Union
import uuid
import shutil
from fastapi import FastAPI, HTTPException, APIRouter, Request, Response, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import pyaudio
from dotenv import load_dotenv
import azure.cognitiveservices.speech as speechsdk
from queue import Queue
import uvicorn

# =====================================================================================
# Load .env for your API keys:
#   - OPENAI_API_KEY=<your openai key>
#   - OPENROUTER_API_KEY=<your openrouter key>
# Also set Azure Speech key/region if you use Azure TTS:
#   - AZURE_SPEECH_KEY=<azure speech key>
#   - AZURE_SPEECH_REGION=<azure speech region>
# =====================================================================================
load_dotenv()

# ========================= CONFIG =========================
CONFIG = {
    # Toggle which chat completion provider you want:
    #   "openai" or "openrouter"
    "API_SETTINGS": {
        "API_HOST": "openai"
    },
    "API_SERVICES": {
        "openai": {
            "BASE_URL": "https://api.openai.com/v1",
            "MODEL": "gpt-4o-mini"
        },
        "openrouter": {
            "BASE_URL": "https://openrouter.ai/api/v1",
            "MODEL": "meta-llama/llama-3.1-70b-instruct"
        },
    },

    # Toggle which TTS provider you want: "azure" or "openai"
    "GENERAL_TTS": {
        "TTS_PROVIDER": "azure",  # Changed to "azure"
        "TTS_ENABLED": True  # New configuration option
    },

    "PROCESSING_PIPELINE": {
        "USE_SEGMENTATION": True,
        "DELIMITERS": ["\n", ". ", "? ", "! ", "* "],
        "NLP_MODULE": "none",
        "CHARACTER_MAXIMUM": 50,
    },
    "TTS_MODELS": {
        "OPENAI_TTS": {
            "TTS_CHUNK_SIZE": 1024,
            "TTS_SPEED": 1.0,
            "TTS_VOICE": "alloy",
            "TTS_MODEL": "tts-1",
            "AUDIO_RESPONSE_FORMAT": "pcm",
            "AUDIO_FORMAT_RATES": {
                "pcm": 24000,
                "mp3": 44100,
                "wav": 48000
            },
            "PLAYBACK_RATE": 24000
        },
        "AZURE_TTS": {
            "TTS_SPEED": "0%",
            "TTS_VOICE": "en-US-KaiNeural",
            "SPEECH_SYNTHESIS_RATE": "0%",
            "AUDIO_FORMAT": "Raw24Khz16BitMonoPcm",
            "AUDIO_FORMAT_RATES": {
                "Raw8Khz16BitMonoPcm": 8000,
                "Raw16Khz16BitMonoPcm": 16000,
                "Raw24Khz16BitMonoPcm": 24000,
                "Raw44100Hz16BitMonoPcm": 44100,
                "Raw48Khz16BitMonoPcm": 48000
            },
            "PLAYBACK_RATE": 24000,
            "ENABLE_PROFANITY_FILTER": False,
            "STABILITY": 0,
            "PROSODY": {
                "rate": "1.0",
                "pitch": "0%",
                "volume": "default"
            }
        }
    },
    "AUDIO_PLAYBACK_CONFIG": {
        "FORMAT": 16,
        "CHANNELS": 1,
        "RATE": None
    },
    "LOGGING": {
        "PRINT_ENABLED": True,
        "PRINT_SEGMENTS": True,
        "PRINT_TOOL_CALLS": True,
        "PRINT_FUNCTION_CALLS": True
    }
}

# ========================= SELECT CHAT PROVIDER =========================
API_HOST = CONFIG["API_SETTINGS"]["API_HOST"].lower()

if API_HOST == "openai":  # Check for openai first
    client = openai.AsyncOpenAI(
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=CONFIG["API_SERVICES"]["openai"]["BASE_URL"]
    )
    DEPLOYMENT_NAME = CONFIG["API_SERVICES"]["openai"]["MODEL"]

elif API_HOST == "openrouter":  # Then check for openrouter
    client = openai.AsyncOpenAI(
        api_key=os.getenv("OPENROUTER_API_KEY"),
        base_url=CONFIG["API_SERVICES"]["openrouter"]["BASE_URL"]
    )
    DEPLOYMENT_NAME = CONFIG["API_SERVICES"]["openrouter"]["MODEL"]

# ==================== Helper Logging ====================
def conditional_print(message: str, print_type: str = "default"):
    if print_type == "segment" and CONFIG["LOGGING"]["PRINT_SEGMENTS"]:
        print(f"[SEGMENT] {message}")
    elif print_type == "tool_call" and CONFIG["LOGGING"]["PRINT_TOOL_CALLS"]:
        print(f"[TOOL CALL] {message}")
    elif print_type == "function_call" and CONFIG["LOGGING"]["PRINT_FUNCTION_CALLS"]:
        print(f"[FUNCTION CALL] {message}")
    elif CONFIG["LOGGING"]["PRINT_ENABLED"]:
        print(f"[INFO] {message}")

# ==================== Core Classes (STT Classes) ====================

# ---------------- Singleton PyAudio Instance  ----------------

class PyAudioSingleton:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = pyaudio.PyAudio()
            print("PyAudio initialized.")
        return cls._instance

    @classmethod
    def terminate(cls):
        if cls._instance is not None:
            cls._instance.terminate()
            print("PyAudio terminated.")
            cls._instance = None

# Initialize the singleton
pyaudio_instance = PyAudioSingleton()


class AudioPlayer:
    def __init__(self, pyaudio_instance, playback_rate=24000, channels=1, format=pyaudio.paInt16):
        self.pyaudio = pyaudio_instance
        self.playback_rate = playback_rate
        self.channels = channels
        self.format = format
        self.stream = None
        self.lock = threading.Lock()
        self.is_playing = False

    def start_stream(self):
        with self.lock:
            if not self.is_playing:
                self.stream = self.pyaudio.open(
                    format=self.format,
                    channels=self.channels,
                    rate=self.playback_rate,
                    output=True,
                    frames_per_buffer=1024
                )
                self.is_playing = True
                print("Audio stream started.")

    def stop_stream(self):
        with self.lock:
            if self.stream and self.is_playing:
                self.stream.stop_stream()
                self.stream.close()
                self.stream = None
                self.is_playing = False
                print("Audio stream stopped.")

    def write_audio(self, data: bytes):
        with self.lock:
            if self.stream and self.is_playing:
                self.stream.write(data)

# Initialize a global AudioPlayer instance
audio_player = AudioPlayer(pyaudio_instance)

# ------------------- Shutdown Handler -------------------
def shutdown():
    print("Shutting down server...")
    audio_player.stop_stream()
    PyAudioSingleton.terminate()
    print("Shutdown complete.")

# Register the shutdown function
atexit.register(shutdown)

# Optionally handle SIGINT and SIGTERM for graceful shutdown
signal.signal(signal.SIGINT, lambda sig, frame: shutdown())
signal.signal(signal.SIGTERM, lambda sig, frame: shutdown())

# ---------------- Azure STT Class ----------------
class ContinuousSpeechRecognizer:
    def __init__(self):
        self.speech_key = os.getenv('AZURE_SPEECH_KEY')
        self.speech_region = os.getenv('AZURE_SPEECH_REGION')
        self.is_listening = False
        self.speech_queue = Queue()
        self.setup_recognizer()

    def setup_recognizer(self):
        if not self.speech_key or not self.speech_region:
            raise ValueError("Azure Speech Key or Region is not set.")

        speech_config = speechsdk.SpeechConfig(
            subscription=self.speech_key,
            region=self.speech_region
        )
        speech_config.speech_recognition_language = "en-US"  # Default language

        audio_config = speechsdk.audio.AudioConfig(use_default_microphone=True)
        self.speech_recognizer = speechsdk.SpeechRecognizer(
            speech_config=speech_config,
            audio_config=audio_config
        )

        self.speech_recognizer.recognized.connect(self.handle_final_result)

    def handle_final_result(self, evt):
        if evt.result.text and self.is_listening:
            self.speech_queue.put(evt.result.text)

    def start_listening(self):
        if not self.is_listening:
            self.is_listening = True
            self.speech_recognizer.start_continuous_recognition()
            print("Azure STT: Started listening.")

    def pause_listening(self):
        if self.is_listening:
            self.is_listening = False
            self.speech_recognizer.stop_continuous_recognition()
            print("Azure STT: Paused listening.")

    def get_speech_nowait(self):
        try:
            return self.speech_queue.get_nowait()
        except:
            return None

# Single global instance
stt_instance = ContinuousSpeechRecognizer()

# ==================== Tools & Function Calls ====================
def check_args(function: Callable, args: dict) -> bool:
    sig = inspect.signature(function)
    params = sig.parameters
    for name in args:
        if name not in params:
            return False
    for name, param in params.items():
        if param.default is param.empty and name not in args:
            return False
    return True

def get_function_and_args(tool_call: dict, available_functions: dict) -> Tuple[Callable, dict]:
    function_name = tool_call["function"]["name"]
    function_args = json.loads(tool_call["function"]["arguments"])
    if function_name not in available_functions:
        raise ValueError(f"Function '{function_name}' not found")
    function_to_call = available_functions[function_name]
    if not check_args(function_to_call, function_args):
        raise ValueError(f"Invalid arguments for function '{function_name}'")
    return function_to_call, function_args

def fetch_weather(lat=28.5383, lon=-81.3792, exclude="minutely", units="metric", lang="en"):
    """
    Fetch weather data from OpenWeatherMap API.
    By default, excludes minute-by-minute data and uses Orlando, FL as the location.

    Parameters:
    - lat (float, optional): Latitude of the location. Defaults to Orlando, FL (28.5383).
    - lon (float, optional): Longitude of the location. Defaults to Orlando, FL (-81.3792).
    - exclude (str, optional): Data to exclude (e.g., 'minutely,hourly'). Defaults to "minutely".
    - units (str, optional): Units of measurement. Defaults to "metric".
    - lang (str, optional): Language of the response. Defaults to "en".

    Returns:
    - dict: Weather data in JSON format.
    """
    load_dotenv()
    api_key = os.getenv('OPENWEATHER_API_KEY')
    if not api_key:
        raise ValueError("API key not found. Please set OPENWEATHER_API_KEY in your .env file.")
    
    url = f"https://api.openweathermap.org/data/3.0/onecall?lat={lat}&lon={lon}&appid={api_key}&units={units}&lang={lang}"
    if exclude:
        url += f"&exclude={exclude}"
    
    response = requests.get(url)
    response.raise_for_status()
    return response.json()

def get_time(lat=28.5383, lon=-81.3792):
    """
    Fetch the current time based on the location's latitude and longitude.

    Parameters:
    - lat (float, optional): Latitude of the location. Defaults to Orlando, FL (28.5383).
    - lon (float, optional): Longitude of the location. Defaults to Orlando, FL (-81.3792).

    Returns:
    - str: Current time in HH:MM:SS format.
    """
    tf = TimezoneFinder()
    tz_name = tf.timezone_at(lat=lat, lng=lon)  # Find the time zone
    if not tz_name:
        raise ValueError("Time zone could not be determined for the given coordinates.")
    
    local_tz = pytz.timezone(tz_name)
    local_time = datetime.now(local_tz)  # Convert to local time
    return local_time.strftime("%H:%M:%S")

def get_tools():
    return [
        {
            "type": "function",
            "function": {
                "name": "fetch_weather",
                "description": "Fetch current weather and forecast data from OpenWeatherMap API. Returns in Celcius but report Farenheit or Celcius based on country and give a concise summary unless asked for detail",
                "strict": True,
                "parameters": {
                    "type": "object",
                    "required": ["lat", "lon", "exclude", "units", "lang"],
                    "properties": {
                        "lat": {
                            "type": "number",
                            "description": "Latitude of the location. Defaults to Orlando, FL (28.5383).",
                            "nullable": True
                        },
                        "lon": {
                            "type": "number",
                            "description": "Longitude of the location. Defaults to Orlando, FL (-81.3792).",
                            "nullable": True
                        },
                        "exclude": {
                            "type": "string",
                            "description": "Data to exclude (e.g., 'minutely,hourly'). Defaults to 'minutely'.",
                            "nullable": True
                        },
                        "units": {
                            "type": "string",
                            "description": "Units of measurement ('standard', 'metric', 'imperial'). based on country.",
                            "nullable": True
                        },
                        "lang": {
                            "type": "string",
                            "description": "Language of the response. Defaults to 'en'.",
                            "nullable": True
                        }
                    },
                    "additionalProperties": False
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_time",
                "description": "Fetch the current time based on the location's latitude and longitude. Report to nearest minute unless asked for seconds.",
                "strict": True,
                "parameters": {
                    "type": "object",
                    "required": ["lat", "lon"],
                    "properties": {
                        "lat": {
                            "type": "number",
                            "description": "Latitude of the location. Defaults to Orlando, FL (28.5383)."
                        },
                        "lon": {
                            "type": "number",
                            "description": "Longitude of the location. Defaults to Orlando, FL (-81.3792)."
                        }
                    },
                    "additionalProperties": False
                }
            }
        }
    ]

def get_available_functions():
    return { 
        "fetch_weather": fetch_weather,
        "get_time": get_time
    }

# ==================== Audio Player & TTS ====================
def audio_player_sync(audio_queue: asyncio.Queue, loop: asyncio.AbstractEventLoop):
    """
    Blocks on an asyncio.Queue in a background thread and plays PCM data via the persistent AudioPlayer.
    """
    try:
        audio_player.start_stream()
        while True:
            future = asyncio.run_coroutine_threadsafe(audio_queue.get(), loop)
            audio_data = future.result()
            if audio_data is None:
                print("audio_player_sync received stop signal.")
                break
            try:
                audio_player.write_audio(audio_data)
            except Exception as e:
                print(f"Audio playback error: {e}")
                break
    except Exception as e:
        print(f"audio_player_sync encountered an error: {e}")
    finally:
        audio_player.stop_stream()

async def start_audio_player_async(audio_queue: asyncio.Queue, loop: asyncio.AbstractEventLoop):
    await asyncio.to_thread(audio_player_sync, audio_queue, loop)

# --------- Azure TTS --------- #
class PushAudioOutputStreamCallback(speechsdk.audio.PushAudioOutputStreamCallback):
    def __init__(self, audio_queue: asyncio.Queue):
        super().__init__()
        self.audio_queue = audio_queue
        self.loop = asyncio.get_event_loop()

    def write(self, data: memoryview) -> int:
        # This gets called by Azure, so we pass the bytes to the asyncio queue
        self.loop.call_soon_threadsafe(self.audio_queue.put_nowait, data.tobytes())
        return len(data)

    def close(self):
        # Once Azure is done, we push None to signal done
        self.loop.call_soon_threadsafe(self.audio_queue.put_nowait, None)

def create_ssml(phrase: str, voice: str, prosody: dict) -> str:
    return f"""
<speak version='1.0' xml:lang='en-US'>
    <voice name='{voice}'>
        <prosody rate='{prosody["rate"]}' pitch='{prosody["pitch"]}' volume='{prosody["volume"]}'>
            {phrase}
        </prosody>
    </voice>
</speak>
"""

async def azure_text_to_speech_processor(phrase_queue: asyncio.Queue, audio_queue: asyncio.Queue):
    """
    Continuously read text from phrase_queue, convert to speech with Azure TTS,
    and push PCM data into audio_queue for playback.
    """
    try:
        speech_config = speechsdk.SpeechConfig(
            subscription=os.getenv("AZURE_SPEECH_KEY"),
            region=os.getenv("AZURE_SPEECH_REGION")
        )
        prosody = CONFIG["TTS_MODELS"]["AZURE_TTS"]["PROSODY"]
        voice = CONFIG["TTS_MODELS"]["AZURE_TTS"]["TTS_VOICE"]
        audio_format = getattr(
            speechsdk.SpeechSynthesisOutputFormat, 
            CONFIG["TTS_MODELS"]["AZURE_TTS"]["AUDIO_FORMAT"]
        )
        speech_config.set_speech_synthesis_output_format(audio_format)
        conditional_print("Azure TTS configured successfully.", "default")

        while True:
            phrase = await phrase_queue.get()
            if phrase is None:
                await audio_queue.put(None)
                conditional_print("Azure TTS received stop signal.", "default")
                return

            try:
                ssml_phrase = create_ssml(phrase, voice, prosody)
                push_stream_callback = PushAudioOutputStreamCallback(audio_queue)
                push_stream = speechsdk.audio.PushAudioOutputStream(push_stream_callback)
                audio_cfg = speechsdk.audio.AudioOutputConfig(stream=push_stream)

                synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=audio_cfg)
                result_future = synthesizer.speak_ssml_async(ssml_phrase)
                conditional_print(f"Azure TTS synthesizing phrase: {phrase}", "default")
                # Wait for the result in an executor (blocking call)
                await asyncio.get_event_loop().run_in_executor(None, result_future.get)
                conditional_print("Azure TTS synthesis completed.", "default")
            except Exception as e:
                conditional_print(f"Azure TTS error: {e}", "default")
                await audio_queue.put(None)
    except Exception as e:
        conditional_print(f"Azure TTS config error: {e}", "default")
        await audio_queue.put(None)

# --------- OpenAI TTS --------- #
async def openai_text_to_speech_processor(
    phrase_queue: asyncio.Queue,
    audio_queue: asyncio.Queue,
    openai_client: Optional[openai.AsyncOpenAI] = None
):
    """
    Reads phrases from phrase_queue, calls OpenAI TTS streaming,
    and pushes audio chunks to audio_queue.
    """
    openai_client = openai_client or openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    try:
        model = CONFIG["TTS_MODELS"]["OPENAI_TTS"]["TTS_MODEL"]
        voice = CONFIG["TTS_MODELS"]["OPENAI_TTS"]["TTS_VOICE"]
        speed = CONFIG["TTS_MODELS"]["OPENAI_TTS"]["TTS_SPEED"]
        response_format = CONFIG["TTS_MODELS"]["OPENAI_TTS"]["AUDIO_RESPONSE_FORMAT"]
        chunk_size = CONFIG["TTS_MODELS"]["OPENAI_TTS"]["TTS_CHUNK_SIZE"]
    except KeyError as e:
        conditional_print(f"Missing OpenAI TTS config: {e}", "default")
        await audio_queue.put(None)
        return

    try:
        while True:
            phrase = await phrase_queue.get()
            if phrase is None:
                # Signal end of audio to player
                await audio_queue.put(None)
                conditional_print("OpenAI TTS received stop signal.", "default")
                return

            stripped_phrase = phrase.strip()
            if not stripped_phrase:
                continue

            try:
                # Create streaming request to OpenAI TTS endpoint
                async with openai_client.audio.speech.with_streaming_response.create(
                    model=model,
                    voice=voice,
                    input=stripped_phrase,
                    speed=speed,
                    response_format=response_format
                ) as response:
                    async for audio_chunk in response.iter_bytes(chunk_size):
                        await audio_queue.put(audio_chunk)

                # Optionally add a small pause between phrases
                await audio_queue.put(b'\x00' * chunk_size)
                conditional_print("OpenAI TTS synthesis completed for phrase.", "default")
            except Exception as e:
                conditional_print(f"OpenAI TTS error: {e}", "default")
                # Keep going for the next phrase
                continue

    except Exception as e:
        conditional_print(f"OpenAI TTS general error: {e}", "default")
        await audio_queue.put(None)

# --------- Orchestrator for TTS & Audio playback --------- #
async def process_streams(phrase_queue: asyncio.Queue, audio_queue: asyncio.Queue):
    """
    Chooses which TTS to run (Azure or OpenAI) and then starts
    the audio player to consume from audio_queue.
    """
    # Check if TTS is enabled
    if not CONFIG["GENERAL_TTS"]["TTS_ENABLED"]:
        # If TTS is disabled, just consume the phrases without processing
        while True:
            phrase = await phrase_queue.get()
            if phrase is None:
                break
        return

    try:
        provider = CONFIG["GENERAL_TTS"]["TTS_PROVIDER"].lower()
        if provider == "azure":
            tts_processor = azure_text_to_speech_processor
            playback_rate = CONFIG["TTS_MODELS"]["AZURE_TTS"]["PLAYBACK_RATE"]
        elif provider == "openai":
            tts_processor = openai_text_to_speech_processor
            playback_rate = CONFIG["TTS_MODELS"]["OPENAI_TTS"]["PLAYBACK_RATE"]
        else:
            raise ValueError(f"Unsupported TTS provider: {provider}")

        loop = asyncio.get_running_loop()

        # **Pause STT before starting TTS**
        stt_instance.pause_listening()
        conditional_print("STT paused before starting TTS.", "segment")

        # Start TTS in the background
        tts_task = asyncio.create_task(tts_processor(phrase_queue, audio_queue))
        # Start the audio player
        audio_player_task = asyncio.create_task(start_audio_player_async(audio_queue, loop))
        conditional_print("Started TTS and audio playback tasks.", "default")
        # Wait for both to complete
        await asyncio.gather(tts_task, audio_player_task)

        # **Resume STT after TTS is done**
        stt_instance.start_listening()
        conditional_print("STT resumed after completing TTS.", "segment")

    except Exception as e:
        conditional_print(f"Error in process_streams: {e}", "default")
        # Ensure STT is resumed even if an error occurs
        stt_instance.start_listening()

# ==================== Streaming Chat Logic ====================
def extract_content_from_openai_chunk(chunk: Any) -> Optional[str]:
    try:
        return chunk.choices[0].delta.content
    except (IndexError, AttributeError):
        return None

def compile_delimiter_pattern(delimiters: List[str]) -> Optional[re.Pattern]:
    if not delimiters:
        return None
    sorted_delims = sorted(delimiters, key=len, reverse=True)
    escaped = map(re.escape, sorted_delims)
    pattern = "|".join(escaped)
    return re.compile(pattern)

async def process_chunks(
    chunk_queue: asyncio.Queue,
    phrase_queue: asyncio.Queue,
    delimiter_pattern: Optional[re.Pattern],
    use_segmentation: bool,
    character_max: int
):
    working_string = ""
    chars_processed = 0
    segmentation_active = use_segmentation

    while True:
        chunk = await chunk_queue.get()
        if chunk is None:
            if working_string.strip():
                phrase = working_string.strip()
                await phrase_queue.put(phrase)
                conditional_print(f"Final Segment: {phrase}", "segment")
            await phrase_queue.put(None)
            break

        content = extract_content_from_openai_chunk(chunk)
        if content:
            working_string += content
            if segmentation_active and delimiter_pattern:
                while True:
                    match = delimiter_pattern.search(working_string)
                    if match:
                        end_idx = match.end()
                        phrase = working_string[:end_idx].strip()
                        if phrase:
                            await phrase_queue.put(phrase)
                            chars_processed += len(phrase)
                            conditional_print(f"Segment: {phrase}", "segment")
                        working_string = working_string[end_idx:]
                        if chars_processed >= character_max:
                            segmentation_active = False
                            break
                    else:
                        break

async def validate_messages_for_ws(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Validates and prepares messages for OpenAI completion.
    This function replicates the logic from `validate_and_prepare_for_openai_completion`
    but accepts messages directly instead of a Request object.
    """
    if not isinstance(messages, list):
        raise HTTPException(status_code=400, detail="'messages' must be a list.")

    prepared = []
    for idx, msg in enumerate(messages):
        if not isinstance(msg, dict):
            raise HTTPException(status_code=400, detail=f"Message at index {idx} must be a dictionary.")
        sender = msg.get("sender")
        text = msg.get("text")
        
        if not sender or not isinstance(sender, str):
            raise HTTPException(status_code=400, detail=f"Message at index {idx} missing valid 'sender'.")
        if not text or not isinstance(text, str):
            raise HTTPException(status_code=400, detail=f"Message at index {idx} missing valid 'text'.")

        if sender.lower() == 'user':
            role = 'user'
        elif sender.lower() == 'assistant':
            role = 'assistant'
        else:
            raise HTTPException(status_code=400, detail=f"Invalid sender at index {idx}. Must be 'user' or 'assistant'.")

        prepared.append({"role": role, "content": text})

    # Insert system prompt at the beginning
    system_prompt = {"role": "system", "content": "You are a helpful assistant. Users live in Orlando, Fl"}
    prepared.insert(0, system_prompt)
    
    return prepared

async def stream_openai_completion(
    messages: Sequence[Dict[str, Union[str, Any]]],
    phrase_queue: asyncio.Queue
) -> AsyncIterator[str]:
    delimiter_pattern = compile_delimiter_pattern(CONFIG["PROCESSING_PIPELINE"]["DELIMITERS"])
    use_segmentation = CONFIG["PROCESSING_PIPELINE"]["USE_SEGMENTATION"]
    character_max = CONFIG["PROCESSING_PIPELINE"]["CHARACTER_MAXIMUM"]

    chunk_queue = asyncio.Queue()
    chunk_processor_task = asyncio.create_task(
        process_chunks(chunk_queue, phrase_queue, delimiter_pattern, use_segmentation, character_max)
    )

    try:
        response = await client.chat.completions.create(
            model=DEPLOYMENT_NAME,
            messages=messages,
            tools=get_tools(),
            tool_choice="auto",
            stream=True,
            temperature=0.7,
            top_p=1.0,
        )

        tool_calls = []
        async for chunk in response:
            delta = chunk.choices[0].delta if (chunk.choices and chunk.choices[0].delta) else None
            if delta and delta.content:
                yield delta.content
                await chunk_queue.put(chunk)
            elif delta and delta.tool_calls:
                tc_list = delta.tool_calls
                for tc_chunk in tc_list:
                    while len(tool_calls) <= tc_chunk.index:
                        tool_calls.append({"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
                    tc = tool_calls[tc_chunk.index]
                    if tc_chunk.id:
                        tc["id"] += tc_chunk.id
                    if tc_chunk.function.name:
                        tc["function"]["name"] += tc_chunk.function.name
                    if tc_chunk.function.arguments:
                        tc["function"]["arguments"] += tc_chunk.function.arguments

        # Handle tool calls if present
        if tool_calls:
            conditional_print("[Tool Calls Detected]:", "tool_call")
            for tc in tool_calls:
                conditional_print(json.dumps(tc, indent=2), "tool_call")
            messages.append({"role": "assistant", "tool_calls": tool_calls})
            funcs = get_available_functions()

            for tool_call in tool_calls:
                try:
                    fn, fn_args = get_function_and_args(tool_call, funcs)
                    conditional_print(f"[Calling Function]: {fn.__name__}", "function_call")
                    conditional_print(f"[With Arguments]: {json.dumps(fn_args, indent=2)}", "function_call")
                    
                    resp = fn(**fn_args)
                    conditional_print(f"[Function Output]: {resp}", "function_call")

                    messages.append({
                        "tool_call_id": tool_call["id"],
                        "role": "tool",
                        "name": fn.__name__,
                        "content": json.dumps(resp)
                    })
                except ValueError as e:
                    messages.append({"role": "assistant", "content": f"[Error]: {str(e)}"})

            # Follow-up after processing tool calls
            follow_up = await client.chat.completions.create(
                model=DEPLOYMENT_NAME,
                messages=messages,
                stream=True,
                temperature=0.7,
                top_p=1.0,
            )
            async for fu_chunk in follow_up:
                content = extract_content_from_openai_chunk(fu_chunk)
                if content:
                    yield content
                await chunk_queue.put(fu_chunk)

        await chunk_queue.put(None)
        await chunk_processor_task

    except Exception as e:
        await chunk_queue.put(None)
        raise HTTPException(status_code=500, detail=f"OpenAI API error: {e}")

# ==================== Frontend Endpoints ====================
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "*"],  # Merged CORS origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
router = APIRouter()

@app.options("/api/options")
async def openai_options():
    return Response(status_code=200)


# ------------------- Audio Playback Toggle Endpoint -------------------
@app.post("/api/toggle-audio")
async def toggle_audio_playback():
    try:
        if audio_player.is_playing:
            audio_player.stop_stream()
            return {"audio_playing": False}
        else:
            audio_player.start_stream()
            return {"audio_playing": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to toggle audio playback: {str(e)}")


# ------------------- TTS Toggle Endpoint -------------------
@app.post("/api/toggle-tts")
async def toggle_tts():
    try:
        current_status = CONFIG["GENERAL_TTS"]["TTS_ENABLED"]
        CONFIG["GENERAL_TTS"]["TTS_ENABLED"] = not current_status
        return {"tts_enabled": CONFIG["GENERAL_TTS"]["TTS_ENABLED"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to toggle TTS: {str(e)}")

# ---------------- Unified WebSocket Endpoint ----------------
async def stream_stt_to_client(websocket: WebSocket):
    while True:
        recognized_text = stt_instance.get_speech_nowait()
        if recognized_text:
            # Send recognized STT text to client
            await websocket.send_json({"stt_text": recognized_text})
        await asyncio.sleep(0.05)

@app.websocket("/ws/chat")
async def unified_chat_websocket(websocket: WebSocket):
    await websocket.accept()
    print("Client connected to /ws/chat")

    # Start a background task that streams recognized STT text
    stt_task = asyncio.create_task(stream_stt_to_client(websocket))

    try:
        while True:
            # The client sends data as JSON (e.g., chat messages or STT commands)
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "start-stt":
                stt_instance.start_listening()
                await websocket.send_json({"is_listening": True})

            elif action == "pause-stt":
                stt_instance.pause_listening()
                await websocket.send_json({"is_listening": False})

            elif action == "chat":
                # Client is requesting a GPT completion
                messages = data.get("messages", [])

                # Validate & prepare the messages using the new function
                validated = await validate_messages_for_ws(messages)

                # Create queues for the chunk-processing + TTS
                phrase_queue = asyncio.Queue()
                audio_queue = asyncio.Queue()

                # **Pause STT before processing chat and starting TTS**
                stt_instance.pause_listening()
                await websocket.send_json({"stt_paused": True})
                conditional_print("STT paused before processing chat.", "segment")

                # Launch TTS and audio processing
                process_streams_task = asyncio.create_task(process_streams(phrase_queue, audio_queue))

                # Stream the OpenAI completion and send chunks back to client
                try:
                    async for content in stream_openai_completion(validated, phrase_queue):
                        # Each piece of content is sent over the same WebSocket
                        await websocket.send_json({"content": content})
                finally:
                    # Signal TTS to stop
                    await phrase_queue.put(None)
                    await process_streams_task

                    # **Resume STT after chat and TTS processing is complete**
                    stt_instance.start_listening()
                    await websocket.send_json({"stt_resumed": True})
                    conditional_print("STT resumed after processing chat.", "segment")

    except WebSocketDisconnect:
        print("Client disconnected from /ws/chat")
    except Exception as e:
        print(f"WebSocket error in unified_chat_websocket: {e}")
    finally:
        # Ensure we stop STT and cancel the background task
        stt_task.cancel()
        stt_instance.pause_listening()
        await websocket.close()

# ==================== Include Routers ====================
app.include_router(router)

# ==================== Main Execution ====================
if __name__ == '__main__':
    uvicorn.run(
        "main:app",  # Replace with your script name if different
        host="0.0.0.0",
        port=8000,
        reload=True  # Always enable auto-reload during development
    )