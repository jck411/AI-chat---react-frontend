// src/components/ChatInterface.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
    AlertTriangle, // Icon for reconnecting
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { VariableSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

import CodeBlock, { InlineCode } from './CodeBlock';

// **Base URL Configuration**
const BASE_URL = 'http://192.168.1.226:8000'; // Backend URL with correct port

// **WebSocket URL Configuration**
const WS_URL = `ws://192.168.1.226:8000/ws/chat`; // WebSocket URL with correct port

// **StopButton Component**
const StopButton = ({ handleStop, isStoppingGeneration, actionFeedback }) => {
    return (
        <button
            onClick={handleStop}
            disabled={isStoppingGeneration}
            className={`p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full 
                ${actionFeedback === 'stop_triggered' ? 'ring-2 ring-red-500' : ''}
                ${isStoppingGeneration ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                flex items-center justify-center transition-all duration-200`}
            title="Stop Generation, TTS, and STT"
        >
            {isStoppingGeneration ? (
                <Loader2 className="w-5 h-5 animate-spin text-gray-600 dark:text-gray-300" />
            ) : (
                <Square className="w-5 h-5 text-red-500" fill="currentColor" />
            )}
        </button>
    );
};

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
    const [audioQueue, setAudioQueue] = useState([]);
    const currentAudioRef = useRef(null);
    const [actionFeedback, setActionFeedback] = useState(null);
    const listRef = useRef(null);
    const rowHeightsRef = useRef({}); // store each row's rendered height
    const [atBottom, setAtBottom] = useState(true);
    const websocketRef = useRef(null);
    const messagesRef = useRef(messages);
    const textareaRef = useRef(null);
    const reconnectAttemptsRef = useRef(0);
    const reconnectTimeoutRef = useRef(null);
    const baseInterval = 1000; // 1 second in milliseconds
    const maxInterval = 30 * 60 * 1000; // 30 minutes in milliseconds

    // **Helper Function to Play Audio Queue**
    const playNextInQueue = useCallback(() => {
        if (audioQueue.length > 0 && ttsEnabled) {
            const nextAudio = audioQueue[0];
            const audio = new Audio(`data:audio/mp3;base64,${nextAudio}`);
            currentAudioRef.current = audio;

            audio.onended = () => {
                // Remove this segment from the queue
                setAudioQueue(prev => prev.slice(1));

                // If there are more audio segments, play the next one
                if (audioQueue.length > 1) {
                    // STT is already paused, no action needed
                } else {
                    // No more audio segments, resume STT
                    sendWebSocketAction('start-stt');
                }

                currentAudioRef.current = null;
            };

            audio.onerror = (e) => {
                console.error('Audio playback error:', e);
                setAudioQueue(prev => prev.slice(1));
                currentAudioRef.current = null;

                // Resume STT even if there's an error
                sendWebSocketAction('start-stt');
            };

            // Pause STT before playing audio
            sendWebSocketAction('pause-stt');

            audio.play().catch(error => {
                console.error('Failed to play audio:', error);
                setAudioQueue(prev => prev.slice(1));

                // Resume STT even if playback fails
                sendWebSocketAction('start-stt');
            });

            currentAudioRef.current = audio;
        }
    }, [audioQueue, ttsEnabled]);

    // **Effect to Play Audio Queue**
    useEffect(() => {
        if (!currentAudioRef.current && audioQueue.length > 0 && ttsEnabled) {
            playNextInQueue();
        }
    }, [audioQueue, playNextInQueue, ttsEnabled]);

    // **Update messagesRef whenever messages change**
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    // **Auto-resize the input box**
    const adjustTextareaHeight = () => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight}px`;
        }
    };

    useEffect(() => {
        adjustTextareaHeight();
    }, [inputMessage, sttTranscript]);

    // **Dark Mode**
    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [darkMode]);

    // **Helper Function to Send WebSocket Actions with Optional Payload**
    const sendWebSocketAction = (action, payload = {}) => {
        if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
            const message = { action, ...payload };
            websocketRef.current.send(JSON.stringify(message));
            console.log(`Sent WebSocket action: ${action}`, payload);
        } else {
            console.warn('WebSocket is not connected. Cannot send action:', action);
        }
    };

    // **WebSocket Initialization with Exponential Backoff and 30-Minute Cap**
    useEffect(() => {
        let isMounted = true;

        const connectWebSocket = () => {
            if (!isMounted) return;

            const ws = new WebSocket(WS_URL); // Updated WebSocket URL
            websocketRef.current = ws;
            setWsConnectionStatus(
                reconnectAttemptsRef.current === 0 ? 'connecting' : 'reconnecting'
            );

            ws.onopen = () => {
                if (!isMounted) return;
                console.log('Connected to Unified Chat WebSocket');
                setWsConnectionStatus('connected');
                reconnectAttemptsRef.current = 0; // Reset reconnection attempts on success
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
                        const content = data.content;
                        console.log(`Received GPT content: ${content}`);
                        setMessages((prev) => {
                            const lastIndex = prev.length - 1;
                            if (prev[lastIndex] && prev[lastIndex].sender === 'assistant') {
                                // Append chunk to last assistant message
                                return [
                                    ...prev.slice(0, lastIndex),
                                    {
                                        ...prev[lastIndex],
                                        text: prev[lastIndex].text + content,
                                    },
                                ];
                            } else {
                                // Start new assistant message
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

                    // Handle TTS messages
                    if (data.tts_start) {
                        console.log('TTS starting for:', data.text);
                        // Pause STT here
                        sendWebSocketAction('pause-stt');
                    }
                    if (data.tts_audio) {
                        setAudioQueue(prev => [...prev, data.tts_audio]);
                    }
                    if (data.tts_error) {
                        console.error('TTS error:', data.tts_error);
                    }
                    if (data.tts_end) {
                        console.log('TTS ended');
                        // Resume STT here if needed
                        // sendWebSocketAction('start-stt');
                        // However, since we're handling it in audio.onended, no action needed here
                    }

                    // Handle state updates
                    if (data.is_listening !== undefined) {
                        setIsSttOn(data.is_listening);
                        console.log('STT state updated:', data.is_listening);
                    }
                    if (data.is_generating !== undefined) {
                        setIsGenerating(data.is_generating);
                        console.log('Generation state updated:', data.is_generating);
                    }
                    if (data.stt_paused !== undefined) {
                        setIsSttOn(false); // Explicit STT pause
                        console.log('STT explicitly paused');
                    }

                    // Handle events
                    if (data.event === 'stop_triggered') {
                        // Update generation and STT state
                        setIsGenerating(false);
                        setIsSttOn(false);

                        // Provide action feedback
                        setActionFeedback('stop_triggered');
                        setTimeout(() => setActionFeedback(null), 1000);
                        console.log('Stop triggered: Generation and STT stopped');
                    }

                } catch (err) {
                    console.error('Error parsing WebSocket message:', err);
                }
            };

            ws.onerror = (error) => {
                console.error('Unified Chat WebSocket error:', error);
                // The 'onclose' event will handle reconnection
            };

            ws.onclose = () => {
                if (!isMounted) return;
                console.log('Unified Chat WebSocket closed');
                setWsConnectionStatus('disconnected');

                // **Calculate Retry Interval with Exponential Backoff and 30-Minute Cap**
                reconnectAttemptsRef.current += 1;
                const interval = Math.min(baseInterval * 2 ** reconnectAttemptsRef.current, maxInterval);
                console.log(`Attempting to reconnect in ${interval / 1000} seconds...`);

                // Schedule the next reconnection attempt
                reconnectTimeoutRef.current = setTimeout(() => {
                    connectWebSocket();
                }, interval);

                setWsConnectionStatus('reconnecting');
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
    }, [baseInterval, maxInterval, WS_URL]); // Added WS_URL as dependency

    // **Handle Stop Function**
    const handleStop = async () => {
        setIsStoppingGeneration(true);
        try {
            // Stop current audio playback
            if (currentAudioRef.current) {
                currentAudioRef.current.pause();
                currentAudioRef.current = null;
            }
            setAudioQueue([]); // Clear audio queue

            // Send HTTP requests to stop generation and TTS
            const [genRes, ttsRes] = await Promise.all([
                fetch(`${BASE_URL}/api/stop-generation`, { method: 'POST' }),
                fetch(`${BASE_URL}/api/stop-tts`, { method: 'POST' }),
            ]);

            if (!genRes.ok) {
                console.error('Failed to stop generation:', genRes.status);
            }
            if (!ttsRes.ok) {
                console.error('Failed to stop TTS:', ttsRes.status);
            }

            console.log('Stop requests sent to both generation & TTS endpoints.');

            // Send WebSocket message to pause STT
            sendWebSocketAction('pause-stt');

            // Update frontend state
            setIsGenerating(false);
            setIsSttOn(false);

            // Provide Action Feedback
            setActionFeedback('stop_triggered');
            setTimeout(() => setActionFeedback(null), 1000);
        } catch (error) {
            console.error('Error stopping generation and TTS:', error);
        } finally {
            setIsStoppingGeneration(false);
        }
    };

    // **TTS Toggle Function**
    const toggleTTS = async () => {
        setIsTogglingTTS(true);
        try {
            // Stop any current playback when disabling TTS
            if (ttsEnabled) {
                if (currentAudioRef.current) {
                    currentAudioRef.current.pause();
                    currentAudioRef.current = null;
                }
                setAudioQueue([]);
            }

            const response = await fetch(`${BASE_URL}/api/toggle-tts`, {
                method: 'POST',
            });
            if (response.ok) {
                const data = await response.json();
                setTtsEnabled(data.tts_enabled);
                console.log(`TTS toggled: ${data.tts_enabled ? 'Enabled' : 'Disabled'}`);

                if (!data.tts_enabled) {
                    const stopTtsResponse = await fetch(`${BASE_URL}/api/stop-tts`, {
                        method: 'POST',
                    });
                    if (!stopTtsResponse.ok) {
                        console.error('Failed to stop TTS:', stopTtsResponse.status);
                    }
                }
            }
        } catch (error) {
            console.error('Error toggling TTS:', error);
        } finally {
            setIsTogglingTTS(false);
        }
    };

    // **STT Toggle Function**
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

    // **Handle Enter Key for Sending Messages**
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            if (e.shiftKey) {
                // allow newline
                return;
            } else {
                e.preventDefault();
                if (inputMessage.trim() || sttTranscript.trim()) {
                    handleSend(sttTranscript || inputMessage);
                }
            }
        }
    };

    // **Send User Message Function**
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

            if (wsConnectionStatus === 'connected') {
                sendWebSocketAction('chat', { messages: [...messagesRef.current, newMessage] });
                console.log('Sent action: chat with messages:', [
                    ...messagesRef.current,
                    newMessage,
                ]);
            } else {
                console.warn('Cannot send message: WebSocket is not connected.');
                // Optionally, queue messages for later
            }
        } catch (error) {
            console.error('Error sending message:', error);
            setIsGenerating(false);
        }
    };

    // **Clear Chat Function**
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

    /**
     * --- react-window row measurement + rendering ---
     */
    const getItemSize = (index) => {
        return rowHeightsRef.current[index] || 100;
    };

    const Row = React.memo(({ index, style, data }) => {
        const rowRef = useRef(null);
        const { messages } = data;
        const message = messages[index];

        useEffect(() => {
            if (rowRef.current && listRef.current) {
                const measuredHeight = rowRef.current.getBoundingClientRect().height;
                if (rowHeightsRef.current[index] !== measuredHeight) {
                    rowHeightsRef.current[index] = measuredHeight;
                    listRef.current.resetAfterIndex(index, false);
                }
            }
        }, [message.text, index]);

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
                </div>
            </div>
        );
    });

    /**
     * Track which items are visible. If the last item is visible, we consider ourselves "at bottom."
     */
    const onItemsRendered = useCallback(
        ({ visibleStartIndex, visibleStopIndex }) => {
            const lastIndex = messages.length - 1;
            if (lastIndex < 0) return;
            // If the last message is in view, setAtBottom(true). Otherwise false
            if (visibleStopIndex >= lastIndex) {
                setAtBottom(true);
            } else {
                setAtBottom(false);
            }
        },
        [messages.length]
    );

    /**
     * If we are "atBottom" whenever messages change, scroll to the last item.
     */
    useEffect(() => {
        if (atBottom && listRef.current) {
            listRef.current.scrollToItem(messages.length - 1, 'end');
        }
    }, [messages, atBottom]);

    return (
        <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900">
            {/* TOP BAR */}
            <div className="fixed top-0 left-0 right-0 z-10 bg-white/80 dark:bg-gray-800/80 shadow-sm p-4 flex justify-between items-center backdrop-blur-md">
                <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                    {/* Title if needed */}
                    Chat Interface
                </h1>

                <div className="flex items-center gap-4">
                    {/* WebSocket Connection Status */}
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

                    {/* Clear Chat Button */}
                    <button
                        onClick={handleClearChat}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full flex items-center gap-2 transition-all duration-200"
                        title="Clear Chat"
                    >
                        <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                    </button>

                    {/* Stop Button (only shown if generating) */}
                    {isGenerating && (
                        <StopButton
                            handleStop={handleStop}
                            isStoppingGeneration={isStoppingGeneration}
                            actionFeedback={actionFeedback}
                        />
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
                        title={
                            isSttOn
                                ? 'STT is ON. Click to Pause'
                                : 'STT is OFF. Click to Start'
                        }
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

            {/* Action Feedback (optional) */}
            {actionFeedback && (
                <div className="fixed top-16 right-4 z-20 bg-blue-500 text-white px-4 py-2 rounded shadow">
                    {actionFeedback === 'stop_triggered'
                        ? 'Generation, TTS, and STT Stopped'
                        : actionFeedback}
                </div>
            )}

            {/* MESSAGES AREA */}
            <div className="flex-1 pt-16">
                <AutoSizer>
                    {({ height, width }) => (
                        <List
                            ref={listRef}
                            height={height}
                            width={width}
                            itemCount={messages.length}
                            itemSize={getItemSize}
                            itemData={{ messages }}
                            overscanCount={5}
                            onItemsRendered={onItemsRendered}
                        >
                            {Row}
                        </List>
                    )}
                </AutoSizer>
            </div>

            {/* INPUT + SEND (Footer) */}
            <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 p-4">
                <div className="flex items-start gap-4 max-w-4xl mx-auto">
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
    );
};

export default ChatInterface;
