import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

try {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  console.error("Failed to render the app:", error);
  rootElement.innerHTML = `<div style="color: red; padding: 20px;"><h1>Something went wrong</h1><p>${error instanceof Error ? error.message : String(error)}</p></div>`;
}
