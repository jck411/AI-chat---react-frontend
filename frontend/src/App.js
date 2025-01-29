// src/App.jsx
import React, { useState, useEffect } from 'react';
import ChatInterface from './components/ChatInterface';

const App = () => {
  const [darkMode, setDarkMode] = useState(true); // Initialize dark mode as enabled

  // Effect to apply dark mode class to the document root
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <ChatInterface darkMode={darkMode} setDarkMode={setDarkMode} />
  );
};

export default App;
