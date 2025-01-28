// src/components/ChatInterface.jsx

import React, { useState, useEffect, useRef } from 'react';

import ChatHeader from './ChatHeader';
import ChatFooter from './ChatFooter';
import MessageList from './MessageList';

// Define constants outside the component to maintain stable references
const baseInterval = 1000; // 1 second
const maxInterval = 30 * 60 * 1000; // 30 minutes
const maxReconnectAttempts = 10; // Maximum reconnection attempts

const ChatInterface = () => {
  // State declarations
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

  // For short-lived feedback messages like "stop triggered"
  const [actionFeedback, setActionFeedback] = useState(null);

  // Refs for WebSocket and messages
  const websocketRef = useRef(null);
  const messagesRef = useRef(messages);

  // Reconnection logic
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);

  // Track initial connection attempt to suppress expected initial errors
  const isInitialConnectionRef = useRef(true);

  // Update messagesRef whenever messages change
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Handle dark mode
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Function to check server health
  const checkServerHealth = async () => {
    try {
      const response = await fetch('http://localhost:8000/health');
      return response.ok;
    } catch (error) {
      console.error('Error checking server health:', error);
      return false;
    }
  };

  // WebSocket initialization with exponential backoff
  useEffect(() => {
    let isMounted = true;

    const connectWebSocket = async () => {
      if (!isMounted) return;

      // Wait for server readiness
      const serverReady = await checkServerHealth();
      if (!serverReady) {
        console.warn('Server not ready. Retrying in 2 seconds...');
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMounted) connectWebSocket();
        }, 2000); // Retry after 2 seconds
        return;
      }

      const ws = new WebSocket('ws://localhost:8000/ws/chat');
      websocketRef.current = ws;

      // If it's the very first attempt, status = "connecting"; otherwise "reconnecting".
      setWsConnectionStatus(
        reconnectAttemptsRef.current === 0 ? 'connecting' : 'reconnecting'
      );

      ws.onopen = () => {
        if (!isMounted) return;
        console.log('Connected to Unified Chat WebSocket');
        setWsConnectionStatus('connected');
        reconnectAttemptsRef.current = 0; // Reset attempts on success
        isInitialConnectionRef.current = false; // Reset initial connection flag
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle STT text
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
            sendWebSocketAction('chat', { messages: [...messagesRef.current, sttMsg] });
          }

          // Handle GPT content
          if (data.content) {
            setMessages((prev) => {
              const lastIndex = prev.length - 1;
              // If last message is assistant, append chunk; otherwise create a new assistant msg
              if (prev[lastIndex] && prev[lastIndex].sender === 'assistant') {
                return [
                  ...prev.slice(0, lastIndex),
                  {
                    ...prev[lastIndex],
                    text: prev[lastIndex].text + data.content,
                  },
                ];
              } else {
                return [
                  ...prev,
                  {
                    id: Date.now(),
                    sender: 'assistant',
                    text: data.content,
                    timestamp: new Date().toLocaleTimeString(),
                  },
                ];
              }
            });
          }

          // Handle state updates
          if (data.is_listening !== undefined) {
            setIsSttOn(data.is_listening);
          }
          if (data.is_generating !== undefined) {
            setIsGenerating(data.is_generating);
          }
          if (data.stt_paused !== undefined) {
            setIsSttOn(false);
          }

          // Handle events
          if (data.event === 'stop_triggered') {
            setIsGenerating(false);
            setIsSttOn(false);
            setActionFeedback('stop_triggered');
            setTimeout(() => setActionFeedback(null), 1000);
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = (error) => {
        if (isInitialConnectionRef.current) {
          // Suppress logging for the initial connection attempt
          console.warn('Initial WebSocket connection error (may be transient):', error);
          isInitialConnectionRef.current = false;
        } else {
          console.error('Unified Chat WebSocket error:', error);
        }
      };

      ws.onclose = () => {
        if (!isMounted) return;
        console.log('Unified Chat WebSocket closed');
        setWsConnectionStatus('disconnected');

        // Increment reconnection attempts
        reconnectAttemptsRef.current += 1;

        if (reconnectAttemptsRef.current > maxReconnectAttempts) {
          console.error('Max WebSocket reconnection attempts reached.');
          return;
        }

        const interval = Math.min(
          baseInterval * 2 ** reconnectAttemptsRef.current,
          maxInterval
        );
        console.log(`Attempting to reconnect in ${interval / 1000} seconds...`);

        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMounted) connectWebSocket();
        }, interval);

        setWsConnectionStatus('reconnecting');
      };
    };

    // Introduce a short delay before the first connection attempt
    const initialDelay = setTimeout(() => {
      connectWebSocket();
    }, 1000); // 1 second delay

    return () => {
      isMounted = false;
      if (websocketRef.current) {
        websocketRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      clearTimeout(initialDelay);
    };
  }, []); // Empty dependency array to run once on mount

  // Helper to send WebSocket actions
  const sendWebSocketAction = (action, payload = {}) => {
    if (
      websocketRef.current &&
      websocketRef.current.readyState === WebSocket.OPEN
    ) {
      const message = { action, ...payload };
      websocketRef.current.send(JSON.stringify(message));
    } else {
      console.warn(`WebSocket not connected. Cannot send action: ${action}`);
    }
  };

  // Stop generation (and TTS) + pause STT
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

      // Pause STT
      sendWebSocketAction('pause-stt');
      setIsGenerating(false);
      setIsSttOn(false);

      setActionFeedback('stop_triggered');
      setTimeout(() => setActionFeedback(null), 1000);
    } catch (error) {
      console.error('Error stopping generation and TTS:', error);
    } finally {
      setIsStoppingGeneration(false);
    }
  };

  // Toggle TTS
  const toggleTTS = async () => {
    setIsTogglingTTS(true);
    try {
      const response = await fetch('http://localhost:8000/api/toggle-tts', {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        setTtsEnabled(data.tts_enabled);

        // If TTS is turned off, also stop TTS
        if (!data.tts_enabled) {
          const stopTtsResponse = await fetch(
            'http://localhost:8000/api/stop-tts',
            { method: 'POST' }
          );
          if (!stopTtsResponse.ok) {
            console.error('Failed to stop TTS:', stopTtsResponse.status);
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

  // Toggle STT
  const toggleSTT = async () => {
    setIsTogglingSTT(true);
    try {
      if (!isSttOn && wsConnectionStatus === 'connected') {
        sendWebSocketAction('start-stt');
      } else if (wsConnectionStatus === 'connected') {
        sendWebSocketAction('pause-stt');
      } else {
        console.warn('Cannot toggle STT when WebSocket is not connected.');
      }
    } catch (error) {
      console.error('Error toggling STT:', error);
    } finally {
      setIsTogglingSTT(false);
    }
  };

  // Send user message
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
      // Pre-emptively add an assistant message
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

      // Send to server if connected
      if (wsConnectionStatus === 'connected') {
        sendWebSocketAction('chat', {
          messages: [...messagesRef.current, newMessage],
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setIsGenerating(false);
    }
  };

  // Clear chat
  const handleClearChat = async () => {
    try {
      if (isGenerating) {
        await handleStop();
      }
      setMessages([]);
      setInputMessage('');
      setSttTranscript('');
    } catch (error) {
      console.error('Error clearing chat:', error);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900">
      {/* Chat Header */}
      <ChatHeader
        wsConnectionStatus={wsConnectionStatus}
        isGenerating={isGenerating}
        handleStop={handleStop}
        isStoppingGeneration={isStoppingGeneration}
        actionFeedback={actionFeedback}
        handleClearChat={handleClearChat}
        toggleTTS={toggleTTS}
        ttsEnabled={ttsEnabled}
        isTogglingTTS={isTogglingTTS}
        toggleSTT={toggleSTT}
        isSttOn={isSttOn}
        isTogglingSTT={isTogglingSTT}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
       <MessageList messages={messages} />
     </div>

      {/* Chat Footer */}
      <ChatFooter
        isGenerating={isGenerating}
        sttTranscript={sttTranscript}
        setSttTranscript={setSttTranscript}
        inputMessage={inputMessage}
        setInputMessage={setInputMessage}
        handleSend={handleSend}
      />
    </div>
  );
};

export default ChatInterface;
