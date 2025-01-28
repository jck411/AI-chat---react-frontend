const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const dotenv = require("dotenv");
const recorder = require('node-record-lpcm16');

dotenv.config();

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
if (!DEEPGRAM_API_KEY) {
    console.error("Deepgram API key not found in .env file.");
    process.exit(1);
}

async function main() {
    try {
        // Initialize the Deepgram client
        const deepgram = createClient(DEEPGRAM_API_KEY);

        // Create a connection to Deepgram
        const connection = await deepgram.listen.live({
            model: "nova-2",
            language: "en-US",
            smart_format: true,
            interim_results: true,
            encoding: "linear16",
            sample_rate: 16000,
        });

        // Listen for the connection to open
        connection.on(LiveTranscriptionEvents.Open, () => {
            console.log('Connected to Deepgram. Ready to transcribe.');
        });

        // Listen for transcription data
        connection.on(LiveTranscriptionEvents.Transcript, (data) => {
            const transcript = data.channel.alternatives[0].transcript;
            if (transcript) {
                console.log('Transcript:', transcript);
            }
        });

        // Handle any errors
        connection.on(LiveTranscriptionEvents.Error, (error) => {
            console.error('Error:', error);
        });

        // Start recording
        const recording = recorder.record({
            sampleRateHertz: 16000,
            channels: 1,
            audioType: 'raw',
        });

        // Pipe the audio data to Deepgram
        recording.stream().on('data', (chunk) => {
            if (connection.getReadyState() === 1) {
                connection.send(chunk);
            }
        });

        // Keep the process running
        process.stdin.resume();
        console.log("Press Ctrl+C to stop...");

        // Handle cleanup on exit
        process.on('SIGINT', () => {
            console.log('Cleaning up...');
            recording.stop();
            connection.finish();
            process.exit(0);
        });

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main();
