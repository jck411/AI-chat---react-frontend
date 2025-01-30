import os
import asyncio
import openai
from config import CONFIG, conditional_print
from typing import Optional
from asyncio import Queue, Event

async def frontend_openai_text_to_speech_processor(
    phrase_queue: Queue,
    websocket: any,  # WebSocket connection
    stop_event: Event,
    openai_client: Optional[openai.AsyncOpenAI] = None
):
    """
    Reads phrases from phrase_queue, calls OpenAI TTS streaming,
    and sends audio chunks to the frontend via WebSocket.
    """
    openai_client = openai_client or openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    try:
        model = CONFIG["TTS_MODELS"]["OPENAI_TTS"]["TTS_MODEL"]
        voice = CONFIG["TTS_MODELS"]["OPENAI_TTS"]["TTS_VOICE"]
        speed = CONFIG["TTS_MODELS"]["OPENAI_TTS"]["TTS_SPEED"]
        response_format = "mp3"  # Always use mp3 for frontend streaming
        chunk_size = CONFIG["TTS_MODELS"]["OPENAI_TTS"]["TTS_CHUNK_SIZE"]
    except KeyError as e:
        conditional_print(f"Missing OpenAI TTS config: {e}", "default")
        await websocket.send_json({"tts_end": True})
        return

    try:
        while True:
            if stop_event.is_set():
                conditional_print("Frontend OpenAI TTS stop_event is set. Exiting TTS loop.", "default")
                await websocket.send_json({"tts_end": True})
                return

            phrase = await phrase_queue.get()
            if phrase is None:
                conditional_print("Frontend OpenAI TTS received stop signal (None).", "default")
                await websocket.send_json({"tts_end": True})
                return

            stripped_phrase = phrase.strip()
            if not stripped_phrase:
                continue

            try:
                # Send start marker for this phrase
                await websocket.send_json({"tts_start": True, "text": stripped_phrase})

                async with openai_client.audio.speech.with_streaming_response.create(
                    model=model,
                    voice=voice,
                    input=stripped_phrase,
                    speed=speed,
                    response_format=response_format
                ) as response:
                    # First, collect all audio data
                    audio_data = bytearray()
                    async for chunk in response.iter_bytes(chunk_size):
                        if stop_event.is_set():
                            conditional_print("Frontend OpenAI TTS stop_event triggered mid-stream.", "default")
                            break
                        audio_data.extend(chunk)

                    if not stop_event.is_set():
                        # Send the complete audio data as base64
                        import base64
                        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
                        await websocket.send_json({
                            "tts_audio": audio_base64,
                            "format": response_format
                        })

                conditional_print("Frontend OpenAI TTS synthesis completed for phrase.", "default")

            except Exception as e:
                conditional_print(f"Frontend OpenAI TTS error: {e}", "default")
                await websocket.send_json({
                    "tts_error": str(e),
                    "text": stripped_phrase
                })

    except Exception as e:
        conditional_print(f"Frontend OpenAI TTS general error: {e}", "default")
        await websocket.send_json({"tts_error": str(e)})