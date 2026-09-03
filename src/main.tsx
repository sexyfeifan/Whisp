import React from "react";
import ReactDOM from "react-dom/client";
import { ToastProvider } from "./components/ui/toast"
import App from "./App";
import "./App.css";
import { ErrorBoundary } from "./ErrorBoundary";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider><App /></ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
