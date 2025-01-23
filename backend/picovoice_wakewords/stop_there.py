import pvporcupine
import pyaudio
import struct

def main():
    # Path to your wake word file
    keyword_path = "/home/jack/AI-chat---react-frontend/backend/picovoice_wakewords/stop-there_en_linux_v3_0_0/stop-there_en_linux_v3_0_0.ppn"

    # Initialize Porcupine
    porcupine = pvporcupine.create(access_key="N+YAYNt5aUoV1rlAQ8o9QN5qY8qOGtjW578y6GNCHqEW7LghT4HyKQ==", keyword_paths=[keyword_path])

    # Set up audio stream
    pa = pyaudio.PyAudio()
    audio_stream = pa.open(
        rate=porcupine.sample_rate,
        channels=1,
        format=pyaudio.paInt16,
        input=True,
        frames_per_buffer=porcupine.frame_length
    )

    print("Listening for the wake word...")

    try:
        while True:
            pcm = audio_stream.read(porcupine.frame_length, exception_on_overflow=False)
            pcm = struct.unpack_from("h" * porcupine.frame_length, pcm)

            # Process audio
            keyword_index = porcupine.process(pcm)
            if keyword_index >= 0:
                print("Wake word detected!")
                break
    except KeyboardInterrupt:
        print("Stopping...")
    finally:
        # Cleanup
        audio_stream.close()
        pa.terminate()
        porcupine.delete()

if __name__ == "__main__":
    main()
