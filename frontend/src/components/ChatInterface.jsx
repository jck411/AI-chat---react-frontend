import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Settings,
  Loader2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  X,
  Check,
  Square,
  Sun,
  Moon,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeBlock, { InlineCode } from './CodeBlock';

function useChatScroll(dep) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [dep]);
  return ref;
}

const ChatInterface = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isStoppingGeneration, setIsStoppingGeneration] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [isTogglingTTS, setIsTogglingTTS] = useState(false);
  const [isSttOn, setIsSttOn] = useState(false);
  const [isTogglingSTT, setIsTogglingSTT] = useState(false);
  const [sttTranscript, setSttTranscript] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [wsConnectionStatus, setWsConnectionStatus] = useState('disconnected');
  const [darkMode, setDarkMode] = useState(true);

  const websocketRef = useRef(null);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const scrollRef = useChatScroll(messages);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/chat');
    websocketRef.current = ws;
    setWsConnectionStatus('connecting');

    ws.onopen = () => {
      console.log('Connected to Unified Chat WebSocket');
      setWsConnectionStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Check if STT text is present
        if (data.stt_text) {
          const sttMsg = {
            id: Date.now(),
            sender: 'user',
            text: data.stt_text,
            timestamp: new Date().toLocaleTimeString(),
          };
          setMessages((prev) => [...prev, sttMsg]);

          // Send STT text for GPT response
          setIsGenerating(true);
          websocketRef.current.send(
            JSON.stringify({
              action: 'chat',
              messages: [...messagesRef.current, sttMsg],
            })
          );
        }

        // Check if new GPT content chunk arrived
        if (data.content) {
          const content = data.content;
          console.log(`Received GPT content: ${content}`);
          setMessages((prev) => {
            const lastIndex = prev.length - 1;
            if (prev[lastIndex] && prev[lastIndex].sender === 'assistant') {
              return [
                ...prev.slice(0, lastIndex),
                {
                  ...prev[lastIndex],
                  text: prev[lastIndex].text + content,
                },
              ];
            } else {
              return [
                ...prev,
                {
                  id: Date.now(),
                  sender: 'assistant',
                  text: content,
                  timestamp: new Date().toLocaleTimeString(),
                },
              ];
            }
          });
        }

        // Check if STT is on/off
        if (data.is_listening !== undefined) {
          setIsSttOn(data.is_listening);
          console.log(`STT is now ${data.is_listening ? 'ON' : 'OFF'}`);
        }
      } catch (e) {
        console.error('Error parsing WebSocket message:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('Unified Chat WebSocket error:', error);
      setWsConnectionStatus('disconnected');
    };

    ws.onclose = () => {
      console.log('Unified Chat WebSocket closed');
      setWsConnectionStatus('disconnected');
    };

    return () => {
      ws.close();
    };
  }, []);

  const handleStop = async () => {
    setIsStoppingGeneration(true);
    try {
      const [genRes, ttsRes] = await Promise.all([
        fetch('http://localhost:8000/api/stop-generation', { method: 'POST' }),
        fetch('http://localhost:8000/api/stop-tts', { method: 'POST' }),
      ]);

      if (!genRes.ok) {
        console.error('Failed to stop generation:', genRes.status);
      }
      if (!ttsRes.ok) {
        console.error('Failed to stop TTS:', ttsRes.status);
      }

      console.log('Stop requests sent to both generation & TTS endpoints.');
      setIsGenerating(false);
    } catch (error) {
      console.error('Error stopping generation and TTS:', error);
    } finally {
      setIsStoppingGeneration(false);
    }
  };

  const toggleTTS = async () => {
    setIsTogglingTTS(true);
    try {
      const response = await fetch('http://localhost:8000/api/toggle-tts', {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        setTtsEnabled(data.tts_enabled);
        console.log(`TTS toggled: ${data.tts_enabled ? 'Enabled' : 'Disabled'}`);

        if (!data.tts_enabled) {
          const stopTtsResponse = await fetch(
            'http://localhost:8000/api/stop-tts',
            { method: 'POST' }
          );
          if (!stopTtsResponse.ok) {
            console.error('Failed to stop TTS:', stopTtsResponse.status);
          } else {
            console.log('TTS stopped successfully.');
          }
        }
      } else {
        console.error('Failed to toggle TTS');
      }
    } catch (error) {
      console.error('Error toggling TTS:', error);
    } finally {
      setIsTogglingTTS(false);
    }
  };

  const toggleSTT = async () => {
    setIsTogglingSTT(true);
    try {
      if (!isSttOn) {
        websocketRef.current.send(JSON.stringify({ action: 'start-stt' }));
      } else {
        websocketRef.current.send(JSON.stringify({ action: 'pause-stt' }));
      }
    } catch (error) {
      console.error('Error toggling STT:', error);
    } finally {
      setIsTogglingSTT(false);
    }
  };

  const handleSend = async (userInput) => {
    if (!userInput.trim()) return;

    const newMessage = {
      id: Date.now(),
      sender: 'user',
      text: userInput,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputMessage('');
    setSttTranscript('');

    setIsGenerating(true);
    try {
      const aiMessageId = Date.now() + 1;
      setMessages((prev) => [
        ...prev,
        {
          id: aiMessageId,
          sender: 'assistant',
          text: '',
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);

      websocketRef.current.send(
        JSON.stringify({
          action: 'chat',
          messages: [...messagesRef.current, newMessage],
        })
      );
      console.log('Sent action: chat with messages:', [
        ...messagesRef.current,
        newMessage,
      ]);
    } catch (error) {
      console.error('Error sending message:', error);
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900">
      {/* TOP BAR */}
      <div className="fixed top-0 left-0 right-0 z-10 bg-white/80 dark:bg-gray-800/80 shadow-sm p-4 flex justify-between items-center backdrop-blur-md">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
          {/* Title / Heading if needed */}
        </h1>

        <div className="flex items-center gap-4">
          {/* WebSocket Connection Status */}
          <div title={wsConnectionStatus} className="flex items-center gap-1">
            {wsConnectionStatus === 'connected' ? (
              <div className="text-green-500">
                <Check className="w-4 h-4" />
              </div>
            ) : wsConnectionStatus === 'disconnected' ? (
              <div className="text-red-500">
                <X className="w-4 h-4" />
              </div>
            ) : (
              <div className="text-yellow-500">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            )}
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {wsConnectionStatus}
            </span>
          </div>

          {/* Stop Button */}
          {isGenerating && (
            <button
              onClick={handleStop}
              disabled={isStoppingGeneration}
              className={`p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full flex items-center gap-2 transition-all duration-200 ${
                isStoppingGeneration
                  ? 'opacity-50 cursor-not-allowed'
                  : 'cursor-pointer'
              }`}
              title="Stop Generation and TTS"
            >
              {isStoppingGeneration ? (
                <Loader2 className="w-5 h-5 animate-spin text-gray-600 dark:text-gray-300" />
              ) : (
                <Square className="w-5 h-5 text-red-500" fill="currentColor" />
              )}
            </button>
          )}

          {/* TTS Toggle */}
          <button
            onClick={toggleTTS}
            disabled={isTogglingTTS}
            className={`p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full flex items-center gap-2 transition-all duration-200 ${
              isTogglingTTS ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
            title={
              ttsEnabled ? 'Text-to-Speech Enabled' : 'Text-to-Speech Disabled'
            }
          >
            {isTogglingTTS ? (
              <Loader2 className="w-5 h-5 animate-spin text-gray-600 dark:text-gray-300" />
            ) : ttsEnabled ? (
              <Volume2
                className="w-5 h-5 text-green-500"
                title="Backend TTS Enabled"
              />
            ) : (
              <VolumeX
                className="w-5 h-5 text-gray-400"
                title="Backend TTS Disabled"
              />
            )}
          </button>

          {/* STT Toggle */}
          <button
            onClick={toggleSTT}
            disabled={isTogglingSTT}
            className={`p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full flex items-center gap-2 transition-all duration-200 ${
              isTogglingSTT ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
            title={isSttOn ? 'STT is ON. Click to Pause' : 'STT is OFF. Click to Start'}
          >
            {isTogglingSTT ? (
              <Loader2 className="w-5 h-5 animate-spin text-gray-600 dark:text-gray-300" />
            ) : isSttOn ? (
              <Mic className="w-5 h-5 text-green-500" />
            ) : (
              <MicOff className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {/* Settings */}
          <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full flex items-center gap-2 transition-all duration-200">
            <Settings className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>

          {/* Dark Mode Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full flex items-center gap-2 transition-all duration-200"
            title="Toggle Dark Mode"
          >
            {darkMode ? (
              <Sun className="w-5 h-5 text-yellow-400" />
            ) : (
              <Moon className="w-5 h-5 text-gray-600" />
            )}
          </button>
        </div>
      </div>

      {/* MESSAGES AREA 
          The parent takes full width so the scrollbar is on screen edge.
          Inside it, we center and limit max width to 1200px. 
      */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-gray-200 dark:scrollbar-track-gray-700 scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-500 hover:scrollbar-thumb-gray-500 dark:hover:scrollbar-thumb-gray-400"
        style={{ scrollbarGutter: 'stable', scrollbarWidth: 'thin', msOverflowStyle: 'none' }}
      >
        <div className="max-w-[1000px] mx-auto p-4 pt-20 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.sender === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-4 ${
                  message.sender === 'user'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : // Remove bubble background for assistant:
                      'bg-transparent text-gray-800 dark:text-gray-100 shadow-none'
                }`}
              >
                {message.sender === 'assistant' ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code: ({ inline, className, children }) => {
                        const match = /language-(\w+)/.exec(className || '');
                        if (!inline && match) {
                          return (
                            <CodeBlock className={className} children={children} />
                          );
                        }
                        return <InlineCode>{children}</InlineCode>;
                      },
                      a: ({ node, ...props }) => (
                        <a 
                          {...props} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline"
                        />
                      )
                    }}
                    className="prose dark:prose-invert max-w-none break-words"
                  >
                    {message.text}
                  </ReactMarkdown>
                ) : (
                  <div className="whitespace-pre-wrap break-words">
                    {message.text}
                  </div>
                )}
                {/* Timestamp */}
                <div
                  className={`text-xs mt-1 ${
                    message.sender === 'user'
                      ? 'text-blue-100'
                      : 'text-gray-400'
                  }`}
                >
                  {message.timestamp}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* INPUT + SEND (Footer) */}
      <div className="bg-white dark:bg-gray-800 p-4">
        <div className="flex items-center gap-4 max-w-4xl mx-auto">
          <input
            type="text"
            value={sttTranscript || inputMessage}
            onChange={(e) => {
              setInputMessage(e.target.value);
              setSttTranscript('');
            }}
            onKeyPress={(e) => {
              if (
                e.key === 'Enter' &&
                (inputMessage.trim() || sttTranscript.trim())
              ) {
                handleSend(sttTranscript || inputMessage);
              }
            }}
            placeholder="Type or speak your message..."
            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
          />
          <button
            onClick={() => handleSend(sttTranscript || inputMessage)}
            disabled={isGenerating}
            className={`p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 ${
              isGenerating ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isGenerating ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
