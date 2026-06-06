import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { registerStreamProxyListener } from "./streamProxy";

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(err => {
    console.error('Service Worker registration failed:', err);
  });
  registerStreamProxyListener();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
