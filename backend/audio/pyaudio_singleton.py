# audio/pyaudio_singleton.py
import pyaudio

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
