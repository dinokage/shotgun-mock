import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { setBaseUrl } from '@workspace/api-client-react';

const API_BASE = import.meta.env.VITE_API_URL || '';
if (API_BASE) {
  setBaseUrl(API_BASE);
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
