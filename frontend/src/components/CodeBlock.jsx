import React, { useState, useRef } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

/**
 * Component for rendering inline content from single backticks as plain text
 */
export const InlineCode = ({ children }) => {
  // Check if the content looks like a URL
  const isUrl = children && typeof children === 'string' && (
    children.startsWith('http://') || 
    children.startsWith('https://') || 
    children.startsWith('www.')
  );

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

  return (
    <code className="px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-sm font-mono">
      {children}
    </code>
  );
};

/**
 * Component for rendering code blocks (triple backticks) with syntax highlighting
 */
const CodeBlockWrapper = ({ language, children }) => {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef(null);

  const handleCopy = () => {
    if (codeRef.current) {
      navigator.clipboard
        .writeText(codeRef.current.textContent)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
    }
  };

  return (
    <div className="relative my-4 rounded-lg overflow-hidden">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 bg-gray-700 text-white px-2 py-1 text-sm rounded hover:bg-gray-600 transition-colors"
        aria-label="Copy code"
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
      
      <div ref={codeRef} className="[&_pre]:!m-0 [&_pre]:!p-4 [&_code]:!p-0">
        <SyntaxHighlighter
          language={language}
          style={oneDark}
          customStyle={{
            margin: 0,
            borderRadius: '0.5rem',
          }}
          codeTagProps={{
            style: {
              lineHeight: 'inherit',
              backgroundColor: 'transparent'
            }
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