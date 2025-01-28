// src/components/ChatHeader.jsx
import React from 'react';
import {
  Loader2,
  X,
  Check,
  AlertTriangle,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Settings,
  Sun,
  Moon,
} from 'lucide-react';

import StopButton from './StopButton';

const ChatHeader = ({
  wsConnectionStatus,
  isGenerating,
  handleStop,
  isStoppingGeneration,
  actionFeedback,
  handleClearChat,
  toggleTTS,
  ttsEnabled,
  isTogglingTTS,
  toggleSTT,
  isSttOn,
  isTogglingSTT,
  darkMode,
  setDarkMode,
}) => {
  return (
    <>
      {/* Optional pop-up feedback (excluding 'stop_triggered') */}
      {actionFeedback && actionFeedback !== 'stop_triggered' && (
        <div className="fixed top-16 right-4 z-20 bg-blue-500 text-white px-4 py-2 rounded shadow">
          {actionFeedback}
        </div>
      )}

      <div
        className="
          fixed top-0 left-0 right-0 z-10 
          bg-glass dark:bg-glassDark 
          backdrop-blur-lg 
          border 
          border-glass-border dark:border-glassDark-border 
          shadow-lg 
          p-4 
          flex flex-col sm:flex-row justify-between items-center
          transition-colors
        "
      >
        {/* Left side (title/logo if needed) */}
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2 sm:mb-0">
          {/* Replace with your Chat Title or Logo */}
          
        </h1>

        {/* Right side icons and controls */}
        <div className="flex items-center gap-4 flex-wrap">
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

          {/* Stop Button (only if generating) */}
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
              isSttOn ? 'STT is ON. Click to Pause' : 'STT is OFF. Click to Start'
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
      </div>
    </>
  );
};

export default ChatHeader;
