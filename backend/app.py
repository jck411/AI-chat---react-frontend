import os
import asyncio
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import azure.cognitiveservices.speech as speechsdk
from dotenv import load_dotenv
import logging

load_dotenv()

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Update according to your frontend's origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include existing routers
from endpoints.openai import openai_router
from endpoints.stop import stop_router
from endpoints.anthropic import anthropic_router

app.include_router(openai_router)
app.include_router(stop_router)
app.include_router(anthropic_router)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure Azure Speech SDK
speech_config = speechsdk.SpeechConfig(
    subscription=os.getenv('SPEECH_KEY'),
    region=os.getenv('SPEECH_REGION')
)
speech_config.speech_recognition_language = "en-US"
speech_config.set_property(
    property_id=speechsdk.PropertyId.SpeechServiceResponse_DiarizeIntermediateResults,
    value='true'
)

# Initialize audio config for default microphone
audio_config = speechsdk.audio.AudioConfig(use_default_microphone=True)

async def process_conversation_transcription(websocket: WebSocket, queue: asyncio.Queue):
    conversation_transcriber = speechsdk.transcription.ConversationTranscriber(
        speech_config=speech_config,
        audio_config=audio_config
    )

    def transcribed_cb(evt: speechsdk.SpeechRecognitionEventArgs):
        if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
            queue.put_nowait({
                "type": "transcribed",
                "text": evt.result.text,
                "speaker_id": evt.result.speaker_id
            })

    def transcribing_cb(evt: speechsdk.SpeechRecognitionEventArgs):
        if evt.result.text:
            queue.put_nowait({
                "type": "transcribing",
                "text": evt.result.text,
                "speaker_id": evt.result.speaker_id
            })

    def session_started_cb(evt: speechsdk.SessionEventArgs):
        queue.put_nowait({
            "type": "info",
            "message": "Session started"
        })

    def session_stopped_cb(evt: speechsdk.SessionEventArgs):
        queue.put_nowait({
            "type": "info",
            "message": "Session stopped"
        })

    def canceled_cb(evt: speechsdk.SessionEventArgs):
        queue.put_nowait({
            "type": "info",
            "message": f"Canceled: {evt.cancellation_details.reason}"
        })

    conversation_transcriber.transcribed.connect(transcribed_cb)
    conversation_transcriber.transcribing.connect(transcribing_cb)
    conversation_transcriber.session_started.connect(session_started_cb)
    conversation_transcriber.session_stopped.connect(session_stopped_cb)
    conversation_transcriber.canceled.connect(canceled_cb)

    # Send starting message as JSON
    await websocket.send_json({"type": "info", "message": "Starting conversation transcription..."})
    conversation_transcriber.start_transcribing_async()

    try:
        while True:
            data = await queue.get()
            await websocket.send_json(data)
    except asyncio.CancelledError:
        # Send stopping message as JSON
        await websocket.send_json({"type": "info", "message": "Conversation transcription stopped."})
    finally:
        conversation_transcriber.stop_transcribing_async()

@app.websocket("/ws/stt")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket /ws/stt connection accepted")
    queue = asyncio.Queue()

    transcription_task = asyncio.create_task(process_conversation_transcription(websocket, queue))

    try:
        while True:
            data = await websocket.receive_text()
            if data == "stop":
                break
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        transcription_task.cancel()
        try:
            await transcription_task
        except asyncio.CancelledError:
            pass
        logger.info("WebSocket /ws/stt connection closed")

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000)
