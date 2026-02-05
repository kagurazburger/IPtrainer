import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../public/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Create root once to avoid duplicate warnings
let root = (window as any).__reactRoot;
if (!root) {
  root = ReactDOM.createRoot(rootElement);
  (window as any).__reactRoot = root;
}

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);