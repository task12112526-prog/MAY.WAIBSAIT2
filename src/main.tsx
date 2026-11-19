import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { createTheme } from '@mui/material/styles';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { I18nProvider, useI18n } from './i18n';
import { theme } from './theme';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false },
  },
});

function LocalizedApp() {
  const { locale } = useI18n();
  const isUrdu = locale === 'ur';
  const localizedTheme = createTheme(theme, {
    direction: isUrdu ? 'rtl' : 'ltr',
    typography: {
      fontFamily: isUrdu
        ? '"Noto Nastaliq Urdu", "Noto Sans Arabic", serif'
        : 'Inter, "Segoe UI", Tahoma, sans-serif',
      ...(isUrdu && { allVariants: { lineHeight: 2, letterSpacing: 'normal' } }),
    },
  });
  return <ThemeProvider theme={localizedTheme}><CssBaseline /><App /></ThemeProvider>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <I18nProvider><LocalizedApp /></I18nProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
