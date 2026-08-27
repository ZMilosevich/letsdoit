import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import './calendar-fixes.css';
import './design-system.css';
import { LanguageProvider } from './lib/i18n';
import { ThemeProvider } from './lib/theme';

const originalFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const token = localStorage.getItem('letsdoit-session');
  if (!token || !url.includes('/api/')) return originalFetch(input, init);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return originalFetch(input, { ...init, headers });
}) as typeof window.fetch;

const baseEl = document.querySelector('base');
const basename = baseEl ? new URL(baseEl.href).pathname.replace(/\/$/, '') : '';

createRoot(document.getElementById('root')!).render(
  <StrictMode><ThemeProvider><LanguageProvider><BrowserRouter basename={basename}><App /></BrowserRouter></LanguageProvider></ThemeProvider></StrictMode>,
);
