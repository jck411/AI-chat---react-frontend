import { Box, IconButton } from '@mui/material';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import StopIcon from '@mui/icons-material/Stop';

const ChatHeader = ({ 
  darkMode,
  onToggleTheme,
  isSttOn,
  onToggleSTT,
  ttsEnabled,
  onToggleTTS,
  isGenerating,
  onStop
}) => {
  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 1100,
        backdropFilter: 'blur(8px) saturate(180%)',
        WebkitBackdropFilter: 'blur(8px) saturate(180%)', // For Safari support
        backgroundColor: theme => theme.palette.mode === 'dark' 
          ? 'rgba(35, 35, 35, 0.2)'  // Even more transparent
          : 'rgba(255, 255, 255, 0.2)',
        border: '1px solid',
        borderColor: theme => theme.palette.mode === 'dark'
          ? 'rgba(255, 255, 255, 0.05)'
          : 'rgba(255, 255, 255, 0.3)',
        padding: 1,
        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
      }}
    >
      <Box
        sx={{
          maxWidth: '1000px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton onClick={onToggleTheme} color="inherit">
            {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton 
            onClick={onToggleSTT} 
            color={isSttOn ? 'primary' : 'inherit'}
          >
            {isSttOn ? <MicIcon /> : <MicOffIcon />}
          </IconButton>
          
          <IconButton 
            onClick={onToggleTTS} 
            color={ttsEnabled ? 'primary' : 'inherit'}
          >
            {ttsEnabled ? <VolumeUpIcon /> : <VolumeOffIcon />}
          </IconButton>
          
          {isGenerating && (
            <IconButton 
              onClick={onStop}
              color="error"
            >
              <StopIcon />
            </IconButton>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default ChatHeader;
