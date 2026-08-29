import { create } from "zustand";
import {
  Clip,
  ClipEffects,
  MediaAsset,
  Track,
  TrackType,
  defaultEffects,
  defaultTextStyle,
} from "../types";
import { getProjectDuration, pickClipColor, uid } from "../lib/utils";

interface HistoryEntry {
  tracks: Track[];
}

interface EditorState {
  projectName: string;
  mediaAssets: MediaAsset[];
  tracks: Track[];
  selectedClipId: string | null;
  currentTime: number;
  isPlaying: boolean;
  zoom: number;
  snapping: boolean;
  past: HistoryEntry[];
  future: HistoryEntry[];
  isExporting: boolean;
  exportProgress: number;

  shuttleRate: number;
  highContrast: boolean;
  reduceMotion: boolean;
  largeUI: boolean;

  setProjectName: (name: string) => void;
  addMedia: (assets: MediaAsset[]) => void;
  removeMedia: (id: string) => void;
  setMediaWaveform: (id: string, waveform: number[] | undefined) => void;

  addTrack: (type: TrackType, name?: string) => string;
  removeTrack: (id: string) => void;
  toggleTrackProp: (id: string, prop: "muted" | "hidden" | "locked") => void;
  renameTrack: (id: string, name: string) => void;

  addClip: (trackId: string, clip: Clip) => void;
  updateClip: (clipId: string, patch: Partial<Clip>, record?: boolean) => void;
  updateClipEffects: (clipId: string, patch: Partial<ClipEffects>) => void;
  moveClip: (clipId: string, trackId: string, newStart: number) => void;
  removeClip: (clipId: string) => void;
  duplicateClip: (clipId: string) => void;
  splitClipAtTime: (clipId: string, time: number) => void;
  commitHistory: () => void;

  selectClip: (id: string | null) => void;
  setCurrentTime: (t: number) => void;
  setIsPlaying: (v: boolean) => void;
  togglePlay: () => void;
  setZoom: (z: number) => void;
  toggleSnapping: () => void;

  undo: () => void;
  redo: () => void;

  setExporting: (v: boolean) => void;
  setExportProgress: (v: number) => void;

    setShuttleRate: (r: number) => void;
  toggleHighContrast: () => void;
  toggleReduceMotion: () => void;
  toggleLargeUI: () => void;

  setShuttleRate: (r) => set({ shuttleRate: r }),
  toggleHighContrast: () => set((s) => ({ highContrast: !s.highContrast })),
  toggleReduceMotion: () => set((s) => ({ reduceMotion: !s.reduceMotion })),
  toggleLargeUI: () => set((s) => ({ largeUI: !s.largeUI })),

  newProject: () => void;
}

const MAX_HISTORY = 60;

function cloneTracks(tracks: Track[]): Track[] {
  return tracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, effects: { ...c.effects }, text: c.text ? { ...c.text } : undefined })) }));
}

function makeDefaultTracks(): Track[] {
  return [
    { id: uid("track"), type: "text", name: "Titles", clips: [], muted: false, hidden: false, locked: false },
    { id: uid("track"), type: "video", name: "Video 1", clips: [], muted: false, hidden: false, locked: false },
    { id: uid("track"), type: "audio", name: "Audio 1", clips: [], muted: false, hidden: false, locked: false },
  ];
}

export const useEditorStore = create<EditorState>((set, get) => ({
  projectName: "Untitled Projectt",
  mediaAssets: [],
  tracks: makeDefaultTracks(),
  selectedClipId: null,
  currentTime: 0,
  isPlaying: false,
  zoom: 80,
  snapping: true,
  past: [],
  future: [],
  isExporting: false,
  exportProgress: 0,
  
  shuttleRate: 0,
  highContrast: false,
  reduceMotion: false,
  largeUI: false,

  setProjectName: (name) => set({ projectName: name }),

  addMedia: (assets) => set((s) => ({ mediaAssets: [...s.mediaAssets, ...assets] })),
  removeMedia: (id) => set((s) => ({ mediaAssets: s.mediaAssets.filter((m) => m.id !== id) })),
  setMediaWaveform: (id, waveform) =>
    set((s) => ({ mediaAssets: s.mediaAssets.map((m) => (m.id === id ? { ...m, waveform } : m)) })),

  addTrack: (type, name) => {
    const id = uid("track");
    set((s) => {
      const count = s.tracks.filter((t) => t.type === type).length + 1;
      const track: Track = {
        id,
        type,
        name: name || `${type === "video" ? "Video" : type === "audio" ? "Audio" : "Text"} ${count}`,
        clips: [],
        muted: false,
        hidden: false,
        locked: false,
      };
      const tracks = type === "text" ? [track, ...s.tracks] : [...s.tracks, track];
      return { tracks, past: pushHistory(s), future: [] };
    });
    return id;
  },

  removeTrack: (id) =>
    set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id), past: pushHistory(s), future: [] })),

  toggleTrackProp: (id, prop) =>
    set((s) => ({
      tracks: s.tracks.map((t) => (t.id === id ? { ...t, [prop]: !t[prop] } : t)),
    })),

  renameTrack: (id, name) =>
    set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, name } : t)) })),

  addClip: (trackId, clip) =>
    set((s) => ({
      tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t)),
      selectedClipId: clip.id,
      past: pushHistory(s),
      future: [],
    })),

  updateClip: (clipId, patch, record = true) =>
    set((s) => ({
      tracks: s.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)),
      })),
      ...(record ? { past: pushHistory(s), future: [] } : {}),
    })),

  updateClipEffects: (clipId, patch) =>
    set((s) => ({
      tracks: s.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? { ...c, effects: { ...c.effects, ...patch } } : c)),
      })),
    })),

  moveClip: (clipId, trackId, newStart) =>
    set((s) => {
      let moving: Clip | null = null;
      const strippedTracks = s.tracks.map((t) => {
        const found = t.clips.find((c) => c.id === clipId);
        if (found) moving = found;
        return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
      });
      if (!moving) return {};
      const updated = { ...(moving as Clip), trackId, start: Math.max(0, newStart) };
      return {
        tracks: strippedTracks.map((t) => (t.id === trackId ? { ...t, clips: [...t.clips, updated] } : t)),
      };
    }),

  removeClip: (clipId) =>
    set((s) => ({
      tracks: s.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) })),
      selectedClipId: s.selectedClipId === clipId ? null : s.selectedClipId,
      past: pushHistory(s),
      future: [],
    })),

  duplicateClip: (clipId) =>
    set((s) => {
      let newClip: Clip | null = null;
      const tracks = s.tracks.map((t) => {
        const idx = t.clips.findIndex((c) => c.id === clipId);
        if (idx === -1) return t;
        const original = t.clips[idx];
        newClip = { ...original, id: uid("clip"), start: original.start + original.duration + 0.2, effects: { ...original.effects }, text: original.text ? { ...original.text } : undefined };
        return { ...t, clips: [...t.clips, newClip] };
      });
      return { tracks, selectedClipId: newClip ? (newClip as Clip).id : s.selectedClipId, past: pushHistory(s), future: [] };
    }),

  splitClipAtTime: (clipId, time) =>
    set((s) => {
      const tracks = s.tracks.map((t) => {
        const idx = t.clips.findIndex((c) => c.id === clipId);
        if (idx === -1) return t;
        const c = t.clips[idx];
        if (time <= c.start + 0.05 || time >= c.start + c.duration - 0.05) return t;
        const firstDuration = time - c.start;
        const secondDuration = c.duration - firstDuration;
        const first: Clip = { ...c, duration: firstDuration };
        const second: Clip = {
          ...c,
          id: uid("clip"),
          start: time,
          duration: secondDuration,
          trimIn: c.trimIn + firstDuration * c.effects.speed,
        };
        const clips = [...t.clips];
        clips.splice(idx, 1, first, second);
        return { ...t, clips };
      });
      return { tracks, past: pushHistory(s), future: [] };
    }),

  commitHistory: () => set((s) => ({ past: pushHistory(s), future: [] })),

  selectClip: (id) => set({ selectedClipId: id }),
  setCurrentTime: (t) => set({ currentTime: Math.max(0, t) }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  togglePlay: () =>
    set((s) => {
      const duration = getProjectDuration(s.tracks);
      if (!s.isPlaying && s.currentTime >= duration) {
        return { isPlaying: true, currentTime: 0 };
      }
      return { isPlaying: !s.isPlaying };
    }),
  setZoom: (z) => set({ zoom: Math.min(400, Math.max(10, z)) }),
  toggleSnapping: () => set((s) => ({ snapping: !s.snapping })),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return {};
      const prev = s.past[s.past.length - 1];
      const rest = s.past.slice(0, -1);
      return {
        tracks: cloneTracks(prev.tracks),
        past: rest,
        future: [{ tracks: cloneTracks(s.tracks) }, ...s.future].slice(0, MAX_HISTORY),
      };
    }),
  redo: () =>
    set((s) => {
      if (s.future.length === 0) return {};
      const next = s.future[0];
      const rest = s.future.slice(1);
      return {
        tracks: cloneTracks(next.tracks),
        future: rest,
        past: [...s.past, { tracks: cloneTracks(s.tracks) }].slice(-MAX_HISTORY),
      };
    }),

  setExporting: (v) => set({ isExporting: v, exportProgress: v ? 0 : get().exportProgress }),
  setExportProgress: (v) => set({ exportProgress: v }),

  newProject: () =>
    set({
      tracks: makeDefaultTracks(),
      mediaAssets: [],
      selectedClipId: null,
      currentTime: 0,
      isPlaying: false,
      past: [],
      future: [],
      projectName: "Untitled Projectt",
    }),
}));

function pushHistory(s: EditorState): HistoryEntry[] {
  const entry: HistoryEntry = { tracks: cloneTracks(s.tracks) };
  return [...s.past, entry].slice(-MAX_HISTORY);
}

export function newTextClipDefaults(trackId: string, start: number) {
  return {
    id: uid("clip"),
    trackId,
    name: "Title",
    color: pickClipColor(),
    start,
    duration: 4,
    trimIn: 0,
    effects: defaultEffects(),
    text: defaultTextStyle(),
  } satisfies Clip;
}
