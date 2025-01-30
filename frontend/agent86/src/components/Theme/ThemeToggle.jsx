import { IconButton, useTheme } from '@mui/material';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import { useContext } from 'react';
import { ColorModeContext } from '../../contexts/ThemeContext';

const ThemeToggle = () => {
  const theme = useTheme();
  const colorMode = useContext(ColorModeContext);

  return (
    <IconButton 
      sx={{ position: 'absolute', top: 16, right: 16 }}
      onClick={colorMode.toggleColorMode} 
      color="inherit"
    >
      {theme.palette.mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
    </IconButton>
  );
};

export default ThemeToggle;
