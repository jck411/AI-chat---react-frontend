import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
    AlertTriangle, // New icon for reconnecting
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { VariableSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

import CodeBlock, { InlineCode } from './CodeBlock';

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

// Move Row outside main component & add comparison function
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
                    <div className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-lg p-4 ${
                            message.sender === 'user'
                                ? 'bg-blue-500 text-white shadow-sm'
                                : 'bg-transparent text-gray-800 dark:text-gray-100 shadow-none'
                        }`}>
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
                            <div className={`text-xs mt-1 ${
                                message.sender === 'user' ? 'text-blue-100' : 'text-gray-400'
                            }`}>
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

// Extract control buttons
const ControlButtons = React.memo(({ 
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
    setDarkMode
}) => {
    return (
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

            {/* Stop Button */}
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
    );
});

const PerformanceMonitor = () => {
    useEffect(() => {
        const start = performance.now();
        return () => {
            const duration = performance.now() - start;
            if (duration > 16) { // 60fps threshold
                console.warn(`Slow render: ${duration.toFixed(2)}ms`);
            }
        };
    });
    return null;
};

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

    // **New State for Action Feedback**
    const [actionFeedback, setActionFeedback] = useState(null);

    // For react-window
    const listRef = useRef(null);
    const rowHeightsRef = useRef({}); // store each row's rendered height

    // Keep track of whether the last item is visible in the viewport
    const [atBottom, setAtBottom] = useState(true);

    // Refs for WebSocket and messages
    const websocketRef = useRef(null);
    const messagesRef = useRef(messages);
    const textareaRef = useRef(null);

    // Reconnection related refs
    const reconnectAttemptsRef = useRef(0);
    const maxReconnectAttempts = 10;
    const reconnectTimeoutRef = useRef(null);

    // Add message queue
    const queuedMessages = useRef([]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    // Debounced textarea height adjustment
    const adjustTextareaHeight = useMemo(() => 
        debounce(() => {
            if (!textareaRef.current) return;
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }, 100)
    , []);

    // Update useEffect for textarea height adjustment to use debounced function
    useEffect(() => {
        adjustTextareaHeight();
    }, [inputMessage, sttTranscript, adjustTextareaHeight]);

    // Dark Mode
    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [darkMode]);

    // WebSocket initialization with reconnection
    useEffect(() => {
        let isMounted = true;

        const connectWebSocket = () => {
            if (!isMounted) return;

            // Clear any existing connection first
            if (websocketRef.current?.readyState === WebSocket.OPEN) {
                websocketRef.current.close();
            }

            const ws = new WebSocket('ws://localhost:8000/ws/chat');
            websocketRef.current = ws;
            setWsConnectionStatus(reconnectAttemptsRef.current === 0 ? 'connecting' : 'reconnecting');

            ws.onopen = () => {
                if (!isMounted) return;
                console.log('Connected to Unified Chat WebSocket');
                setWsConnectionStatus('connected');
                reconnectAttemptsRef.current = 0; // Reset reconnection attempts on successful connection

                // Send queued messages when reconnected
                if (queuedMessages.current.length > 0) {
                    websocketRef.current.send(JSON.stringify({
                        action: 'bulk_chat',
                        messages: queuedMessages.current
                    }));
                    queuedMessages.current = [];
                }
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    // Handle STT text and content as before
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
                        setIsSttOn(false);  // Explicit STT pause
                        console.log('STT explicitly paused');
                    }

                    // Handle events
                    if (data.event === 'stop_triggered') {
                        // Update generation and STT state without touching TTS enabled/disabled
                        setIsGenerating(false);
                        setIsSttOn(false);

                        // Optional: Add visual feedback
                        setActionFeedback('stop_triggered');
                        setTimeout(() => setActionFeedback(null), 1000);
                        console.log('Stop triggered: Generation and STT stopped');
                    }

                    // Handle other events or data as needed...

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

                if (reconnectAttemptsRef.current < maxReconnectAttempts) {
                    const timeout = Math.min(10000, 1000 * 2 ** reconnectAttemptsRef.current);
                    console.log(`Attempting to reconnect in ${timeout / 1000} seconds...`);
                    reconnectTimeoutRef.current = setTimeout(() => {
                        reconnectAttemptsRef.current += 1;
                        connectWebSocket();
                    }, timeout);
                    setWsConnectionStatus('reconnecting');
                } else {
                    console.error('Max reconnection attempts reached.');
                }
            };
        };

        connectWebSocket();

        // Enhanced cleanup
        return () => {
            isMounted = false;
            clearTimeout(reconnectTimeoutRef.current);
            
            // Properly close the WebSocket if it exists and is open
            if (websocketRef.current) {
                const ws = websocketRef.current;
                
                // Remove all existing listeners to prevent memory leaks
                ws.onopen = null;
                ws.onclose = null;
                ws.onerror = null;
                ws.onmessage = null;
                
                // Close the connection if it's still open
                if (ws.readyState === WebSocket.OPEN) {
                    ws.close();
                }
            }
            
            // Reset reconnection state
            reconnectAttemptsRef.current = 0;
            websocketRef.current = null;
        };
    }, []);

    // Stop generation & TTS
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
            setIsSttOn(false); // Ensure STT is also stopped
        } catch (error) {
            console.error('Error stopping generation and TTS:', error);
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
                console.log(`TTS toggled: ${data.tts_enabled ? 'Enabled' : 'Disabled'}`);

                // If TTS is turned off, also stop TTS
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

    // STT toggle
    const toggleSTT = async () => {
        setIsTogglingSTT(true);
        try {
            if (!isSttOn && wsConnectionStatus === 'connected') {
                websocketRef.current.send(JSON.stringify({ action: 'start-stt' }));
            } else if (wsConnectionStatus === 'connected') {
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

    // Send on Enter
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

        // Queue message if offline
        if (wsConnectionStatus !== 'connected') {
            queuedMessages.current.push(newMessage);
            // Note: You'll need to implement showToast or use your preferred notification method
            console.log('Message queued - sending when reconnected');
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

            if (wsConnectionStatus === 'connected') {
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
            } else {
                console.warn('Cannot send message: WebSocket is not connected.');
                // Optionally, you can queue messages to send once reconnected
            }
        } catch (error) {
            console.error('Error sending message:', error);
            setIsGenerating(false);
        }
    };

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
    const getItemSize = useCallback((index) => {
        return rowHeightsRef.current[index] || 100;
    }, []);

    /**
     * If the last item is visible, we consider ourselves "at bottom."
     * Then if new messages arrive, we auto-scroll to the bottom.
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
     * If we are "atBottom" whenever messages change (e.g. new messages),
     * scroll to the last item.
     */
    useEffect(() => {
        if (atBottom && listRef.current) {
            listRef.current.scrollToItem(messages.length - 1, 'end');
        }
    }, [messages, atBottom]);

    return (
        <div className="flex justify-center h-screen bg-gray-100 dark:bg-gray-900">
            <div className="w-full max-w-xl relative flex flex-col">
                {/* TOP BAR */}
                <div className="fixed top-0 left-0 right-0 z-10 bg-white/80 dark:bg-gray-800/80 shadow-sm p-4 flex justify-between items-center backdrop-blur-md">
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

                {/* **Action Feedback (Optional) */}
                {actionFeedback && (
                    <div className="fixed top-16 right-4 z-20 bg-blue-500 text-white px-4 py-2 rounded shadow">
                        {actionFeedback === 'stop_triggered' ? 'Generation Stopped' : actionFeedback}
                    </div>
                )}

                {/* MESSAGES AREA */}
                <div className="flex-1 pt-16 overflow-hidden">
                    <div className="h-full border-x border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
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
                                    onItemsRendered={onItemsRendered}
                                    itemKey={index => messages[index].id}
                                    className="scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent"
                                >
                                    {MemoizedRow}
                                </List>
                            )}
                        </AutoSizer>
                    </div>
                </div>

                {/* INPUT + SEND (Footer) */}
                <div className="bg-white dark:bg-gray-800 border-x border-t border-gray-200 dark:border-gray-700 p-4">
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
        </div>
    );
};

export default ChatInterface;
