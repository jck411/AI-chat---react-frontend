import React, { useState, useRef } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

/**
 * Component for rendering inline content from single backticks as plain text
 */
export const InlineCode = ({ children }) => {
  const isUrl =
    children &&
    typeof children === 'string' &&
    (children.startsWith('http://') ||
      children.startsWith('https://') ||
      children.startsWith('www.'));

  if (isUrl) {
    return (
      <a
        href={children.startsWith('www.') ? `https://${children}` : children}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline"
      >
        {children}
      </a>
    );
  }

  return <code>{children}</code>;
};

/**
 * Component for rendering code blocks (triple backticks) with syntax highlighting
 * and a header containing the copy button.
 */
const CodeBlockWrapper = ({ language, children }) => {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef(null);

  const handleCopy = () => {
    if (codeRef.current) {
      navigator.clipboard.writeText(codeRef.current.textContent).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <div className="border border-gray-400 dark:border-gray-600 rounded overflow-hidden">
      {/* Unified Header with Language Label and Copy Button */}
      <div className="flex items-center justify-between bg-gray-300 dark:bg-gray-700 px-3 py-2">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
          {language || 'Code'}
        </span>
        <button
          onClick={handleCopy}
          className="text-xs bg-gray-700 text-white px-2 py-1 rounded hover:bg-gray-600 transition-colors"
          aria-label="Copy code"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      <div ref={codeRef}>
        <SyntaxHighlighter
          language={language}
          style={oneDark}
          customStyle={{
            margin: 0, // No margin around the block
            padding: '1rem', // Padding inside the block
            backgroundColor: 'transparent',
          }}
          codeTagProps={{
            style: {
              lineHeight: 'inherit',
            },
          }}
          showLineNumbers={false}
          wrapLines={false}
          PreTag="div"
        >
          {String(children).trim()}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

// Main component that decides between inline and block rendering
const CodeBlock = ({ className, children }) => {
  const language = className?.replace('language-', '') || '';
  return <CodeBlockWrapper language={language}>{children}</CodeBlockWrapper>;
};

export default CodeBlock;
