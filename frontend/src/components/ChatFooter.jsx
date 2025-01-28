// src/components/ChatFooter.jsx
import React, { useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';

const ChatFooter = ({
  isGenerating,
  sttTranscript,
  setSttTranscript,
  inputMessage,
  setInputMessage,
  handleSend,
}) => {
  const textareaRef = useRef(null);

  // Auto-resize the input box
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [inputMessage, sttTranscript]);

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

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-glass dark:bg-glassDark pt-6 px-4 pb-4 backdrop-blur-sm">
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
  );
};

export default ChatFooter;
