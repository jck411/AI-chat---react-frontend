import React, { useRef, useEffect, useCallback, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { VariableSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import CodeBlock, { InlineCode } from './CodeBlock';

const MessageList = ({ messages }) => {
  const listRef = useRef(null);
  const rowHeightsRef = useRef({});
  const [atBottom, setAtBottom] = useState(true);

  // Measure row sizes
  const getItemSize = (index) => {
    return rowHeightsRef.current[index] || 100;
  };

  // Row component
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
          className={`px-4 pb-4 ${index === 0 ? 'pt-10' : 'pt-2'}`}
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

              {/* Timestamp */}
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

  // Track visible items
  const onItemsRendered = useCallback(
    ({ visibleStartIndex, visibleStopIndex }) => {
      const lastIndex = messages.length - 1;
      if (lastIndex < 0) return;
      // If the last message is in view, "at bottom"
      if (visibleStopIndex >= lastIndex) {
        setAtBottom(true);
      } else {
        setAtBottom(false);
      }
    },
    [messages.length]
  );

  // Auto-scroll to bottom if atBottom
  useEffect(() => {
    if (atBottom && listRef.current) {
      listRef.current.scrollToItem(messages.length - 1, 'end');
    }
  }, [messages, atBottom]);

  return (
    <AutoSizer>
      {({ height, width }) => (
        <List
          ref={listRef}
          className="scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent" // Tailwind scrollbar classes
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
  );
};

export default MessageList;
