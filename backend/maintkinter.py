import os
import asyncio
import threading
import signal
import tkinter as tk
from tkinter import scrolledtext
from queue import Queue, Empty

import azure.cognitiveservices.speech as speechsdk
from dotenv import load_dotenv
from openai import AsyncOpenAI

# =============================
# Additional TTS Imports
# =============================
import pyaudio
import re
from typing import Any, Dict, List, Optional, Sequence, Union

# Load environment variables from .env file
load_dotenv()

# -----------------------------------------------------------------------------------
# TTS CONFIG + FUNCTIONS (from your second code snippet), now integrated into one file
# -----------------------------------------------------------------------------------

CONFIG = {
    "GENERAL_TTS": {
        "TTS_PROVIDER": "azure"  # Possible values: "openai", "azure"
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
    }
}

# Initialize PyAudio once (to avoid repeated inits)
try:
    pyaudio_instance = pyaudio.PyAudio()
except Exception as e:
    raise Exception(f"Failed to initialize PyAudio: {e}")

# ---------------------- PyAudio Playback ----------------------
def audio_player_sync(audio_queue: asyncio.Queue, playback_rate: int, loop: asyncio.AbstractEventLoop):
    """
    Synchronous audio player that reads from an asyncio queue
    and plays PCM data via PyAudio.
    """
    p = pyaudio.PyAudio()
    stream = None
    try:
        stream = p.open(
            format=pyaudio.paInt16,  # 16-bit PCM
            channels=1,             # Mono audio
            rate=playback_rate,     
            output=True
        )

        while True:
            future = asyncio.run_coroutine_threadsafe(audio_queue.get(), loop)
            try:
                audio_data = future.result()
            except Exception:
                break

            if audio_data is None:
                break  # signals end

            try:
                stream.write(audio_data)
            except Exception:
                break
    finally:
        if stream:
            stream.stop_stream()
            stream.close()
        p.terminate()

async def start_audio_player_async(audio_queue: asyncio.Queue, playback_rate: int, loop: asyncio.AbstractEventLoop):
    await asyncio.to_thread(audio_player_sync, audio_queue, playback_rate, loop)

# ----------------------- Azure TTS Processor -----------------------
class PushAudioOutputStreamCallback(speechsdk.audio.PushAudioOutputStreamCallback):
    def __init__(self, audio_queue: asyncio.Queue):
        super().__init__()
        self.audio_queue = audio_queue
        self.loop = asyncio.get_event_loop()

    def write(self, data: memoryview) -> int:
        # Schedules putting audio data on the queue in the event loop
        self.loop.call_soon_threadsafe(self.audio_queue.put_nowait, data.tobytes())
        return len(data)

    def close(self):
        self.loop.call_soon_threadsafe(self.audio_queue.put_nowait, None)

def create_ssml(phrase: str, voice: str, prosody: dict) -> str:
    return f"""
<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
    <voice name='{voice}'>
        <prosody rate='{prosody["rate"]}' pitch='{prosody["pitch"]}' volume='{prosody["volume"]}'>
            {phrase}
        </prosody>
    </voice>
</speak>
"""

async def azure_text_to_speech_processor(phrase_queue: asyncio.Queue, audio_queue: asyncio.Queue):
    """
    Continuously read text from phrase_queue, call Azure TTS, stream PCM bytes 
    into audio_queue for immediate playback.
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

        while True:
            phrase = await phrase_queue.get()
            if phrase is None:
                await audio_queue.put(None)
                return

            ssml_phrase = create_ssml(phrase, voice, prosody)
            push_stream_callback = PushAudioOutputStreamCallback(audio_queue)
            push_stream = speechsdk.audio.PushAudioOutputStream(push_stream_callback)
            audio_config = speechsdk.audio.AudioOutputConfig(stream=push_stream)

            synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=audio_config)
            result_future = synthesizer.speak_ssml_async(ssml_phrase)
            # run in executor to avoid blocking
            await asyncio.get_event_loop().run_in_executor(None, result_future.get)

    except Exception:
        # If any error, shut down audio
        await audio_queue.put(None)

# --------------------- OpenAI TTS Processor ----------------------
async def text_to_speech_processor(
    phrase_queue: asyncio.Queue,
    audio_queue: asyncio.Queue,
    openai_client: Optional[AsyncOpenAI] = None
):
    """
    If you were using OpenAI TTS directly, you'd handle it here. 
    (Keeping for completeness. You can remove if you only use Azure.)
    """
    openai_client = openai_client or AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    model = CONFIG["TTS_MODELS"]["OPENAI_TTS"]["TTS_MODEL"]
    voice = CONFIG["TTS_MODELS"]["OPENAI_TTS"]["TTS_VOICE"]
    speed = CONFIG["TTS_MODELS"]["OPENAI_TTS"]["TTS_SPEED"]
    response_format = CONFIG["TTS_MODELS"]["OPENAI_TTS"]["AUDIO_RESPONSE_FORMAT"]
    chunk_size = CONFIG["TTS_MODELS"]["OPENAI_TTS"]["TTS_CHUNK_SIZE"]

    try:
        while True:
            phrase = await phrase_queue.get()
            if phrase is None:
                await audio_queue.put(None)
                return

            stripped_phrase = phrase.strip()
            if not stripped_phrase:
                continue

            # This would call OpenAI TTS streaming. 
            # (Placeholder; not fully implemented in your snippet.)
            # ...
            # Example:
            # async with openai_client.audio.speech.with_streaming_response.create(...) as response:
            #     async for audio_chunk in response.iter_bytes(chunk_size):
            #         await audio_queue.put(audio_chunk)
            
            # Placeholder:
            await asyncio.sleep(1.0)

    except Exception:
        await audio_queue.put(None)

# --------------------- TTS + Audio Manager ----------------------
def extract_content_from_openai_chunk(chunk: Any) -> Optional[str]:
    """
    Extract partial text from an OpenAI streaming chunk.
    """
    try:
        return chunk.choices[0].delta.content
    except (IndexError, AttributeError):
        return None

def compile_delimiter_pattern(delimiters: List[str]) -> Optional[re.Pattern]:
    """
    Compile a regex for segmenting text by multiple delimiters.
    """
    if not delimiters:
        return None
    sorted_delimiters = sorted(delimiters, key=len, reverse=True)
    escaped_delimiters = map(re.escape, sorted_delimiters)
    pattern = "|".join(escaped_delimiters)
    return re.compile(pattern)

async def process_chunks(
    chunk_queue: asyncio.Queue,
    phrase_queue: asyncio.Queue,
    delimiter_pattern: Optional[re.Pattern],
    use_segmentation: bool,
    character_max: int
):
    """
    Reads raw chunks from chunk_queue, accumulates them into a working string, 
    and splits by delimiter to push into phrase_queue for TTS.
    """
    working_string = ""
    chars_processed = 0
    segmentation_active = use_segmentation

    while True:
        chunk = await chunk_queue.get()
        if chunk is None:
            # flush final leftover
            if working_string.strip():
                await phrase_queue.put(working_string.strip())
            await phrase_queue.put(None)
            break

        content = extract_content_from_openai_chunk(chunk)
        if content:
            working_string += content
            if segmentation_active and delimiter_pattern:
                while True:
                    match = delimiter_pattern.search(working_string)
                    if match:
                        end_index = match.end()
                        phrase = working_string[:end_index].strip()
                        if phrase:
                            await phrase_queue.put(phrase)
                            chars_processed += len(phrase)
                        working_string = working_string[end_index:]
                        if chars_processed >= character_max:
                            segmentation_active = False
                            break
                    else:
                        break

async def process_streams(phrase_queue: asyncio.Queue, audio_queue: asyncio.Queue):
    """
    Manages TTS + audio playback tasks.
    Chooses provider from CONFIG["GENERAL_TTS"]["TTS_PROVIDER"].
    """
    provider = CONFIG["GENERAL_TTS"]["TTS_PROVIDER"].lower()
    loop = asyncio.get_running_loop()

    if provider == "openai":
        tts_processor = text_to_speech_processor
        playback_rate = CONFIG["TTS_MODELS"]["OPENAI_TTS"]["PLAYBACK_RATE"]
    else:  # "azure" by default
        tts_processor = azure_text_to_speech_processor
        playback_rate = CONFIG["TTS_MODELS"]["AZURE_TTS"]["PLAYBACK_RATE"]

    # Create tasks for TTS and audio playback
    tts_task = asyncio.create_task(tts_processor(phrase_queue, audio_queue))
    audio_player_task = asyncio.create_task(start_audio_player_async(audio_queue, playback_rate, loop))

    await asyncio.gather(tts_task, audio_player_task)

# -----------------------------------------------------------------------------------
# Speech Recognizer Class (STT)
# -----------------------------------------------------------------------------------
class ContinuousSpeechRecognizer:
    def __init__(self):
        self.speech_key = os.getenv('AZURE_SPEECH_KEY')
        self.speech_region = os.getenv('AZURE_SPEECH_REGION')
        self.is_listening = True
        self.speech_queue = Queue()
        self.setup_recognizer()

    def setup_recognizer(self):
        if not self.speech_key or not self.speech_region:
            raise ValueError("Azure Speech Key or Region is not set.")

        speech_config = speechsdk.SpeechConfig(
            subscription=self.speech_key, 
            region=self.speech_region
        )
        speech_config.speech_recognition_language = "en-US"
        audio_config = speechsdk.audio.AudioConfig(use_default_microphone=True)
        
        self.speech_recognizer = speechsdk.SpeechRecognizer(
            speech_config=speech_config, 
            audio_config=audio_config
        )

        # Connect events
        self.speech_recognizer.recognized.connect(self.handle_result)
        self.speech_recognizer.session_started.connect(lambda evt: print('Listening...'))
        self.speech_recognizer.session_stopped.connect(lambda evt: print('Stopping...'))
        self.speech_recognizer.canceled.connect(lambda evt: print('Canceled...'))

    def handle_result(self, evt):
        if evt.result.text:
            self.speech_queue.put(evt.result.text)

    def start_listening(self):
        self.speech_recognizer.start_continuous_recognition()

    def stop_listening(self):
        self.speech_recognizer.stop_continuous_recognition()

    async def get_speech(self):
        try:
            return self.speech_queue.get_nowait()
        except Empty:
            return None

# -----------------------------------------------------------------------------------
# GPT streaming with TTS integration
# -----------------------------------------------------------------------------------
async def stream_gpt_response(
    client: AsyncOpenAI,
    messages: List[Dict[str, str]],
    gui_queue: Queue,
    chunk_queue: asyncio.Queue
):
    """
    Streams from OpenAI, places raw chunk data into 'chunk_queue' for TTS segmentation,
    and also sends partial text to the GUI.
    
    'gui_queue' is the queue that the Tkinter main thread uses to update the conversation area 
    with partial text. 
    """
    # We'll accumulate final text in assistant_response
    assistant_response = []

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            stream=True
        )

        first_chunk = True
        async for chunk in response:
            content = extract_content_from_openai_chunk(chunk)
            if content:
                assistant_response.append(content)

                # For the GUI, prepend "Assistant: " only for the first chunk
                if first_chunk:
                    partial_output = "Assistant: " + content
                    first_chunk = False
                else:
                    partial_output = content

                # Send partial text to GUI for immediate display
                gui_queue.put(("assistant", partial_output))

            # Also pass the chunk along to the chunk_queue for TTS segmentation
            await chunk_queue.put(chunk)

        # Signal we're done streaming
        await chunk_queue.put(None)

        return "".join(assistant_response)

    except Exception as e:
        print(f"Error in GPT streaming: {e}")
        await chunk_queue.put(None)
        return None

# -----------------------------------------------------------------------------------
# The Futuristic GUI
# -----------------------------------------------------------------------------------
class FuturisticGUI(tk.Tk):
    def __init__(self):
        super().__init__()
        
        # Basic window configuration
        self.title("STTChat")

        # Screen size
        screen_width = self.winfo_screenwidth()
        screen_height = self.winfo_screenheight()
        width_percentage = 100
        height_percentage = 100

        width = int(screen_width * width_percentage / 100)
        height = int(screen_height * height_percentage / 100)

        x = (screen_width - width) // 2
        y = (screen_height - height) // 2
        self.geometry(f"{width}x{height}+{x}+{y}")

        # Futuristic styling
        bg_color = "#1E1E1E"
        fg_color = "#00FFEA"
        font_name = "Arial"
        self.configure(bg=bg_color)

        # Header Frame
        self.header_frame = tk.Frame(self, bg=bg_color, height=50)
        self.header_frame.pack(fill=tk.X, side=tk.TOP)

        # Menu Button
        self.menu_button = tk.Menubutton(
            self.header_frame, 
            text="Menu", 
            font=(font_name, 14), 
            bg=fg_color, 
            fg=bg_color
        )
        self.menu_button.pack(side=tk.LEFT, padx=10)
        
        self.menu = tk.Menu(self.menu_button, tearoff=0)
        self.menu.add_command(label="Option 1", command=self.option1)
        self.menu.add_command(label="Option 2", command=self.option2)
        self.menu_button.configure(menu=self.menu)

        # Pause Button
        self.pause_button = tk.Button(
            self.header_frame, 
            text="Pause", 
            font=(font_name, 14), 
            bg="#FF0048", 
            fg="#FFFFFF", 
            command=self.toggle_listening
        )
        self.pause_button.pack(side=tk.LEFT, padx=10)

        # Fullscreen Toggle
        self.fullscreen = False
        self.fullscreen_button = tk.Button(
            self.header_frame,
            text="Fullscreen",
            font=(font_name, 14),
            bg=fg_color,
            fg=bg_color,
            command=self.toggle_fullscreen
        )
        self.fullscreen_button.pack(side=tk.RIGHT, padx=10)

        # Quit Button
        self.quit_button = tk.Button(
            self.header_frame, 
            text="Quit", 
            font=(font_name, 14, "bold"), 
            bg="#FF0048", 
            fg="#FFFFFF", 
            command=self.on_quit
        )
        self.quit_button.pack(side=tk.RIGHT, padx=10)

        # Conversation area
        self.conversation_area = scrolledtext.ScrolledText(
            self, 
            wrap=tk.WORD, 
            font=(font_name,14),
            bg="#2A2A2A", 
            fg=fg_color, 
            bd=0,
            padx=40, 
            pady=20
        )
        self.conversation_area.place(relx=0.5, rely=0.5, relwidth=0.8, relheight=0.7, anchor="center")

        # Status label
        self.status_label = tk.Label(
            self,
            text="Status: Listening",
            font=(font_name, 16),
            bg=bg_color,
            fg=fg_color
        )
        self.status_label.place(relx=0.1, rely=0.13, anchor="w")

        # Variables
        self.listening = True
        self.stop_event = threading.Event()
        self.speech_recognizer = None
        self.client = None
        self.messages = [{"role": "system", "content": "You are a helpful assistant."}]

        # GPT partial-chunks-to-GUI queue
        self.gpt_queue = Queue()  # (role, text)

        # We'll also keep TTS queues:
        self.chunk_queue = None
        self.phrase_queue = None
        self.audio_queue = None

        # Start background thread for async tasks
        self.bg_thread = threading.Thread(target=self.run_async_tasks, daemon=True)
        self.bg_thread.start()

        # Check queues periodically
        self.after(100, self.check_queues)

        # Bind ESC to exit fullscreen
        self.bind("<Escape>", self.escape_fullscreen)

    def toggle_fullscreen(self):
        self.fullscreen = not self.fullscreen
        self.attributes("-fullscreen", self.fullscreen)
        if self.fullscreen:
            self.fullscreen_button.config(text="Exit Fullscreen")
        else:
            self.fullscreen_button.config(text="Fullscreen")

    def escape_fullscreen(self, event):
        if self.fullscreen:
            self.toggle_fullscreen()

    def on_quit(self):
        self.stop_event.set()
        self.destroy()

    def toggle_listening(self):
        if self.listening:
            self.listening = False
            if self.speech_recognizer:
                self.speech_recognizer.stop_listening()
            self.pause_button.config(text="Resume")
            self.status_label.config(text="Status: Not Listening")
        else:
            self.listening = True
            if self.speech_recognizer:
                self.speech_recognizer.start_listening()
            self.pause_button.config(text="Pause")
            self.status_label.config(text="Status: Listening")

    def option1(self):
        print("Option 1 selected.")

    def option2(self):
        print("Option 2 selected.")

    def log_message(self, role, text):
        """
        Insert messages into the scrolled text widget.
        For partial assistant messages, we just insert as they arrive.
        """
        if role == "user":
            self.conversation_area.insert(tk.END, f"\nYou: {text}\n")
        elif role == "assistant":
            # partial streaming or final
            self.conversation_area.insert(tk.END, text)
        else:
            self.conversation_area.insert(tk.END, f"{role.title()}: {text}\n")
        self.conversation_area.see(tk.END)

    def check_queues(self):
        """
        Periodically check the gpt_queue for new partial text 
        to display in the conversation area.
        """
        try:
            while True:
                role, partial_text = self.gpt_queue.get_nowait()
                self.log_message(role, partial_text)
        except Empty:
            pass

        self.after(100, self.check_queues)

    def run_async_tasks(self):
        """
        Launch the main asyncio event loop for STT + GPT + TTS 
        so Tkinter doesn't block.
        """
        try:
            asyncio.run(self.main_async())
        except Exception as e:
            print(f"Async tasks ended with exception: {e}")

    async def main_async(self):
        # Setup OpenAI client
        openai_api_key = os.getenv("OPENAI_API_KEY")
        if not openai_api_key:
            raise ValueError("OpenAI API Key is not set.")
        self.client = AsyncOpenAI(api_key=openai_api_key)

        # Setup TTS queues
        self.chunk_queue = asyncio.Queue()
        self.phrase_queue = asyncio.Queue()
        self.audio_queue = asyncio.Queue()

        # Start the chunk_processor (to segment text for TTS)
        delimiter_pattern = compile_delimiter_pattern(CONFIG["PROCESSING_PIPELINE"]["DELIMITERS"])
        chunk_processor_task = asyncio.create_task(
            process_chunks(
                self.chunk_queue, 
                self.phrase_queue, 
                delimiter_pattern,
                CONFIG["PROCESSING_PIPELINE"]["USE_SEGMENTATION"],
                CONFIG["PROCESSING_PIPELINE"]["CHARACTER_MAXIMUM"]
            )
        )

        # Start TTS + audio in parallel
        tts_task = asyncio.create_task(process_streams(self.phrase_queue, self.audio_queue))

        # Setup and start the speech recognizer
        self.speech_recognizer = ContinuousSpeechRecognizer()
        self.speech_recognizer.start_listening()

        try:
            while not self.stop_event.is_set():
                await asyncio.sleep(0.1)

                if self.listening:
                    user_input = await self.speech_recognizer.get_speech()
                    if user_input:
                        # Log user input
                        self.log_message("user", user_input)

                        # Check for exit
                        if user_input.lower().strip() in ["exit", "quit"]:
                            self.log_message("system", "Goodbye!")
                            self.stop_event.set()
                            break

                        # Add user's message to conversation
                        self.messages.append({"role": "user", "content": user_input})

                        # Pause STT while we get GPT response
                        self.speech_recognizer.stop_listening()

                        # Stream GPT w/ partial text and TTS
                        full_response = await stream_gpt_response(
                            self.client,
                            self.messages,
                            self.gpt_queue,   # for GUI partial updates
                            self.chunk_queue # for TTS segmentation
                        )

                        # Resume STT
                        if self.listening:
                            self.speech_recognizer.start_listening()

                        if full_response:
                            self.messages.append({"role": "assistant", "content": full_response})

        finally:
            # Cleanup
            self.speech_recognizer.stop_listening()
            await self.chunk_queue.put(None)
            await tts_task
            await chunk_processor_task

# -----------------------------------------------------------------------------------
# Graceful Ctrl+C Handling
# -----------------------------------------------------------------------------------
def signal_handler(sig, frame):
    print("\nReceived interrupt signal. Cleaning up...")
    try:
        asyncio.get_event_loop().stop()
    except:
        pass

# -----------------------------------------------------------------------------------
# Main Entry
# -----------------------------------------------------------------------------------
if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)
    app = FuturisticGUI()
    app.mainloop()
