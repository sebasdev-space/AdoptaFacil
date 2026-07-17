import React from 'react';
import ReactDOM from 'react-dom/client';
import '@adoptafacil/ui/styles.css';
import './index.css';
import { Shell } from './shell';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Shell />
  </React.StrictMode>,
);
