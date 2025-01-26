// ExampleMessage.jsx

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import InlineCode from './InlineCode';
import CodeBlock from './CodeBlock'; // Assuming you have a CodeBlock component

const ExampleMessage = () => {
  const messageText = "Here is some inline code: `const x = 10;` and a code block:\n\n```javascript\nconsole.log(x);\n```";

  return (
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
      {messageText}
    </ReactMarkdown>
  );
};

export default ExampleMessage;
