import React, { useState, useRef } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Separate URL detection logic
const isUrl = (text) => {
  if (!text || typeof text !== 'string') return false;
  return /^(https?:\/\/|www\.)/i.test(text);
};

// Inline code component with URL handling
const InlineCode = ({ children }) => {
  if (isUrl(children)) {
    const href = children.startsWith('www.') ? `https://${children}` : children;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 hover:text-blue-600 dark:text-blue-400 
          dark:hover:text-blue-300 underline"
      >
        {children}
      </a>
    );
  }
  return <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">{children}</code>;
};

// Copy button component
const CopyButton = ({ onClick, copied }) => (
  <button
    onClick={onClick}
    className="text-xs px-2 py-1 rounded transition-colors
      bg-gray-700 hover:bg-gray-600 text-white"
    aria-label="Copy code"
  >
    {copied ? '✓ Copied' : 'Copy'}
  </button>
);

// Header component
const CodeHeader = ({ language, onCopy, copied }) => (
  <div className="flex items-center justify-between bg-gray-300 dark:bg-gray-700 px-3 py-2">
    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
      {language || 'Code'}
    </span>
    <CopyButton onClick={onCopy} copied={copied} />
  </div>
);

// Main code block component
const CodeBlock = ({ className, children }) => {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef(null);
  const language = className?.replace('language-', '') || '';

  const handleCopy = async () => {
    if (!codeRef.current?.textContent) return;
    
    try {
      await navigator.clipboard.writeText(codeRef.current.textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <div className="border border-gray-400 dark:border-gray-600 rounded overflow-hidden">
      <CodeHeader language={language} onCopy={handleCopy} copied={copied} />
      <div ref={codeRef}>
        <SyntaxHighlighter
          language={language}
          style={oneDark}
          customStyle={{
            margin: 0,
            padding: '1rem',
            backgroundColor: 'transparent',
          }}
          codeTagProps={{
            style: {
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: '0.9rem',
              lineHeight: '1.5',
            },
          }}
          showLineNumbers={false}
          wrapLines={true}
          wrapLongLines={true}
        >
          {String(children).trim()}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

export { CodeBlock as default, InlineCode };
