import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  direction: 'rtl',
  palette: {
    mode: 'light',
    primary: { main: '#176b55', dark: '#10513f', light: '#e8f4ee', contrastText: '#ffffff' },
    secondary: { main: '#c49642', dark: '#9e762e', light: '#fbf2df', contrastText: '#202b28' },
    background: { default: '#f4f7f5', paper: '#ffffff' },
    text: { primary: '#172b25', secondary: '#687a72' },
    success: { main: '#20805e' },
    warning: { main: '#a66f17' },
    error: { main: '#b64f45' },
    divider: '#e2eae5',
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: 'Inter, "Segoe UI", Tahoma, sans-serif',
    h4: { fontWeight: 760, letterSpacing: '-0.04em', color: '#172b25' },
    h5: { fontWeight: 740, letterSpacing: '-0.03em', color: '#172b25' },
    h6: { fontWeight: 720, letterSpacing: '-0.02em', color: '#172b25' },
    button: { textTransform: 'none', fontWeight: 680, letterSpacing: 0 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: '#f4f7f5' },
        '::selection': { backgroundColor: '#d3e9de', color: '#10513f' },
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiCard: { styleOverrides: { root: { border: '1px solid #e2eae5', boxShadow: '0 12px 32px rgba(22, 58, 43, .055)' } } },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          paddingInline: 17,
          minHeight: 40,
          transition: 'transform .18s ease, box-shadow .18s ease, background-color .18s ease',
          '&:hover': { transform: 'translateY(-1px)' },
        },
        containedPrimary: { boxShadow: '0 6px 16px rgba(23, 107, 85, .2)' },
      },
    },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 12 } } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 12, backgroundColor: '#fff' },
        notchedOutline: { borderColor: '#dfe8e2' },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: { color: '#52665d', fontWeight: 750, backgroundColor: '#f4f8f5' },
        root: { borderColor: '#e7eee9' },
      },
    },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 20, boxShadow: '0 24px 80px rgba(15, 44, 32, .2)' } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 14 } } },
  },
});
