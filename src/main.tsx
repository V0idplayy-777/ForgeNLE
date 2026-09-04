import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { useEditorStore } from "./store/useEditorStore";

// Expose the store for debugging / automation in development builds only.
if (import.meta.env.DEV) {
  (window as unknown as { __store: typeof useEditorStore }).__store = useEditorStore;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
