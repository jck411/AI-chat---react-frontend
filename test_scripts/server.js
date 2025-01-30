const express = require("express");
const OpenAI = require("openai");
const dotenv = require("dotenv");
const { execSync, spawn } = require("child_process");
const { PassThrough } = require("stream");

dotenv.config();
const app = express();
const PORT = 3000;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: false,
});

// Kill any process using the port before starting the server.
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

killPort(PORT); // Ensure port is free before starting the server

// TTS Queue with warm-up and caching
class TTSQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.audioStream = new PassThrough();
    this.phraseCache = new Map(); // Cache for repeated phrases

    // Keep ffplay always running to reduce startup delay
    this.ffplay = spawn("ffplay", ["-nodisp", "-autoexit", "-"], {
      stdio: ["pipe", "ignore", "ignore"],
    });
    this.audioStream.pipe(this.ffplay.stdin);
  }

  enqueue(phrase) {
    if (this.phraseCache.has(phrase)) {
      const cachedAudio = this.phraseCache.get(phrase);
      this.queue.push({ phrase, audio: cachedAudio });
    } else {
      this.queue.push({ phrase, audio: null });
    }
    this.processQueue();
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const { phrase, audio } = this.queue.shift();

    try {
      console.log(`\n🎙️ Speaking: ${phrase}`);

      let audioStream;
      if (audio) {
        audioStream = audio;
      } else {
        const startTime = Date.now();
        const ttsResponse = await openai.audio.speech.create({
          model: "tts-1",
          voice: "nova",
          input: phrase,
          format: "opus",
        });
        const ttsTime = Date.now() - startTime;
        console.log(`🕒 TTS Generation Time: ${ttsTime}ms`);

        audioStream = ttsResponse.body;
        this.phraseCache.set(phrase, audioStream); // Cache the audio
      }

      await this.playAudio(audioStream);
    } catch (error) {
      console.error("TTS Error:", error);
    }

    this.processing = false;
    if (this.queue.length > 0) {
      this.processQueue();
    }
  }

  async playAudio(audioStream) {
    return new Promise((resolve) => {
      audioStream.pipe(this.audioStream, { end: false });
      audioStream.on("end", resolve);
    });
  }
}

// Initialize TTS queue
const ttsQueue = new TTSQueue();

// Function to warm up the TTS system
async function warmUpTTS() {
  try {
    await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: "Warm-up phrase",
      format: "opus",
    });
    console.log("✅ TTS warm-up completed.");
  } catch (error) {
    console.error("TTS Warm-up Error:", error);
  }
}

// Streams GPT-generated text and enqueues smooth, low-latency TTS playback
async function streamTextAndSpeech() {
  try {
    const gptStream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Tell me a long story" }],
      stream: true,
    });

    let workingString = "";

    for await (const chunk of gptStream) {
      const textChunk = chunk.choices[0]?.delta?.content;
      if (!textChunk) continue;

      process.stdout.write(textChunk); // Print streamed text immediately
      workingString += textChunk;

      // If sentence is complete, send it to TTS immediately
      if (/[.?!]\s*$/.test(workingString)) {
        const phraseToSpeak = workingString.trim();
        workingString = ""; // Reset for next phrase
        ttsQueue.enqueue(phraseToSpeak);
      }
    }

    // Process final text if anything remains
    if (workingString.trim().length > 0) {
      ttsQueue.enqueue(workingString.trim());
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

// Gracefully handle shutdown
process.on("SIGINT", () => {
  console.log("\n🔴 Server shutting down...");
  killPort(PORT);
  process.exit();
});

app.listen(PORT, async () => {
  await warmUpTTS(); // Warm up TTS before starting the streaming
  await streamTextAndSpeech(); // Start text and TTS streaming
});
