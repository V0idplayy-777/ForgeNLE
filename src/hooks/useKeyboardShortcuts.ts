import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/useEditorStore";
import { getProjectDuration } from "../lib/utils";

export interface ShortcutDef {
  keys: string;
  label: string;
  group: string;
}

export const SHORTCUTS: ShortcutDef[] = [
  { keys: "Space", label: "Play / Pause", group: "Playback" },
  { keys: "J / K / L", label: "Shuttle reverse / stop / forward", group: "Playback" },
  { keys: "← / →", label: "Step one frame", group: "Playback" },
  { keys: "Shift + ← / →", label: "Step one second", group: "Playback" },
  { keys: "↑ / ↓", label: "Jump to previous / next edit", group: "Playback" },
  { keys: "Home / End", label: "Go to start / end", group: "Playback" },
  { keys: "I / O", label: "Set in / out point", group: "Playback" },
  { keys: "Alt + X", label: "Clear in / out", group: "Playback" },
  { keys: "M", label: "Add marker", group: "Playback" },
  { keys: "F", label: "Fullscreen preview", group: "Playback" },
  { keys: "V", label: "Select tool", group: "Tools" },
  { keys: "C", label: "Razor tool", group: "Tools" },
  { keys: "H", label: "Hand tool", group: "Tools" },
  { keys: "S", label: "Split at playhead", group: "Editing" },
  { keys: "Q / W", label: "Trim start / end to playhead", group: "Editing" },
  { keys: "Delete", label: "Delete selection", group: "Editing" },
  { keys: "Shift + Delete", label: "Ripple delete", group: "Editing" },
  { keys: "Mod + D", label: "Duplicate", group: "Editing" },
  { keys: "Mod + C / X / V", label: "Copy / Cut / Paste", group: "Editing" },
  { keys: "Mod + A", label: "Select all", group: "Editing" },
  { keys: "Mod + L", label: "Link / unlink selection", group: "Editing" },
  { keys: ", / .", label: "Nudge selection 1 frame", group: "Editing" },
  { keys: "Shift + , / .", label: "Nudge selection 10 frames", group: "Editing" },
  { keys: "Mod + Z", label: "Undo", group: "Editing" },
  { keys: "Mod + Shift + Z", label: "Redo", group: "Editing" },
  { keys: "N", label: "Toggle snapping", group: "Timeline" },
  { keys: "R", label: "Toggle ripple mode", group: "Timeline" },
  { keys: "+ / -", label: "Zoom timeline", group: "Timeline" },
  { keys: "Shift + Z", label: "Zoom to fit", group: "Timeline" },
  { keys: "Mod + S", label: "Save project", group: "Project" },
  { keys: "Mod + E", label: "Export", group: "Project" },
  { keys: "?", label: "Show shortcuts", group: "Project" },
  { keys: "G", label: "Impact hit at playhead", group: "Gaming" },
  { keys: "Shift + G", label: "Instant replay (last 3s)", group: "Gaming" },
];

interface Handlers {
  onExport?: () => void;
  onSave?: () => void;
  onToggleShortcuts?: () => void;
  onZoomFit?: () => void;
}

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return true;
  return el.isContentEditable;
}

export function useKeyboardShortcuts(handlers: Handlers = {}) {
  const rateRef = useRef(0);
  const h = useRef(handlers);
  h.current = handlers;

  useEffect(() => {
    function applyRate(rate: number) {
      rateRef.current = rate;
      useEditorStore.getState().setShuttleRate(rate);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const s = useEditorStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const fps = s.settings.fps;
      const sel = s.selectedClipIds;

      // ── Mod combos ──
      if (mod) {
        switch (key) {
          case "z":
            e.preventDefault();
            e.shiftKey ? s.redo() : s.undo();
            return;
          case "y":
            e.preventDefault();
            s.redo();
            return;
          case "c":
            e.preventDefault();
            if (e.altKey && sel.length) s.copyAttributes(sel[0]);
            else s.copySelected();
            return;
          case "x":
            e.preventDefault();
            s.cutSelected();
            return;
          case "v":
            e.preventDefault();
            if (e.altKey) s.pasteAttributes(sel);
            else s.pasteClipboard();
            return;
          case "a":
            e.preventDefault();
            s.selectAll();
            return;
          case "d":
            e.preventDefault();
            if (sel.length) s.duplicateClips(sel);
            return;
          case "l":
            e.preventDefault();
            if (sel.length > 1) {
              const clips = s.tracks.flatMap((t) => t.clips).filter((c) => sel.includes(c.id));
              const allLinked = clips.every((c) => c.linkGroup && c.linkGroup === clips[0].linkGroup);
              allLinked ? s.unlinkClips(sel) : s.linkClips(sel);
            } else if (sel.length === 1) s.unlinkClips(sel);
            return;
          case "s":
            e.preventDefault();
            h.current.onSave?.();
            return;
          case "e":
            e.preventDefault();
            h.current.onExport?.();
            return;
          case "=":
          case "+":
            e.preventDefault();
            s.setZoom(s.zoom * 1.25);
            return;
          case "-":
            e.preventDefault();
            s.setZoom(s.zoom / 1.25);
            return;
        }
        return;
      }

      switch (e.code) {
        case "Space":
          e.preventDefault();
          rateRef.current = 0;
          s.togglePlay();
          return;
        case "Delete":
        case "Backspace":
          if (sel.length) {
            e.preventDefault();
            s.removeClips(sel, e.shiftKey ? true : undefined);
          }
          return;
        case "ArrowLeft":
          e.preventDefault();
          s.setIsPlaying(false);
          s.setCurrentTime(Math.max(0, s.currentTime - (e.shiftKey ? 1 : 1 / fps)));
          return;
        case "ArrowRight":
          e.preventDefault();
          s.setIsPlaying(false);
          s.setCurrentTime(s.currentTime + (e.shiftKey ? 1 : 1 / fps));
          return;
        case "ArrowUp":
          e.preventDefault();
          s.jumpToEdit(-1);
          return;
        case "ArrowDown":
          e.preventDefault();
          s.jumpToEdit(1);
          return;
        case "Home":
          e.preventDefault();
          s.setCurrentTime(0);
          return;
        case "End":
          e.preventDefault();
          s.setCurrentTime(getProjectDuration(s.tracks));
          return;
        case "Escape":
          s.selectClip(null);
          s.setTool("select");
          return;
        case "Comma":
          e.preventDefault();
          if (sel.length) s.nudgeClips(sel, e.shiftKey ? -10 : -1);
          return;
        case "Period":
          e.preventDefault();
          if (sel.length) s.nudgeClips(sel, e.shiftKey ? 10 : 1);
          return;
      }

      switch (key) {
        case "s":
          e.preventDefault();
          s.splitAtTime(s.currentTime, sel.length ? sel : undefined);
          return;
        case "q":
          s.trimToPlayhead("start");
          return;
        case "w":
          s.trimToPlayhead("end");
          return;
        case "i":
          s.setInPoint(s.currentTime);
          return;
        case "o":
          s.setOutPoint(s.currentTime);
          return;
        case "x":
          if (e.altKey) s.clearInOut();
          return;
        case "m":
          s.addMarker();
          return;
        case "r":
          s.toggleRipple();
          return;
        case "v":
          s.setTool("select");
          return;
        case "c":
          s.setTool("razor");
          return;
        case "h":
          s.setTool("hand");
          return;
        case "y":
          s.setTool("slip");
          return;
        case "n":
          if (e.shiftKey) s.setTool("roll");
          else s.toggleSnapping();
          return;
        case "b":
          s.setTool("ripple");
          return;
        case "=":
        case "+":
          s.setZoom(s.zoom * 1.25);
          return;
        case "-":
        case "_":
          s.setZoom(s.zoom / 1.25);
          return;
        case "z":
          if (e.shiftKey) h.current.onZoomFit?.();
          return;
        case "?":
          h.current.onToggleShortcuts?.();
          return;
        case "j":
          e.preventDefault();
          if (rateRef.current > 0) applyRate(0);
          else if (rateRef.current === 0) applyRate(-1);
          else if (rateRef.current > -8) applyRate(rateRef.current * 2);
          return;
        case "k":
          e.preventDefault();
          applyRate(0);
          s.setIsPlaying(false);
          return;
        case "l":
          e.preventDefault();
          if (rateRef.current < 0) applyRate(0);
          else if (rateRef.current === 0) applyRate(1);
          else if (rateRef.current < 8) applyRate(rateRef.current * 2);
          return;
        case "g": {
          e.preventDefault();
          if (e.shiftKey) {
            s.instantReplay();
            return;
          }
          s.impactAtPlayhead();
          return;
        }
        case "f": {
          e.preventDefault();
          if (e.shiftKey) {
            if (sel.length) s.freezeFrameAtPlayhead(sel[0], 2);
            return;
          }
          const stage = document.querySelector("[data-preview-stage]") as HTMLElement | null;
          if (stage) {
            if (document.fullscreenElement) document.exitFullscreen();
            else stage.requestFullscreen?.();
          }
          return;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
