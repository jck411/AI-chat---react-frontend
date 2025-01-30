import { Box } from '@mui/material';
import { useState, useEffect, useRef, useCallback } from 'react';
import Message from './Message';
import MessageInput from './MessageInput';
import ChatHeader from './ChatHeader';
import { useAutoScroll } from '../../hooks/useAutoScroll';

const ChatContainer = () => {
  // State management
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I am Agent86. How can I help you?' }
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [wsConnectionStatus, setWsConnectionStatus] = useState('disconnected');
  const [isSttOn, setIsSttOn] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  
  // Refs
  const websocketRef = useRef(null);
  const messagesRef = useRef(messages);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  
  // Constants for reconnection
  const BASE_INTERVAL = 1000;
  const MAX_INTERVAL = 30 * 60 * 1000;
  
  const scrollRef = useAutoScroll(messages);

  // Update messages ref when messages change
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // WebSocket URL helper
  const getWebSocketUrl = () => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isLocal ? 'ws://localhost:8000/ws/chat' : 'ws://192.168.1.226:8000/ws/chat';
  };

  // Send WebSocket message helper
  const sendWebSocketMessage = useCallback((action, payload = {}) => {
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      const message = { action, ...payload };
      websocketRef.current.send(JSON.stringify(message));
    } else {
      console.warn(`WebSocket not connected. Cannot send action: ${action}`);
    }
  }, []);

  // WebSocket connection management
  useEffect(() => {
    let isMounted = true;

    const connectWebSocket = () => {
      if (!isMounted) return;

      const ws = new WebSocket(getWebSocketUrl());
      websocketRef.current = ws;

      setWsConnectionStatus(
        reconnectAttemptsRef.current === 0 ? 'connecting' : 'reconnecting'
      );

      ws.onopen = () => {
        if (!isMounted) return;
        console.log('Connected to WebSocket');
        setWsConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.stt_text) {
            const newMessage = { role: 'user', content: data.stt_text };
            setMessages(prev => [...prev, newMessage]);
            
            sendWebSocketMessage('chat', {
              messages: formatMessagesForAPI([...messagesRef.current, newMessage])
            });
          }

          if (data.content) {
            setMessages(prev => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg?.role === 'assistant') {
                return [
                  ...prev.slice(0, -1),
                  { ...lastMsg, content: lastMsg.content + data.content }
                ];
              }
              return [...prev, { role: 'assistant', content: data.content }];
            });
          }

          if (data.is_listening !== undefined) {
            setIsSttOn(data.is_listening);
          }
          if (data.is_generating !== undefined) {
            setIsGenerating(data.is_generating);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        if (!isMounted) return;
        console.log('WebSocket closed');
        setWsConnectionStatus('disconnected');

        const interval = Math.min(
          BASE_INTERVAL * 2 ** reconnectAttemptsRef.current,
          MAX_INTERVAL
        );
        reconnectAttemptsRef.current += 1;
        
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, interval);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      if (websocketRef.current) {
        websocketRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [sendWebSocketMessage]);

  // Format messages for API
  const formatMessagesForAPI = useCallback((msgs) => {
    return msgs.map(msg => ({
      sender: msg.role === 'user' ? 'user' : 'assistant',
      text: msg.content
    }));
  }, []);

  // Handle sending messages
  const handleSendMessage = useCallback((content) => {
    if (!content.trim()) return;

    const newMessage = { role: 'user', content };
    setMessages(prev => [...prev, newMessage]);
    setIsGenerating(true);

    if (wsConnectionStatus === 'connected') {
      sendWebSocketMessage('chat', {
        messages: formatMessagesForAPI([...messagesRef.current, newMessage])
      });
    }
  }, [wsConnectionStatus, sendWebSocketMessage, formatMessagesForAPI]);

  const handleToggleTheme = () => {
    setDarkMode(prev => !prev);
  };

  const handleToggleSTT = () => {
    if (wsConnectionStatus === 'connected') {
      sendWebSocketMessage(isSttOn ? 'pause-stt' : 'start-stt');
    }
  };

  const handleToggleTTS = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/toggle-tts', {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        setTtsEnabled(data.tts_enabled);
      }
    } catch (error) {
      console.error('Error toggling TTS:', error);
    }
  };

  const handleStop = async () => {
    try {
      await Promise.all([
        fetch('http://localhost:8000/api/stop-generation', { method: 'POST' }),
        fetch('http://localhost:8000/api/stop-tts', { method: 'POST' }),
      ]);
      setIsGenerating(false);
      if (wsConnectionStatus === 'connected') {
        sendWebSocketMessage('pause-stt');
      }
    } catch (error) {
      console.error('Error stopping:', error);
    }
  };

  return (
    <Box 
      sx={{ 
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        bgcolor: theme => theme.palette.mode === 'dark' 
          ? '#1a1a1a'
          : '#f5f5f5',
        color: 'text.primary',
      }}
    >
      <ChatHeader 
        darkMode={darkMode}
        onToggleTheme={handleToggleTheme}
        isSttOn={isSttOn}
        onToggleSTT={handleToggleSTT}
        ttsEnabled={ttsEnabled}
        onToggleTTS={handleToggleTTS}
        isGenerating={isGenerating}
        onStop={handleStop}
      />
      
      <Box 
        sx={{ 
          flex: 1,
          overflowY: 'auto',
        }}
        ref={scrollRef}
      >
        <Box sx={{ 
          maxWidth: '1000px',
          width: '100%',
          margin: '0 auto',
          padding: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}>
          {messages.map((message, index) => (
            <Message key={index} message={message} />
          ))}
        </Box>
      </Box>

      <Box sx={{
        position: 'sticky',
        bottom: 0,
        backgroundColor: theme => theme.palette.mode === 'dark' 
          ? 'rgba(35, 35, 35, 0.3)'
          : 'rgba(255, 255, 255, 0.3)',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid',
        borderColor: theme => theme.palette.mode === 'dark'
          ? 'rgba(255, 255, 255, 0.1)'
          : 'rgba(0, 0, 0, 0.1)',
        padding: 2,
        boxShadow: '0 -4px 30px rgba(0, 0, 0, 0.1)',
      }}>
        <Box sx={{ 
          maxWidth: '1000px',
          margin: '0 auto',
          width: '100%',
        }}>
          <MessageInput 
            onSend={handleSendMessage}
            isGenerating={isGenerating}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default ChatContainer;