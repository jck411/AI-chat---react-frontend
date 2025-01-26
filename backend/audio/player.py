# audio/player.py
import threading
import pyaudio

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
