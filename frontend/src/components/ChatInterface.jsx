
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo
} from 'react';
import { debounce } from 'lodash';
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
  AlertTriangle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { VariableSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

import CodeBlock, { InlineCode } from './CodeBlock';

// --------------------------------------
// StopButton
// --------------------------------------
const StopButton = ({ handleStop, isStoppingGeneration, actionFeedback }) => {
  return (
    <button
      onClick={handleStop}
      disabled={isStoppingGeneration}
      className={`p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full 
        ${actionFeedback === 'stop_triggered' ? 'ring-2 ring-red-500' : ''}
        ${isStoppingGeneration ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        flex items-center justify-center transition-all duration-200`}
      title="Stop Generation and STT"
    >
      {isStoppingGeneration ? (
        <Loader2 className="w-5 h-5 animate-spin text-gray-600 dark:text-gray-300" />
      ) : (
        <Square className="w-5 h-5 text-red-500" fill="currentColor" />
      )}
    </button>
  );
};

// --------------------------------------
// MemoizedRow
// --------------------------------------
const MemoizedRow = React.memo(
  ({ index, style, data }) => {
    const rowRef = useRef(null);
    const { messages, listRef, rowHeightsRef } = data;
    const message = messages[index];

    useEffect(() => {
      if (rowRef.current && listRef.current) {
        const measuredHeight = rowRef.current.getBoundingClientRect().height;
        if (rowHeightsRef.current[index] !== measuredHeight) {
          rowHeightsRef.current[index] = measuredHeight;
          listRef.current.resetAfterIndex(index, false);
        }
      }
    }, [message.text, index, listRef, rowHeightsRef]);

    return (
      <div style={style}>
        <div ref={rowRef} className="px-4 pt-2 pb-4">
          <div
            className={`flex ${
              message.sender === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-4 ${
                message.sender === 'user'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-transparent text-gray-800 dark:text-gray-100 shadow-none'
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
                          <CodeBlock className={className}>
                            {children}
                          </CodeBlock>
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
                      >
                        {props.children}
                      </a>
                    ),
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
        </div>
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.data.messages[prev.index] === next.data.messages[next.index] &&
      prev.style === next.style
    );
  }
);

// --------------------------------------
// ControlButtons
// --------------------------------------
const ControlButtons = React.memo(
  ({
    wsConnectionStatus,
    handleClearChat,
    isGenerating,
    handleStop,
    isStoppingGeneration,
    actionFeedback,
    toggleTTS,
    isTogglingTTS,
    ttsEnabled,
    toggleSTT,
    isTogglingSTT,
    isSttOn,
    darkMode,
    setDarkMode,
  }) => {
    return (
      <div className="flex items-center gap-4">
        <div title={wsConnectionStatus} className="flex items-center gap-1">
          {wsConnectionStatus === 'connected' ? (
            <>
              <Check className="w-4 h-4 text-green-500" />
              <span className="text-sm text-gray-600 dark:text-gray-300">
                Connected
              </span>
            </>
          ) : wsConnectionStatus === 'connecting' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
              <span className="text-sm text-gray-600 dark:text-gray-300">
                Connecting
              </span>
            </>
          ) : wsConnectionStatus === 'reconnecting' ? (
            <>
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-gray-600 dark:text-gray-300">
                Reconnecting
              </span>
            </>
          ) : (
            <>
              <X className="w-4 h-4 text-red-500" />
              <span className="text-sm text-gray-600 dark:text-gray-300">
                Disconnected
              </span>
            </>
          )}
        </div>

        <button
          onClick={handleClearChat}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full flex items-center gap-2 transition-all duration-200"
          title="Clear Chat"
        >
          <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>

        {isGenerating && (
          <StopButton
            handleStop={handleStop}
            isStoppingGeneration={isStoppingGeneration}
            actionFeedback={actionFeedback}
          />
        )}

        <button
          onClick={toggleTTS}
          disabled={isTogglingTTS}
          className={`p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full flex items-center gap-2 transition-all duration-200 ${
            isTogglingTTS ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}
          title={ttsEnabled ? 'Text-to-Speech Enabled' : 'Text-to-Speech Disabled'}
        >
          {isTogglingTTS ? (
            <Loader2 className="w-5 h-5 animate-spin text-gray-600 dark:text-gray-300" />
          ) : ttsEnabled ? (
            <Volume2 className="w-5 h-5 text-green-500" />
          ) : (
            <VolumeX className="w-5 h-5 text-gray-400" />
          )}
        </button>

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

        <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full flex items-center gap-2 transition-all duration-200">
          <Settings className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>

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
    );
  }
);

// --------------------------------------
// PerformanceMonitor (optional demo)
// --------------------------------------
const PerformanceMonitor = () => {
  useEffect(() => {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      if (duration > 16) {
        console.warn(`Slow render: ${duration.toFixed(2)}ms`);
      }
    };
  }, []);
  return null;
};

// --------------------------------------
// ChatInterface
// --------------------------------------
const ChatInterface = () => {
  // State
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
  const [actionFeedback, setActionFeedback] = useState(null);

  // Flag for controlling auto scroll
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);

  // Refs
  const listRef = useRef(null);
  const rowHeightsRef = useRef({});
  const websocketRef = useRef(null);
  const messagesRef = useRef(messages);
  const textareaRef = useRef(null);

  // Keep messagesRef updated
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Auto-growing textarea
  const adjustTextareaHeight = useMemo(
    () =>
      debounce(() => {
        if (!textareaRef.current) return;
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }, 100),
    []
  );

  useEffect(() => {
    adjustTextareaHeight();
  }, [inputMessage, sttTranscript, adjustTextareaHeight]);

  // Dark mode effect
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // WebSocket setup
  useEffect(() => {
    let isMounted = true;
    const ws = new WebSocket('ws://localhost:8000/ws/chat');
    websocketRef.current = ws;
    setWsConnectionStatus('connecting');

    ws.onopen = () => {
      if (!isMounted) return;
      console.log('Connected to WebSocket');
      setWsConnectionStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.stt_text) {
          const sttMsg = {
            id: Date.now(),
            sender: 'user',
            text: data.stt_text,
            timestamp: new Date().toLocaleTimeString(),
          };
          setMessages((prev) => [...prev, sttMsg]);
          setIsGenerating(true);
          websocketRef.current.send(
            JSON.stringify({
              action: 'chat',
              messages: [...messagesRef.current, sttMsg],
            })
          );
        }

        if (data.content) {
          const content = data.content;
          console.log(`Received GPT content: ${content}`);
          setMessages((prev) => {
            const lastIndex = prev.length - 1;
            if (prev[lastIndex] && prev[lastIndex].sender === 'assistant') {
              // Append content to last assistant message
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

        if (data.is_listening !== undefined) {
          setIsSttOn(data.is_listening);
          console.log('STT state updated:', data.is_listening);
        }
        if (data.stt_paused !== undefined) {
          setIsSttOn(false);
          console.log('STT explicitly paused');
        }
        if (data.is_generating !== undefined) {
          setIsGenerating(data.is_generating);
          console.log('Generation state updated:', data.is_generating);
        }
        if (data.event === 'stop_triggered') {
          setIsGenerating(false);
          setIsSttOn(false);
          setActionFeedback('stop_triggered');
          setTimeout(() => setActionFeedback(null), 1000);
          console.log('Stop triggered');
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      if (!isMounted) return;
      console.log('WebSocket closed');
      setWsConnectionStatus('disconnected');
    };

    return () => {
      isMounted = false;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  // Stop generation + TTS
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

      console.log('Stop requests sent.');
      setIsGenerating(false);
      setIsSttOn(false);
    } catch (error) {
      console.error('Error stopping processes:', error);
    } finally {
      setIsStoppingGeneration(false);
    }
  };

  // TTS toggle
  const toggleTTS = async () => {
    setIsTogglingTTS(true);
    try {
      const response = await fetch('http://localhost:8000/api/toggle-tts', {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        setTtsEnabled(data.tts_enabled);
        console.log(
          `TTS toggled: ${data.tts_enabled ? 'Enabled' : 'Disabled'}`
        );
        if (!data.tts_enabled) {
          const stopTtsResponse = await fetch(
            'http://localhost:8000/api/stop-tts',
            { method: 'POST' }
          );
          if (!stopTtsResponse.ok) {
            console.error('Failed to stop TTS:', stopTtsResponse.status);
          } else {
            console.log('TTS stopped.');
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

  // STT toggle
  const toggleSTT = async () => {
    setIsTogglingSTT(true);
    try {
      if (!isSttOn && wsConnectionStatus === 'connected') {
        websocketRef.current.send(JSON.stringify({ action: 'start-stt' }));
      } else if (isSttOn && wsConnectionStatus === 'connected') {
        websocketRef.current.send(JSON.stringify({ action: 'pause-stt' }));
      } else {
        console.warn('Cannot toggle STT when WebSocket is not connected.');
      }
    } catch (error) {
      console.error('Error toggling STT:', error);
    } finally {
      setIsTogglingSTT(false);
    }
  };

  // Send message
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) return;
      e.preventDefault();
      if (inputMessage.trim() || sttTranscript.trim()) {
        handleSend(sttTranscript || inputMessage);
      }
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

    if (wsConnectionStatus !== 'connected') {
      console.warn('WebSocket not connected.');
      return;
    }

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
      console.log('Sent chat action with messages:', [
        ...messagesRef.current,
        newMessage,
      ]);
    } catch (error) {
      console.error('Error sending message:', error);
      setIsGenerating(false);
    }
  };

  // Clear chat
  const handleClearChat = async () => {
    try {
      if (isGenerating) await handleStop();
      setMessages([]);
      setInputMessage('');
      setSttTranscript('');
    } catch (error) {
      console.error('Error clearing chat:', error);
    }
  };

  // React-Window Sizing
  const getItemSize = useCallback((index) => {
    return rowHeightsRef.current[index] || 100;
  }, []);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScrollEnabled && listRef.current) {
      listRef.current.scrollToItem(messages.length - 1, 'end');
    }
  }, [messages, autoScrollEnabled]);

  // Disable auto-scroll on user interaction
  const handleUserInteraction = useCallback(() => {
    setAutoScrollEnabled(false);
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-100 dark:bg-gray-900">
      <PerformanceMonitor />

      {/* Top Bar */}
      <div className="flex-none bg-white/80 dark:bg-gray-800/80 shadow-sm p-4 backdrop-blur-md">
        <div className="flex justify-between items-center max-w-6xl mx-auto">
          <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
            {/* Title or Logo Here */}
          </h1>
          <ControlButtons
            wsConnectionStatus={wsConnectionStatus}
            handleClearChat={handleClearChat}
            isGenerating={isGenerating}
            handleStop={handleStop}
            isStoppingGeneration={isStoppingGeneration}
            actionFeedback={actionFeedback}
            toggleTTS={toggleTTS}
            isTogglingTTS={isTogglingTTS}
            ttsEnabled={ttsEnabled}
            toggleSTT={toggleSTT}
            isTogglingSTT={isTogglingSTT}
            isSttOn={isSttOn}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
          />
        </div>
      </div>

      {/* Action Feedback */}
      {actionFeedback && (
        <div className="fixed top-16 right-4 z-20 bg-blue-500 text-white px-4 py-2 rounded shadow">
          {actionFeedback === 'stop_triggered'
            ? 'Generation Stopped'
            : actionFeedback}
        </div>
      )}

      {/* Messages Area */}
      <div
        className="flex-1 overflow-hidden"
        onClick={handleUserInteraction} // Clicking disables auto scroll
      >
        <div
          className="h-full scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent scroll-smooth"
          onScroll={(e) => {
            const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
            // If user scrolls away from the bottom, disable auto scroll
            if (scrollHeight - scrollTop > clientHeight + 5) {
              setAutoScrollEnabled(false);
            }
          }}
        >
          <AutoSizer>
            {({ height, width }) => (
              <List
                ref={listRef}
                height={height}
                width={width}
                itemCount={messages.length}
                itemSize={getItemSize}
                itemData={{ messages, listRef, rowHeightsRef }}
                overscanCount={5}
                itemKey={(index) => messages[index].id}
                className="scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent"
              >
                {MemoizedRow}
              </List>
            )}
          </AutoSizer>
        </div>
      </div>

      {/* "Scroll to Bottom" button */}
      {!autoScrollEnabled && (
        <button
          onClick={() => {
            setAutoScrollEnabled(true);
            if (listRef.current) {
              listRef.current.scrollToItem(messages.length - 1, 'end');
            }
          }}
          className="fixed bottom-20 right-4 bg-blue-500 text-white px-4 py-2 rounded shadow hover:bg-blue-600 transition-colors"
        >
          Scroll to Bottom
        </button>
      )}

      {/* Input Area */}
      <div className="flex-none bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto p-4">
          <div className="flex items-start gap-4">
            <textarea
              ref={textareaRef}
              rows={1}
              value={sttTranscript || inputMessage}
              onChange={(e) => {
                setInputMessage(e.target.value);
                setSttTranscript('');
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type or speak your message..."
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 resize-none min-h-[40px] max-h-[200px] overflow-hidden"
            />
            <button
              onClick={() => handleSend(sttTranscript || inputMessage)}
              disabled={isGenerating}
              className={`p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors ${
                isGenerating ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              title="Send Message"
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
    </div>
  );
};

export default ChatInterface;