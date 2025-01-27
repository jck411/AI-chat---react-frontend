// StopButton.jsx
import React from 'react';
import { Loader2, Square } from 'lucide-react';

const StopButton = ({ handleStop, isStoppingGeneration, actionFeedback }) => {
  return (
    <button
      onClick={handleStop}
      disabled={isStoppingGeneration}
      className={`p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full 
          ${actionFeedback === 'stop_triggered' ? 'ring-2 ring-red-500' : ''}
          ${
            isStoppingGeneration
              ? 'opacity-50 cursor-not-allowed'
              : 'cursor-pointer'
          }
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

export default StopButton;
