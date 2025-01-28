// src/components/MessageList.jsx
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { VariableSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import CodeBlock, { InlineCode } from './CodeBlock';

const MessageList = ({ messages }) => {
  const listRef = useRef(null);
  const rowHeightsRef = useRef({});
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [showJumpButton, setShowJumpButton] = useState(false);
  const lastMessageRef = useRef('');
  const lastMessageLengthRef = useRef(0);
  const lastScrollTopRef = useRef(0);
  const isUserScrollingRef = useRef(false);
  
  // Get item size for virtualization
  const getItemSize = (index) => {
    return rowHeightsRef.current[index] || 100;
  };

  const scrollToBottom = useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollToItem(messages.length - 1, 'end');
      setShouldAutoScroll(true);
      setShowJumpButton(false);
      isUserScrollingRef.current = false;
    }
  }, [messages.length]);

  // Auto-scroll when messages change or last message is updated
  useEffect(() => {
    if (!messages.length) return;
    
    const lastMessage = messages[messages.length - 1];
    const isNewMessage = lastMessageRef.current !== lastMessage.id;
    const currentLength = lastMessage.text.length;
    const hasGrown = currentLength > lastMessageLengthRef.current;
    
    lastMessageRef.current = lastMessage.id;
    lastMessageLengthRef.current = currentLength;

    if (shouldAutoScroll && (isNewMessage || hasGrown) && !isUserScrollingRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
  }, [messages, shouldAutoScroll, scrollToBottom]);

  // Handle scroll events
  const handleScroll = useCallback(({ scrollOffset }) => {
    const listElement = listRef.current?._outerRef;
    if (!listElement) return;

    // Detect if user is actively scrolling up
    if (scrollOffset < lastScrollTopRef.current) {
      isUserScrollingRef.current = true;
      setShouldAutoScroll(false);
    }

    // Detect if user has scrolled to bottom
    const isAtBottom =
      Math.abs(
        listElement.scrollHeight - listElement.clientHeight - scrollOffset
      ) < 1;

    if (isAtBottom) {
      isUserScrollingRef.current = false;
      setShouldAutoScroll(true);
      setShowJumpButton(false);
    } else {
      setShowJumpButton(true);
    }

    lastScrollTopRef.current = scrollOffset;
  }, []);

  // Reset scroll behavior when unmounting
  useEffect(() => {
    return () => {
      setShouldAutoScroll(true);
      isUserScrollingRef.current = false;
    };
  }, []);

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
        <div
          ref={rowRef}
          className={`px-4 ${
            index === 0 ? 'pt-24' : 'pt-2'
          } ${
            index === messages.length - 1 ? 'pb-24' : 'pb-4'
          }`}
        >
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
                  message.sender === 'user' ? 'text-blue-100' : 'text-gray-400'
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

  return (
    <div className="relative h-full">
      <AutoSizer>
        {({ height, width }) => (
          <List
            ref={listRef}
            className="scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent"
            height={height}
            width={width}
            itemCount={messages.length}
            itemSize={getItemSize}
            itemData={{ messages }}
            overscanCount={5}
            onScroll={handleScroll}
          >
            {Row}
          </List>
        )}
      </AutoSizer>

      {showJumpButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-20 right-4 bg-blue-500 hover:bg-blue-600 text-white rounded-full p-2 shadow-lg transition-all duration-200 flex items-center gap-2"
          aria-label="Jump to latest message"
        >
          <ArrowDown size={20} />
          <span className="pr-1">Latest</span>
        </button>
      )}
    </div>
  );
};

export default MessageList;