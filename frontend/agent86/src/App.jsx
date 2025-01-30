import { CssBaseline, Box } from '@mui/material';
import { ThemeContextProvider } from './contexts/ThemeContext';
import ThemeToggle from './components/Theme/ThemeToggle';
import ChatContainer from './components/Chat/ChatContainer';


function App() {
  return (
    <ThemeContextProvider>
      <CssBaseline />
      <Box 
        sx={{ 
          minHeight: '100vh',
          bgcolor: 'background.default',
          color: 'text.primary',
          p: 3
        }}
      >
        <ThemeToggle />
        <ChatContainer />
      </Box>
    </ThemeContextProvider>
  );
}

export default App;
