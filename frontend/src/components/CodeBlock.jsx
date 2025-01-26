// CodeBlock.js
import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

export const InlineCode = ({ children }) => {
  const isUrl = typeof children === 'string' && /^(https?:\/\/|www\.)/.test(children);

  return isUrl ? (
    <a
      href={children.startsWith('www.') ? `https://${children}` : children}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline"
    >
      {children}
    </a>
  ) : (
    <code>{children}</code>
  );
};

const CodeBlockWrapper = ({ language, children }) => {
  const [copied, setCopied] = useState(false);
  const codeContent = String(children).trim();

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="border border-gray-400 dark:border-gray-600 rounded overflow-hidden">
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

      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '1rem',
          backgroundColor: 'transparent',
        }}
        codeTagProps={{ style: { lineHeight: 'inherit' } }}
      >
        {codeContent}
      </SyntaxHighlighter>
    </div>
  );
};

// Default export instead of named export
const CodeBlock = ({ className, children }) => (
  <CodeBlockWrapper language={className?.replace('language-', '')}>
    {children}
  </CodeBlockWrapper>
);

export default CodeBlock; // This maintains the original import syntax