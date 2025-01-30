import { Box, TextField, IconButton } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { useState } from 'react';

const MessageInput = ({ onSend, isStreaming }) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() && !isStreaming) {
      onSend(message);
      setMessage('');
    }
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        mt: 2,
        display: 'flex',
        gap: 1,
      }}
    >
      <TextField
        fullWidth
        multiline
        maxRows={4}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type a message..."
        disabled={isStreaming}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
      />
      <IconButton 
        type="submit" 
        disabled={!message.trim() || isStreaming}
        color="primary"
      >
        <SendIcon />
      </IconButton>
    </Box>
  );
};

export default MessageInput;
