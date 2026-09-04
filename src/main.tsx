import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { useEditorStore } from "./store/useEditorStore";
import { getPreviewEngine } from "./lib/playbackEngine";

// Expose the store for debugging / automation in development builds only.
if (import.meta.env.DEV) {
  (window as unknown as { __store: typeof useEditorStore; __engine: () => unknown }).__store = useEditorStore;
  (window as unknown as { __engine: () => unknown }).__engine = getPreviewEngine;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
