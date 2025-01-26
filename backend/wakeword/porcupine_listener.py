# wakeword/porcupine_listener.py
import os
import struct
import threading
import requests
import pyaudio
import pvporcupine
from dotenv import load_dotenv

def listen_for_wake_words():
    """
    Continuously listens for multiple Porcupine keywords.
    Index 0 -> 'stop-there'
    Index 1 -> 'computer'
    """
    print("[WakeWord Thread] Starting multi-keyword detection...")

    load_dotenv()
    access_key = os.getenv("PORCUPINE_ACCESS_KEY")
    if not access_key:
        raise ValueError("PORCUPINE_ACCESS_KEY not found in .env file.")

    # Paths to your .ppn files
    stop_there_path = "/home/jack/ayyaihome/backend/wakeword/picovoice_wakewords/stop-there_en_linux_v3_0_0/stop-there_en_linux_v3_0_0.ppn"
    computer_path   = "/home/jack/ayyaihome/backend/wakeword/picovoice_wakewords/computer_en_linux_v3_0_0/computer_en_linux_v3_0_0.ppn"


    porcupine = pvporcupine.create(
        access_key=access_key,
        keyword_paths=[stop_there_path, computer_path]
    )

    pa = pyaudio.PyAudio()
    audio_stream = pa.open(
        rate=porcupine.sample_rate,
        channels=1,
        format=pyaudio.paInt16,
        input=True,
        frames_per_buffer=porcupine.frame_length
    )

    try:
        while True:
            pcm = audio_stream.read(porcupine.frame_length, exception_on_overflow=False)
            pcm = struct.unpack_from("h" * porcupine.frame_length, pcm)

            keyword_index = porcupine.process(pcm)
            # If no keyword is detected, keyword_index will be -1
            if keyword_index == 0:
                # "stop there" was detected
                print("[WakeWord Thread] Detected 'stop there' -> stopping TTS and generation.")
                try:
                    requests.post("http://localhost:8000/api/stop-tts")
                    requests.post("http://localhost:8000/api/stop-generation")
                except Exception as e:
                    print(f"[WakeWord Thread] Error calling stop endpoints: {e}")

            elif keyword_index == 1:
                # "computer" was detected
                print("[WakeWord Thread] Detected 'computer' -> starting STT if paused.")
                try:
                    requests.post("http://localhost:8000/api/start-stt")
                except Exception as e:
                    print(f"[WakeWord Thread] Error calling start-stt endpoint: {e}")

    except KeyboardInterrupt:
        print("[WakeWord Thread] Stopping on KeyboardInterrupt.")
    finally:
        audio_stream.close()
        pa.terminate()
        porcupine.delete()
        print("[WakeWord Thread] Exiting.")

def start_wake_word_thread():
    """
    Spawns a daemon thread that listens for wake words continuously.
    Call this in FastAPI's 'startup' event in main.py.
    """
    thread = threading.Thread(target=listen_for_wake_words, daemon=True)
    thread.start()
    print("[Startup] Wake word detection thread started.")
