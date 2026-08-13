import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import './calendar-fixes.css';
import { LanguageProvider } from './lib/i18n';

const baseEl = document.querySelector('base');
const basename = baseEl ? new URL(baseEl.href).pathname.replace(/\/$/, '') : '';

createRoot(document.getElementById('root')!).render(
  <StrictMode><LanguageProvider><BrowserRouter basename={basename}><App /></BrowserRouter></LanguageProvider></StrictMode>,
);
