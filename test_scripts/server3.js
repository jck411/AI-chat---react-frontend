const express = require("express");
const OpenAI = require("openai");
const dotenv = require("dotenv");
const { execSync, spawn } = require("child_process");
const { PassThrough } = require("stream");

dotenv.config();
const app = express();
const PORT = 3000;

const openai = new OpenAI({
apiKey: process.env.OPENAI_API_KEY,
dangerouslyAllowBrowser: false,
});

// Helper to kill anything on the port
function killPort(port) {
try {
const pid = execSync(`lsof -t -i:${port}`).toString().trim();
if (pid) {
console.log(`🔴 Killing process on port ${port} (PID: ${pid})...`);
execSync(`kill -9 ${pid}`);
}
} catch (err) {
console.log(`✅ No existing process on port ${port}`);
}
}

killPort(PORT);

/**
 * Convert a readable stream (from openai.audio.speech.create) into a single Buffer.
 * This way, TTS can be fetched in parallel, and by the time we need to play it, 
 * the entire audio is already ready to go.
 */
async function streamToBuffer(stream) {
const chunks = [];
for await (const chunk of stream) {
chunks.push(chunk);
}
return Buffer.concat(chunks);
}

/**
 * A queue for audio buffers (already TTS-generated).
 * We'll feed them one by one into ffplay so they play in the correct sequence.
 */
class AudioQueue {
constructor() {
this.queue = [];
this.processing = false;

// A PassThrough pipeline feeding into a single ffplay process
this.audioStream = new PassThrough();
this.ffplay = spawn("ffplay", ["-nodisp", "-autoexit", "-"], {
stdio: ["pipe", "ignore", "ignore"], // Redirect standard and error output to ignore
});
// Pipe from our pass-through stream into ffplay's stdin
this.audioStream.pipe(this.ffplay.stdin);
}

/**
 * Enqueue a Buffer that already contains TTS data 
 */
enqueueAudioBuffer(buffer) {
this.queue.push(buffer);
if (!this.processing) {
this.processQueue();
}
}

async processQueue() {
if (this.queue.length === 0) {
this.processing = false;
return;
}
this.processing = true;

// Grab the next chunk
const audioBuffer = this.queue.shift();

// Write that audio data into the audioStream, wait for the 'drain' event
// so we don't keep going until ffplay is done with it
await new Promise((resolve) => {
const canWrite = this.audioStream.write(audioBuffer);
if (canWrite) {
// Even if 'write' returns true, we should wait a bit 
// to ensure there's time to play
setTimeout(resolve, 100);
} else {
// If the internal buffer is full, wait for drain
this.audioStream.once("drain", () => {
setTimeout(resolve, 100);
});
}
});

// ffplay automatically exits after playing a buffer, but we keep the process alive.
// We'll let the queue move on to the next buffer after some short delay
// so we don't cut anything off. The smaller the chunk, the smaller gap you need.
setTimeout(() => {
// Proceed to the next item in the queue
this.processQueue();
}, 100); // 100ms gap. Adjust as needed for better flow
}
}

const audioQueue = new AudioQueue();

async function streamTextAndSpeech() {
try {
const gptStream = await openai.chat.completions.create({
model: "gpt-4",
messages: [{ role: "user", content: "Tell me a long story" }],
stream: true,
});

let workingString = "";

for await (const chunk of gptStream) {
const textChunk = chunk.choices[0]?.delta?.content;
if (!textChunk) continue;

// Immediately write text to terminal 
process.stdout.write(textChunk);
workingString += textChunk;

// If we see a delimiter, let's call that the end of a sentence.
if (workingString.length >= 50 && /[.!?]\s+/.test(workingString)) {
// Extract the phrase, trim, then reset.
const phraseToSpeak = workingString.trim();
workingString = "";

// Start TTS generation right now (in parallel)
(async () => {
try {
console.log(`\n🎙️ Generating TTS for: ${phraseToSpeak}`);
const ttsResponse = await openai.audio.speech.create({
model: "tts-1",
voice: "nova",
input: phraseToSpeak,
format: "opus",
});
const audioData = await streamToBuffer(ttsResponse.body);

console.log(`✅ Enqueueing audio. Length: ${audioData.length} bytes`);
audioQueue.enqueueAudioBuffer(audioData);
} catch (error) {
console.error("TTS Error:", error);
}
})();
}
}

// Handle leftover if GPT ends without punctuation
if (workingString.trim().length > 0) {
const phraseToSpeak = workingString.trim();
(async () => {
try {
console.log(`\n🎙️ Generating TTS for leftover: ${phraseToSpeak}`);
const ttsResponse = await openai.audio.speech.create({
model: "tts-1",
voice: "nova",
input: phraseToSpeak,
format: "opus",
});
const audioData = await streamToBuffer(ttsResponse.body);

console.log(`✅ Enqueueing leftover audio. Length: ${audioData.length} bytes`);
audioQueue.enqueueAudioBuffer(audioData);
} catch (error) {
console.error("TTS Error:", error);
}
})();
}
} catch (error) {
console.error("Error:", error);
}
}

process.on("SIGINT", () => {
console.log("\n🔴 Server shutting down...");
killPort(PORT);
process.exit();
});

app.listen(PORT, async () => {
console.log(`🚀 Server running on port ${PORT}`);
await streamTextAndSpeech();
});