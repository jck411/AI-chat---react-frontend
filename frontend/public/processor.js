// public/processor.js

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Configurable parameters
    this.config = {
      bufferSize: 4096,
      silenceThreshold: 0.01,
      channels: 1,
      sampleRate: 16000
    };

    // Initialize state
    this.buffer = new Float32Array(this.config.bufferSize);
    this.bufferIndex = 0;
    this.isSilent = true;
    this.consecutiveSilenceFrames = 0;
    this.silenceFrameThreshold = 10;

    // Add port message handling
    this.port.onmessage = (event) => {
      if (event.data.type === 'configure') {
        Object.assign(this.config, event.data.config);
        this.buffer = new Float32Array(this.config.bufferSize);
      }
    };
  }

  detectSilence(inputData) {
    let sum = 0;
    for (let i = 0; i < inputData.length; i++) {
      sum += Math.abs(inputData[i]);
    }
    const average = sum / inputData.length;
    return average < this.config.silenceThreshold;
  }

  processChunk(inputData) {
    const isSilent = this.detectSilence(inputData);

    if (isSilent) {
      this.consecutiveSilenceFrames++;
    } else {
      this.consecutiveSilenceFrames = 0;
    }

    // Only process if we have audio or haven't detected prolonged silence
    if (!isSilent || this.consecutiveSilenceFrames < this.silenceFrameThreshold) {
      const intData = new Int16Array(inputData.length);
      
      for (let i = 0; i < inputData.length; i++) {
        // Normalize and convert to 16-bit integer
        const sample = Math.max(-1, Math.min(1, inputData[i]));
        intData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      }

      try {
        this.port.postMessage(intData.buffer, [intData.buffer]);
      } catch (error) {
        console.error('Error sending audio data:', error);
      }
    }
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;

    const inputChannel = input[0];
    
    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer[this.bufferIndex] = inputChannel[i];
      this.bufferIndex++;

      if (this.bufferIndex >= this.config.bufferSize) {
        this.processChunk(this.buffer);
        this.buffer = new Float32Array(this.config.bufferSize);
        this.bufferIndex = 0;
      }
    }

    return true;
  }

  // Utility method to handle different sample rates
  resample(audioData, fromSampleRate, toSampleRate) {
    if (fromSampleRate === toSampleRate) {
      return audioData;
    }

    const ratio = fromSampleRate / toSampleRate;
    const newLength = Math.round(audioData.length / ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const pos = i * ratio;
      const index = Math.floor(pos);
      const fraction = pos - index;

      if (index + 1 < audioData.length) {
        result[i] = audioData[index] * (1 - fraction) + audioData[index + 1] * fraction;
      } else {
        result[i] = audioData[index];
      }
    }

    return result;
  }
}

registerProcessor('audio-processor', AudioProcessor);
