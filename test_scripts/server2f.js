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

class TTSQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.audioStream = new PassThrough();
    
    this.ffplay = spawn("ffplay", ["-nodisp", "-autoexit", "-"], {
      stdio: ["pipe", "ignore", "ignore"],
    });
    this.audioStream.pipe(this.ffplay.stdin);
  }

  enqueue(phrase) {
    this.queue.push(phrase);
    if (!this.processing) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const phrase = this.queue.shift();

    try {
      console.log(`\n🎙️ Speaking: ${phrase}`);
      const ttsResponse = await openai.audio.speech.create({
        model: "tts-1",
        voice: "nova",
        input: phrase,
        format: "opus",
      });

      await new Promise((resolve) => {
        ttsResponse.body.pipe(this.audioStream, { end: false });
        ttsResponse.body.on("end", resolve);
      });
    } catch (error) {
      console.error("TTS Error:", error);
    }

    this.processing = false;
    if (this.queue.length > 0) {
      this.processQueue();
    }
  }
}

const ttsQueue = new TTSQueue();

async function streamTextAndSpeech() {
  try {
    const gptStream = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: "Tell me a long story" }],
      stream: true,
    });

    let workingString = "";
    let firstDelimiterHit = false;

    // Set up text streaming
    for await (const chunk of gptStream) {
      const textChunk = chunk.choices[0]?.delta?.content;
      if (!textChunk) continue;

      // Immediately print text chunk
      process.stdout.write(textChunk);
      workingString += textChunk;

      // Check for delimiter
      if (/[.!?]\s*/.test(workingString)) {
        const phraseToSpeak = workingString.trim();
        workingString = "";

        if (!firstDelimiterHit) {
          firstDelimiterHit = true;
          // Start first TTS immediately in background
          ttsQueue.enqueue(phraseToSpeak);
        } else {
          ttsQueue.enqueue(phraseToSpeak);
        }
      }
    }

    // Handle any remaining text
    if (workingString.trim().length > 0) {
      ttsQueue.enqueue(workingString.trim());
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
