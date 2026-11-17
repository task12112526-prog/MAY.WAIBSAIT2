import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#6658e8', light: '#eeeafe', dark: '#5043ce' },
    secondary: { main: '#13a98b' },
    background: { default: '#f6f7fb', paper: '#ffffff' },
    text: { primary: '#24243a', secondary: '#82839a' },
    success: { main: '#15a987' },
    warning: { main: '#f1a541' },
    error: { main: '#eb6b6b' },
    divider: '#ededf3',
  },
  typography: {
    fontFamily: '"DM Sans", sans-serif',
    h1: { fontFamily: '"Manrope", sans-serif', fontWeight: 800, letterSpacing: '-0.045em' },
    h2: { fontFamily: '"Manrope", sans-serif', fontWeight: 750, letterSpacing: '-0.04em' },
    h3: { fontFamily: '"Manrope", sans-serif', fontWeight: 750, letterSpacing: '-0.03em' },
    h4: { fontFamily: '"Manrope", sans-serif', fontWeight: 750, letterSpacing: '-0.03em' },
    h5: { fontFamily: '"Manrope", sans-serif', fontWeight: 750, letterSpacing: '-0.02em' },
    h6: { fontFamily: '"Manrope", sans-serif', fontWeight: 700, letterSpacing: '-0.015em' },
    button: { textTransform: 'none', fontWeight: 650 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: { styleOverrides: { root: { borderRadius: 10, padding: '9px 16px' } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiCard: { styleOverrides: { root: { border: '1px solid #ededf3', boxShadow: '0 2px 12px rgba(35,35,66,0.025)', borderRadius: 16 } } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 10 } } },
  },
});
