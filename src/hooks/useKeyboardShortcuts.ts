import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/useEditorStore";

export function useKeyboardShortcuts() {
  const jHeld = useRef(false);
  const lHeld = useRef(false);
  const rateRef = useRef(0);

  useEffect(() => {
    function applyRate(rate: number) {
      rateRef.current = rate;
      const s = useEditorStore.getState();
      s.setShuttleRate(rate);
      if (rate === 0) {
        s.setIsPlaying(false);
      } else {
        s.setIsPlaying(true);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      const s = useEditorStore.getState();

      if (e.code === "Space") {
        e.preventDefault();
        const s2 = useEditorStore.getState();
        rateRef.current = 0;
        s2.setShuttleRate(0);
        s2.togglePlay();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (s.selectedClipIds.length > 1) {
          e.preventDefault();
          s.removeClips(s.selectedClipIds, e.altKey);
        } else if (s.selectedClipId) {
          e.preventDefault();
          s.removeClips([s.selectedClipId], e.altKey);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        s.copySelected();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        s.pasteClipboard();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        if (s.selectedClipIds.length > 1) s.linkClips(s.selectedClipIds);
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
      } else if (e.key.toLowerCase() === "j" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        jHeld.current = true;
        if (rateRef.current > 0) applyRate(0);
        else if (rateRef.current === 0) applyRate(-1);
        else if (rateRef.current > -8) applyRate(rateRef.current * 2);
      } else if (e.key.toLowerCase() === "k" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        applyRate(0);
        s.setIsPlaying(false);
            } else if (e.key.toLowerCase() === "l" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        lHeld.current = true;
        if (rateRef.current < 0) applyRate(0);
        else if (rateRef.current === 0) applyRate(1);
        else if (rateRef.current < 8) applyRate(rateRef.current * 2);
      } else if (e.key.toLowerCase() === "f" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const stage = document.querySelector("[data-preview-stage]") as HTMLElement | null;
        if (stage) {
          if (document.fullscreenElement) document.exitFullscreen();
          else stage.requestFullscreen?.();
        }
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "j") jHeld.current = false;
      if (e.key.toLowerCase() === "l") lHeld.current = false;
    }

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, []);
}
