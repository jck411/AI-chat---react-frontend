# main.py
import asyncio
import re
from typing import Any, AsyncIterator, Dict, List, Optional, Sequence, Union, Set

from fastapi import FastAPI, HTTPException, APIRouter, WebSocket, WebSocketDisconnect, Response
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from config import CONFIG, conditional_print, TTS_STOP_EVENT, GEN_STOP_EVENT
from audio.pyaudio_singleton import PyAudioSingleton
from audio.player import AudioPlayer
from stt.azure_stt import stt_instance
from tts.azure_tts import azure_text_to_speech_processor
from tts.openai_tts import openai_text_to_speech_processor
from tts.frontend_openai_tts import frontend_openai_text_to_speech_processor  
from tools.functions import (
    check_args,
    get_function_and_args,
    get_tools,
    get_available_functions
)
# Import the wake word thread starter
from wakeword.porcupine_listener import start_wake_word_thread

# Prepare PyAudio + AudioPlayer
pyaudio_instance = PyAudioSingleton()
audio_player = AudioPlayer(pyaudio_instance)

connected_websockets: Set[WebSocket] = set()
app = FastAPI()
router = APIRouter()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://192.168.1.226:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------- Broadcast STT state --------------
async def broadcast_stt_state():
    message = {"is_listening": stt_instance.is_listening}
    living_sockets = []
    for ws in list(connected_websockets):
        try:
            await ws.send_json(message)
            living_sockets.append(ws)
        except:
            pass
    connected_websockets.clear()
    connected_websockets.update(living_sockets)

# -------------- Shutdown Handler --------------
def shutdown():
    print("Shutting down server...")
    audio_player.stop_stream()
    PyAudioSingleton.terminate()
    print("Shutdown complete.")

# -------------- Audio Player Helper --------------
def audio_player_sync(
    audio_queue: asyncio.Queue,
    loop: asyncio.AbstractEventLoop,
    stop_event: asyncio.Event
):
    try:
        audio_player.start_stream()
        while True:
            if stop_event.is_set():
                print("TTS stop_event is set. Audio player will stop.")
                return

            future = asyncio.run_coroutine_threadsafe(audio_queue.get(), loop)
            audio_data = future.result()

            if audio_data is None:
                print("audio_player_sync received None (end of TTS).")
                return

            try:
                audio_player.write_audio(audio_data)
            except Exception as e:
                print(f"Audio playback error: {e}")
                return
    except Exception as e:
        print(f"audio_player_sync encountered an error: {e}")
    finally:
        audio_player.stop_stream()

async def start_audio_player_async(
    audio_queue: asyncio.Queue,
    loop: asyncio.AbstractEventLoop,
    stop_event: asyncio.Event
):
    await asyncio.to_thread(audio_player_sync, audio_queue, loop, stop_event)

# -------------- TTS Orchestrator --------------
async def process_streams(
    phrase_queue: asyncio.Queue,
    audio_queue: asyncio.Queue,
    stop_event: asyncio.Event,
    websocket: Optional[WebSocket] = None  # Add websocket parameter
):
    if not CONFIG["GENERAL_TTS"]["TTS_ENABLED"]:
        # TTS disabled => just consume the queue
        while True:
            phrase = await phrase_queue.get()
            if phrase is None:
                break
        return

    try:
        tts_output = CONFIG["GENERAL_TTS"].get("TTS_OUTPUT", "local")
        provider = CONFIG["GENERAL_TTS"]["TTS_PROVIDER"].lower()

        stt_instance.pause_listening()
        conditional_print("STT paused before starting TTS.", "segment")

        if tts_output == "frontend":
            if not websocket:
                raise ValueError("WebSocket connection required for frontend TTS")
            
            if provider == "openai":
                await frontend_openai_text_to_speech_processor(
                    phrase_queue,
                    websocket,
                    stop_event
                )
            else:
                raise ValueError(f"Frontend TTS not supported for provider: {provider}")
        else:  # local TTS
            if provider == "azure":
                tts_processor = azure_text_to_speech_processor
            elif provider == "openai":
                tts_processor = openai_text_to_speech_processor
            else:
                raise ValueError(f"Unsupported TTS provider: {provider}")

            loop = asyncio.get_running_loop()
            tts_task = asyncio.create_task(tts_processor(phrase_queue, audio_queue, stop_event))
            audio_player_task = asyncio.create_task(start_audio_player_async(audio_queue, loop, stop_event))
            conditional_print("Started TTS and audio playback tasks.", "default")
            await asyncio.gather(tts_task, audio_player_task)

        stt_instance.start_listening()
        conditional_print("STT resumed after completing TTS.", "segment")
        await broadcast_stt_state()

    except Exception as e:
        conditional_print(f"Error in process_streams: {e}", "default")
        stt_instance.start_listening()
        await broadcast_stt_state()

# -------------- Chat Streaming Helpers --------------
def extract_content_from_openai_chunk(chunk: Any) -> Optional[str]:
    try:
        return chunk.choices[0].delta.content
    except (IndexError, AttributeError):
        return None

def compile_delimiter_pattern(delimiters: List[str]) -> Optional[re.Pattern]:
    if not delimiters:
        return None
    sorted_delims = sorted(delimiters, key=len, reverse=True)
    escaped = [re.escape(d) for d in sorted_delims]
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

    while True:
        chunk = await chunk_queue.get()
        if chunk is None:
            # flush final leftover
            if working_string.strip():
                phrase = working_string.strip()
                await phrase_queue.put(phrase)
                conditional_print(f"Final Segment: {phrase}", "segment")
            await phrase_queue.put(None)
            break

        content = extract_content_from_openai_chunk(chunk)
        if content:
            working_string += content
            if use_segmentation and delimiter_pattern:
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
                            use_segmentation = False
                            break
                    else:
                        break

# -------------- OpenAI Completion Stream --------------
async def stream_openai_completion(
    messages: Sequence[Dict[str, Union[str, Any]]],
    phrase_queue: asyncio.Queue,
    client: Any,
    model_name: str
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
            model=model_name,
            messages=messages,
            tools=get_tools(),
            tool_choice="auto",
            stream=True,
            temperature=0.7,
            top_p=1.0,
        )

        tool_calls = []
        async for chunk in response:
            if GEN_STOP_EVENT.is_set():
                try:
                    await response.close()
                except Exception as e:
                    conditional_print(f"Error closing streaming response: {e}", "default")
                conditional_print("GEN_STOP_EVENT triggered mid-stream.", "default")
                break

            delta = chunk.choices[0].delta if chunk.choices and chunk.choices[0].delta else None
            if delta and delta.content:
                yield delta.content
                await chunk_queue.put(chunk)
            elif delta and delta.tool_calls:
                tc_list = delta.tool_calls
                for tc_chunk in tc_list:
                    while len(tool_calls) <= tc_chunk.index:
                        tool_calls.append({
                            "id": "",
                            "type": "function",
                            "function": {"name": "", "arguments": ""}
                        })

                    tc = tool_calls[tc_chunk.index]
                    if tc_chunk.id:
                        tc["id"] += tc_chunk.id
                    if tc_chunk.function.name:
                        tc["function"]["name"] += tc_chunk.function.name
                    if tc_chunk.function.arguments:
                        tc["function"]["arguments"] += tc_chunk.function.arguments

        # After streaming is done
        if not GEN_STOP_EVENT.is_set() and tool_calls:
            conditional_print("[Tool Calls Detected]:", "tool_call")
            for tc in tool_calls:
                conditional_print(str(tc), "tool_call")

            # Add them to messages so we can do a follow-up
            messages.append({"role": "assistant", "tool_calls": tool_calls})

            funcs = get_available_functions()
            for tool_call in tool_calls:
                try:
                    fn, fn_args = get_function_and_args(tool_call, funcs)
                    conditional_print(f"[Calling Function]: {fn.__name__}", "function_call")
                    conditional_print(f"[With Arguments]: {fn_args}", "function_call")

                    resp = fn(**fn_args)
                    conditional_print(f"[Function Output]: {resp}", "function_call")
                    messages.append({
                        "tool_call_id": tool_call["id"],
                        "role": "tool",
                        "name": fn.__name__,
                        "content": str(resp)
                    })
                except ValueError as e:
                    messages.append({"role": "assistant", "content": f"[Error]: {str(e)}"})

            # Follow up if still not stopped
            if not GEN_STOP_EVENT.is_set():
                follow_up = await client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    stream=True,
                    temperature=0.7,
                    top_p=1.0,
                )
                async for fu_chunk in follow_up:
                    if GEN_STOP_EVENT.is_set():
                        try:
                            await follow_up.close()
                        except Exception as e:
                            conditional_print(f"Error closing follow-up response: {e}", "default")
                        conditional_print("GEN_STOP_EVENT triggered mid-tool-call response.", "default")
                        break

                    content = extract_content_from_openai_chunk(fu_chunk)
                    if content:
                        yield content
                    await chunk_queue.put(fu_chunk)

        await chunk_queue.put(None)
        await chunk_processor_task

    except Exception as e:
        await chunk_queue.put(None)
        raise HTTPException(status_code=500, detail=f"OpenAI API error: {e}")

# -------------- REST Endpoints --------------
@app.options("/api/options")
async def openai_options():
    return Response(status_code=200)

@app.post("/api/start-stt")
async def start_stt_endpoint():
    if not stt_instance.is_listening:
        stt_instance.start_listening()
        await broadcast_stt_state()
    return {"detail": "STT is now ON."}

@app.post("/api/pause-stt")
async def pause_stt_endpoint():
    if stt_instance.is_listening:
        stt_instance.pause_listening()
        await broadcast_stt_state()
    return {"detail": "STT is now OFF."}

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

@app.post("/api/toggle-tts")
async def toggle_tts():
    try:
        current_status = CONFIG["GENERAL_TTS"]["TTS_ENABLED"]
        CONFIG["GENERAL_TTS"]["TTS_ENABLED"] = not current_status
        await broadcast_stt_state()
        return {"tts_enabled": CONFIG["GENERAL_TTS"]["TTS_ENABLED"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to toggle TTS: {str(e)}")

@app.post("/api/stop-tts")
async def stop_tts():
    TTS_STOP_EVENT.set()
    return {"detail": "TTS stop event triggered. Ongoing TTS tasks should exit soon."}

@app.post("/api/stop-generation")
async def stop_generation():
    GEN_STOP_EVENT.set()
    return {"detail": "Generation stop event triggered. Ongoing text generation will exit soon."}

# -------------- WebSocket: /ws/chat --------------
async def stream_stt_to_client(websocket: WebSocket):
    while True:
        recognized_text = stt_instance.get_speech_nowait()
        if recognized_text:
            await websocket.send_json({"stt_text": recognized_text})
        await asyncio.sleep(0.05)

def validate_message_list(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not isinstance(messages, list):
        raise HTTPException(status_code=400, detail="'messages' must be a list.")
    prepared = []
    for idx, msg in enumerate(messages):
        if not isinstance(msg, dict):
            raise HTTPException(status_code=400, detail=f"Message at index {idx} must be a dictionary.")
        sender = msg.get("sender")
        text = msg.get("text")
        if not sender or not isinstance(sender, str):
            raise HTTPException(status_code=400, detail=f"Message {idx} missing valid 'sender'.")
        if not text or not isinstance(text, str):
            raise HTTPException(status_code=400, detail=f"Message {idx} missing valid 'text'.")

        if sender.lower() == "user":
            role = "user"
        elif sender.lower() == "assistant":
            role = "assistant"
        else:
            raise HTTPException(status_code=400, detail=f"Invalid sender '{sender}' at index {idx}.")

        prepared.append({"role": role, "content": text})

    system_prompt = {
        "role": "system",
        "content": "You are a helpful assistant. Users live in Orlando, FL."
    }
    prepared.insert(0, system_prompt)
    return prepared

@app.websocket("/ws/chat")
async def unified_chat_websocket(websocket: WebSocket):
    await websocket.accept()
    print("Client connected to /ws/chat")
    connected_websockets.add(websocket)

    # Start a background task to push recognized STT text
    stt_task = asyncio.create_task(stream_stt_to_client(websocket))

    # Create an openai.AsyncOpenAI client on each new connection
    import os
    import openai
    from openai import AsyncOpenAI

    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        print("Warning: No OPENAI_API_KEY found in environment.")

    client = AsyncOpenAI(
        api_key=openai_api_key,
        base_url=CONFIG["API_SERVICES"]["openai"]["BASE_URL"]
    )
    model_name = CONFIG["API_SERVICES"]["openai"]["MODEL"]

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "start-stt":
                stt_instance.start_listening()
                await broadcast_stt_state()

            elif action == "pause-stt":
                stt_instance.pause_listening()
                await broadcast_stt_state()

            elif action == "chat":
                TTS_STOP_EVENT.clear()
                GEN_STOP_EVENT.clear()

                messages = data.get("messages", [])
                validated = validate_message_list(messages)

                phrase_queue = asyncio.Queue()
                audio_queue = asyncio.Queue()

                # Temporarily pause STT
                stt_instance.pause_listening()
                await broadcast_stt_state()
                conditional_print("STT paused before processing chat.", "segment")

                process_streams_task = asyncio.create_task(
                    process_streams(
                        phrase_queue,
                        audio_queue,
                        TTS_STOP_EVENT,
                        websocket  # Pass the websocket connection
                    )
                )

                # Stream the chat completion
                try:
                    async for content in stream_openai_completion(
                        validated,
                        phrase_queue,
                        client,
                        model_name
                    ):
                        if GEN_STOP_EVENT.is_set():
                            conditional_print("GEN_STOP_EVENT is set; halting chat stream to client.", "default")
                            break
                        await websocket.send_json({"content": content})
                finally:
                    # Signal TTS that there's no more text
                    await phrase_queue.put(None)
                    await process_streams_task

                    # Resume STT
                    stt_instance.start_listening()
                    await broadcast_stt_state()
                    conditional_print("STT resumed after processing chat.", "segment")

    except WebSocketDisconnect:
        print("Client disconnected from /ws/chat")
    except Exception as e:
        print(f"WebSocket error in /ws/chat: {e}")
    finally:
        stt_task.cancel()
        connected_websockets.discard(websocket)
        stt_instance.pause_listening()
        await broadcast_stt_state()
        try:
            await websocket.close()
        except:
            pass

@app.on_event("startup")
def on_startup():
    # Start the wake word detection thread
    start_wake_word_thread()

@app.on_event("shutdown")
def on_shutdown():
    shutdown()

app.include_router(router)

if __name__ == '__main__':
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
