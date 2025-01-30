import React, { useState, useEffect } from 'react';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import './DeepgramComponent.css'; // We'll create this next

const DeepgramComponent = () => {
  const [transcription, setTranscription] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [connection, setConnection] = useState(null);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [transcriptionData, setTranscriptionData] = useState([]);
  const [error, setError] = useState(null);
  const [mediaRecorderInstance, setMediaRecorderInstance] = useState(null);
  // eslint-disable-next-line no-unused-vars
const [audioChunks, setAudioChunks] = useState([]);
  
  const [config, setConfig] = useState({
    mode: 'live', // 'live' or 'prerecorded'
    model: 'nova-2', // Updated default model
    features: {
      // Basic features
      smartFormat: true,
      punctuate: true,
      diarize: false,
      interim: true,
      numerals: true,
      profanityFilter: false,
      language: 'en-US',
      utteranceEndMs: 1000,
      
      // Intelligence features
      detectTopics: false,
      detectEntities: false,
      summarize: false,
      utteranceSplit: false,
      paragraphs: false,
      keywords: false,
      sentiment: false,
      
      // Additional features
      search: '',  // For keyword search
      replace: [], // For word replacement
      redact: [],  // For redaction
      tag: []      // For custom tagging
    }
  });
  
  // Add state for file upload
  const [audioFile, setAudioFile] = useState(null);
  

  useEffect(() => {
    return () => {
      if (connection) {
        connection.finish();
      }
      if (mediaRecorder) {
        const { stream, audioContext, source, workletNode } = mediaRecorder;
        
        // First disconnect nodes
        workletNode?.disconnect();
        source?.disconnect();
        
        // Close AudioContext only if it exists and isn't already closed
        if (audioContext) {
          // Check state and use try-catch to handle any potential errors
          try {
            if (audioContext.state !== 'closed') {
              audioContext.close().catch(err => {
                console.log('AudioContext close error:', err);
              });
            }
          } catch (err) {
            console.log('AudioContext error:', err);
          }
        }
        
        // Stop all tracks
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
      }
    };
  }, [connection, mediaRecorder]);
  

  const getModelDescription = (model) => {
    const descriptions = {
      'nova-2': 'Best for everyday audio processing',
      'nova-2-meeting': 'Optimized for multi-speaker meetings',
      'nova-2-phonecall': 'Optimized for phone calls and low-bandwidth audio',
      'nova-2-medical': 'Specialized for medical terminology',
      'nova': 'Previous generation general purpose model',
      'nova-meeting': 'Previous generation meeting model',
      'nova-phonecall': 'Previous generation phone call model',
      'base': 'Basic transcription model',
      'base-meeting': 'Basic meeting transcription',
      'base-phonecall': 'Basic phone call transcription',
      'enhanced': 'Enhanced base model',
      'whisper': 'OpenAI Whisper model integration',
      'whisper-medium': 'Medium-sized Whisper model',
      'whisper-large': 'Large Whisper model with highest accuracy'
    };
    
    return descriptions[model] || 'Model description not available';
  };

  const ModelSelection = () => {
    const models = {
      'Nova-2 Models': [
        { value: 'nova-2', label: 'Nova-2 General' },
        { value: 'nova-2-meeting', label: 'Nova-2 Meeting' },
        { value: 'nova-2-phonecall', label: 'Nova-2 Phone Call' },
        { value: 'nova-2-medical', label: 'Nova-2 Medical' }
      ],
      'Nova Models': [
        { value: 'nova', label: 'Nova General' },
        { value: 'nova-meeting', label: 'Nova Meeting' },
        { value: 'nova-phonecall', label: 'Nova Phone Call' }
      ],
      'Base Models': [
        { value: 'base', label: 'Base' },
        { value: 'base-meeting', label: 'Base Meeting' },
        { value: 'base-phonecall', label: 'Base Phone Call' },
        { value: 'enhanced', label: 'Enhanced' }
      ],
      'Whisper Models': [
        { value: 'whisper', label: 'Whisper' },
        { value: 'whisper-medium', label: 'Whisper Medium' },
        { value: 'whisper-large', label: 'Whisper Large' }
      ]
    };

    return (
      <div className="config-section">
        <label>Model:</label>
        <select 
          value={config.model}
          onChange={(e) => setConfig({...config, model: e.target.value})}
          className="model-select"
        >
          {Object.entries(models).map(([category, modelOptions]) => (
            <optgroup label={category} key={category}>
              {modelOptions.map(model => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <small className="helper-text">
          {getModelDescription(config.model)}
        </small>
      </div>
    );
  };

  const ConfigPanel = () => {
    const featureCategories = {
      basic: {
        title: 'Basic Features',
        features: {
          smartFormat: 'Smart Format',
          punctuate: 'Punctuate',
          diarize: 'Speaker Diarization',
          interim: 'Interim Results',
          numerals: 'Convert Numbers to Digits',
          profanityFilter: 'Profanity Filter'
        }
      },
      intelligence: {
        title: 'Intelligence Features',
        features: {
          detectTopics: 'Topic Detection',
          detectEntities: 'Entity Detection',
          summarize: 'Summarization',
          utteranceSplit: 'Utterance Split',
          paragraphs: 'Paragraphs',
          keywords: 'Keyword Extraction',
          sentiment: 'Sentiment Analysis'
        }
      }
    };
  
    return (
      <div className="config-panel">
        <h3>Transcription Settings</h3>
        
        <ModelSelection />
        
        {/* Mode Selection */}
        <div className="config-section">
          <label>Mode:</label>
          <select 
            value={config.mode} 
            onChange={(e) => setConfig({...config, mode: e.target.value})}
          >
            <option value="live">Live Streaming</option>
            <option value="prerecorded">Pre-recorded Audio</option>
          </select>
        </div>

        {/* Language Selection */}
        <div className="config-section">
          <label>Language:</label>
          <select 
            value={config.features.language} 
          onChange={(e) => setConfig({
            ...config,
            features: {...config.features, language: e.target.value}
          })}
        >
          <option value="en-US">English (US)</option>
          <option value="pl">Polish</option>
          <option value="hr">Croatian</option>
        </select>
      </div>
  
        {/* Show basic features for both modes */}
        <div className="feature-category">
          <h4>Basic Features</h4>
          <div className="config-features">
            {Object.entries(featureCategories.basic.features).map(([key, label]) => (
              <label key={key} className="feature-toggle">
                <input
                  type="checkbox"
                  checked={config.features[key]}
                  onChange={() => setConfig({
                    ...config,
                    features: {
                      ...config.features,
                      [key]: !config.features[key]
                    }
                  })}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
  
        {/* Show intelligence features only for pre-recorded mode */}
        {config.mode === 'prerecorded' && (
          <>
            <div className="feature-category">
              <h4>Intelligence Features</h4>
              <div className="config-features">
                {Object.entries(featureCategories.intelligence.features).map(([key, label]) => (
                  <label key={key} className="feature-toggle">
                    <input
                      type="checkbox"
                      checked={config.features[key]}
                      onChange={() => setConfig({
                        ...config,
                        features: {
                          ...config.features,
                          [key]: !config.features[key]
                        }
                      })}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
  
            {/* Advanced Features */}
            <div className="advanced-features">
              <h4>Advanced Features</h4>
              
              <div className="config-section">
                <label>Keyword Search:</label>
                <input 
                  type="text" 
                  value={config.features.search}
                  onChange={(e) => setConfig({
                    ...config,
                    features: {...config.features, search: e.target.value}
                  })}
                  placeholder="Enter keywords to search"
                />
              </div>

              <div className="config-section">
                <label>Word Replacement:</label>
                <input 
                  type="text" 
                  placeholder="Format: word1:replacement1,word2:replacement2"
                  onChange={(e) => {
                    const pairs = e.target.value.split(',')
                      .map(pair => {
                        const [word, replacement] = pair.split(':');
                        return word && replacement ? { word: word.trim(), replacement: replacement.trim() } : null;
                      })
                      .filter(pair => pair !== null);
                    
                    setConfig({
                      ...config,
                      features: {
                        ...config.features,
                        replace: pairs
                      }
                    });
                  }}
                />
              </div>

              <div className="config-section">
                <label>Redact Words:</label>
                <input 
                  type="text" 
                  placeholder="Comma-separated words to redact"
                  onChange={(e) => setConfig({
                    ...config,
                    features: {
                      ...config.features,
                      redact: e.target.value.split(',').map(word => word.trim()).filter(word => word)
                    }
                  })}
                />
              </div>

              <div className="config-section">
                <label>Custom Tags:</label>
                <input 
                  type="text" 
                  placeholder="tag1:value1,tag2:value2"
                  onChange={(e) => {
                    const tags = e.target.value.split(',')
                      .map(pair => {
                        const [tag, value] = pair.split(':');
                        return tag && value ? { tag: tag.trim(), value: value.trim() } : null;
                      })
                      .filter(tag => tag !== null);
                    
                    setConfig({
                      ...config,
                      features: {
                        ...config.features,
                        tag: tags
                      }
                    });
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  const startRecording = async () => {
    try {
      if (!process.env.REACT_APP_DEEPGRAM_API_KEY) {
        throw new Error('Deepgram API key is not configured');
      }

      const deepgram = createClient(process.env.REACT_APP_DEEPGRAM_API_KEY);
      console.log('Deepgram client created');

      const dgConnection = await deepgram.listen.live({
        model: config.model,
        language: config.features.language,
        smart_format: config.features.smartFormat,
        punctuate: config.features.punctuate,
        diarize: config.features.diarize,
        interim_results: config.features.interim,
        numerals: config.features.numerals,
        profanity_filter: config.features.profanityFilter,
        encoding: "linear16",
        sample_rate: 16000,
        channels: 1,
        endpointing: true,
        utterance_end_ms: config.features.utteranceEndMs,
        words: true
      });

      dgConnection.on(LiveTranscriptionEvents.Open, () => {
        console.log('Connection established');
      });

      dgConnection.on(LiveTranscriptionEvents.Close, () => {
        console.log('Connection closed');
        if (isRecording) {
          stopRecording();
        }
      });

      dgConnection.on(LiveTranscriptionEvents.Warning, (warning) => {
        console.warn('Warning:', warning);
      });

      dgConnection.on(LiveTranscriptionEvents.Metadata, (metadata) => {
        console.log('Metadata:', metadata);
      });

      dgConnection.on(LiveTranscriptionEvents.Transcript, (data) => {
        if (data.is_final) {
          const transcript = data.channel.alternatives[0];
          
          // Store all transcript data
          setTranscriptionData(prev => [...prev, {
            text: transcript.transcript,
            confidence: transcript.confidence,
            words: transcript.words,
            entities: transcript.entities,
            topics: transcript.topics,
            timestamp: new Date().toISOString()
          }]);

          // Update displayed transcription
          setTranscription(prev => {
            const newText = transcript.transcript;
            return `${prev} ${newText}`.trim();
          });

          // Log word-level timing if available
          if (transcript.words) {
            transcript.words.forEach(word => {
              console.log(`Word: ${word.word}, Start: ${word.start}, End: ${word.end}`);
            });
          }
        }
      });

      dgConnection.addListener('error', (error) => {
        console.error('Deepgram connection error:', error);
        setError(error.message);
        stopRecording();
      });

      setConnection(dgConnection);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      }).catch(err => {
        throw new Error(`Microphone access error: ${err.message}`);
      });

      const audioContext = new AudioContext({
        sampleRate: 16000,
      });

      await audioContext.audioWorklet.addModule('/processor.js');
      
      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');

      workletNode.port.onmessage = (event) => {
        if (dgConnection.getReadyState() === 1) {
          const audioData = new Int16Array(event.data);
          try {
            dgConnection.send(audioData);
          } catch (err) {
            console.error('Error sending audio:', err);
          }
        }
      };

      source.connect(workletNode);
      workletNode.connect(audioContext.destination);

      setIsRecording(true);
      setMediaRecorder({ stream, audioContext, source, workletNode });
      setError(null);

    } catch (error) {
      console.error('Error starting recording:', error);
      setError(error.message);
      stopRecording();
    }
  };

  const stopRecording = () => {
    try {
      if (connection) {
        connection.finish();
        setConnection(null);
      }
  
      if (mediaRecorder) {
        const { stream, audioContext, source, workletNode } = mediaRecorder;
        
        workletNode?.disconnect();
        source?.disconnect();
        
        // Add check for AudioContext state before closing
        if (audioContext && audioContext.state !== 'closed') {
          audioContext.close();
        }
        
        stream?.getTracks().forEach(track => track.stop());
        setMediaRecorder(null);
      }
  
      setIsRecording(false);
    } catch (error) {
      console.error('Error stopping recording:', error);
      setError(error.message);
    }
  };
  
  const startPreRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      const options = {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      };
      
      const mediaRecorder = new MediaRecorder(stream, options);
      const chunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        setAudioFile(audioBlob);
        await handlePrerecordedAudio(audioBlob);
      };

      mediaRecorder.start();
      setMediaRecorderInstance(mediaRecorder);
      setAudioChunks(chunks);
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      setError(error.message);
    }
  };
  
  const stopPreRecording = () => {
    if (mediaRecorderInstance && mediaRecorderInstance.state !== 'inactive') {
      mediaRecorderInstance.stop();
      mediaRecorderInstance.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      setMediaRecorderInstance(null);
    }
  };

  const convertToPCM = (audioBuffer) => {
    const length = audioBuffer.length;
    const pcmData = new Int16Array(length);
    const channelData = audioBuffer.getChannelData(0);
    
    for (let i = 0; i < length; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
      pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    return pcmData;
  };
  
  const streamAudioFile = async (audioBlob, dgConnection) => {
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const audioData = await audioContext.decodeAudioData(arrayBuffer);
      const pcmData = convertToPCM(audioData);
      
      const chunkSize = 4096;
      for (let i = 0; i < pcmData.length; i += chunkSize) {
        const chunk = pcmData.slice(i, i + chunkSize);
        if (dgConnection.getReadyState() === 1) {
          dgConnection.send(chunk);
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
  
      dgConnection.finish();
    } catch (error) {
      console.error('Error streaming audio file:', error);
      throw error;
    }
  };
  
  const handlePrerecordedAudio = async (audioBlob = audioFile) => {
    try {
      if (!audioBlob) {
        throw new Error('No audio recording available');
      }
  
      setIsRecording(true);
      const deepgram = createClient(process.env.REACT_APP_DEEPGRAM_API_KEY);
      
      const dgConnection = await deepgram.listen.live({
        model: config.model,
        language: config.features.language,
        smart_format: config.features.smartFormat,
        punctuate: config.features.punctuate,
        diarize: config.features.diarize,
        numerals: config.features.numerals,
        profanity_filter: config.features.profanityFilter,
        encoding: "linear16",
        sample_rate: 16000,
        channels: 1
      });
  
      dgConnection.on(LiveTranscriptionEvents.Open, () => {
        console.log('Connection opened - starting to stream file');
        streamAudioFile(audioBlob, dgConnection);
      });
  
      dgConnection.on(LiveTranscriptionEvents.Transcript, (data) => {
        if (data.is_final) {
          const transcript = data.channel.alternatives[0];
          
          setTranscriptionData(prev => [...prev, {
            text: transcript.transcript,
            confidence: transcript.confidence,
            words: transcript.words,
            timestamp: new Date().toISOString()
          }]);
  
          setTranscription(prev => {
            const newText = transcript.transcript;
            return `${prev} ${newText}`.trim();
          });
        }
      });
  
      dgConnection.on(LiveTranscriptionEvents.Close, () => {
        console.log('Connection closed');
        setIsRecording(false);
      });
  
      dgConnection.on(LiveTranscriptionEvents.Error, (error) => {
        console.error('Error:', error);
        setError(error.message);
        setIsRecording(false);
      });
  
    } catch (error) {
      console.error('Error processing audio file:', error);
      setError(error.message);
      setIsRecording(false);
    }
  };

  return (
    <div className="deepgram-container">
      <h2>Live Transcription</h2>
      
      {error && (
        <div className="error-message">
          Error: {error}
        </div>
      )}

      <button 
        className="config-toggle"
        onClick={() => setShowConfig(!showConfig)}
      >
        {showConfig ? 'Hide Settings' : 'Show Settings'}
      </button>

      {showConfig && <ConfigPanel />}

      <div className="transcription-box">
        {transcription || 'Waiting for speech...'}
      </div>

      <div className="controls">
        {config.mode === 'live' ? (
          <button 
            className={`record-button ${isRecording ? 'recording' : ''}`}
            onClick={isRecording ? stopRecording : startRecording}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
        ) : (
          <button 
            className={`record-button ${isRecording ? 'recording' : ''}`}
            onClick={isRecording ? stopPreRecording : startPreRecording}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
        )}
        
        <button 
  className="clear-button"
  onClick={() => {
    setTranscription('');
    setTranscriptionData([]);
    setAudioFile(null);
    setAudioChunks([]);
  }}
>
  Clear All
</button>
      </div>

      <p className={`status ${isRecording ? 'recording' : ''}`}>
        Status: {isRecording ? 
          (config.mode === 'live' ? 'Recording' : 'Processing') : 
          'Ready'}
      </p>

      {transcriptionData.length > 0 && (
        <div className="transcript-data">
          <h3>Detailed Transcription Data</h3>
          {transcriptionData.map((item, index) => (
            <div key={index} className="transcript-item">
              <p><strong>Text:</strong> {item.text}</p>
              <p><strong>Confidence:</strong> {(item.confidence * 100).toFixed(2)}%</p>
              {item.topics && <p><strong>Topics:</strong> {item.topics.join(', ')}</p>}
              {item.entities && <p><strong>Entities:</strong> {JSON.stringify(item.entities)}</p>}
              <p><strong>Timestamp:</strong> {new Date(item.timestamp).toLocaleTimeString()}</p>
              {item.summary && (
                <div className="result-section">
                  <h4>Summary</h4>
                  <p>{item.summary}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DeepgramComponent;
