import '@fontsource/cairo/index.css';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress benign dev environment WebSocket disconnect notifications
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    if (e && (e.message?.includes('WebSocket') || e.filename?.includes('@vite/client'))) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener('unhandledrejection', (e) => {
    if (e && e.reason && String(e.reason).includes('WebSocket')) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
}

createRoot(document.getElementById('root')!).render(<App />);
