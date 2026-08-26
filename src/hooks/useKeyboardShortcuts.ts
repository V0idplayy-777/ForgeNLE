import { useEffect } from "react";
import { useEditorStore } from "../store/useEditorStore";

export function useKeyboardShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      const s = useEditorStore.getState();

      if (e.code === "Space") {
        e.preventDefault();
        s.togglePlay();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (s.selectedClipId) {
          e.preventDefault();
          s.removeClip(s.selectedClipId);
        }
      } else if (e.key.toLowerCase() === "s" && !e.metaKey && !e.ctrlKey) {
        if (s.selectedClipId) s.splitClipAtTime(s.selectedClipId, s.currentTime);
      } else if (e.key.toLowerCase() === "d" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (s.selectedClipId) s.duplicateClip(s.selectedClipId);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
      } else if (e.key === "=" || e.key === "+") {
        s.setZoom(s.zoom * 1.2);
      } else if (e.key === "-" || e.key === "_") {
        s.setZoom(s.zoom / 1.2);
      } else if (e.key === "ArrowLeft") {
        s.setCurrentTime(Math.max(0, s.currentTime - (e.shiftKey ? 5 : 1 / 30)));
      } else if (e.key === "ArrowRight") {
        s.setCurrentTime(s.currentTime + (e.shiftKey ? 5 : 1 / 30));
      } else if (e.key === "Escape") {
        s.selectClip(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
