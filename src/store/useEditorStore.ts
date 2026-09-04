import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import {
  AnimProp,
  BlendMode,
  Clip,
  ClipAudio,
  ClipEffects,
  Crop,
  Easing,
  Marker,
  MediaAsset,
  ProjectSettings,
  SerializedProject,
  SolidStyle,
  TextStyle,
  ToolMode,
  Track,
  TrackType,
  Transform,
  Transition,
  defaultAudio,
  defaultCrop,
  defaultEffects,
  defaultProjectSettings,
  defaultSolid,
  defaultTextStyle,
  defaultTransform,
  ChromaKey,
  ClipMask,
  defaultChromaKey,
  defaultMask,
} from "../types";
import { allClips, clamp, findClip, getProjectDuration, pickClipColor, uid } from "../lib/utils";
import { baseValue, evaluateKeyframes, keyframeAt, removeKeyframeAt, scaleKeyframes, shiftKeyframes, upsertKeyframe } from "../lib/keyframes";

// ─────────────────────────────────────────────────────────────────────────────

export type LeftTab = "media" | "text" | "elements" | "transitions" | "looks";
export type RightTab = "inspector" | "audio" | "color" | "keyframes";

interface Snapshot {
  tracks: Track[];
  markers: Marker[];
}

export interface EditorState {
  // project
  projectName: string;
  settings: ProjectSettings;
  mediaAssets: MediaAsset[];
  tracks: Track[];
  markers: Marker[];
  inPoint: number | null;
  outPoint: number | null;

  // selection / clipboard
  selectedClipIds: string[];
  selectedClipId: string | null;
  clipboard: Clip[];

  // playback
  currentTime: number;
  isPlaying: boolean;
  shuttleRate: number;
  loopPlayback: boolean;
  masterVolume: number;
  masterMuted: boolean;

  // timeline ui
  zoom: number;
  snapping: boolean;
  rippleMode: boolean;
  tool: ToolMode;
  showSafeZones: boolean;
  showGrid: boolean;
  previewQuality: "full" | "half" | "quarter";

  // panels
  leftTab: LeftTab;
  rightTab: RightTab;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;

  // history
  past: Snapshot[];
  future: Snapshot[];
  pending: Snapshot | null;
  dirty: boolean;

  // export
  isExporting: boolean;
  exportProgress: number;

  // a11y
  highContrast: boolean;
  reduceMotion: boolean;
  largeUI: boolean;

  // toast
  toast: { id: number; message: string; kind: "info" | "error" | "success" } | null;

  // ── actions ──
  setProjectName: (name: string) => void;
  updateSettings: (patch: Partial<ProjectSettings>) => void;
  notify: (message: string, kind?: "info" | "error" | "success") => void;

  addMedia: (assets: MediaAsset[]) => void;
  removeMedia: (id: string) => void;
  patchMedia: (id: string, patch: Partial<MediaAsset>) => void;

  addTrack: (type: TrackType, name?: string) => string;
  removeTrack: (id: string) => void;
  toggleTrackProp: (id: string, prop: "muted" | "hidden" | "locked" | "solo") => void;
  renameTrack: (id: string, name: string) => void;
  setTrackVolume: (id: string, volume: number) => void;
  setTrackHeight: (id: string, height: Track["height"]) => void;
  moveTrack: (id: string, dir: -1 | 1) => void;

  addClip: (trackId: string, clip: Clip, select?: boolean) => void;
  addMediaToTimeline: (assetId: string, opts?: { trackId?: string; start?: number; select?: boolean }) => void;
  addTextClip: (style?: Partial<TextStyle>, transform?: Partial<Transform>, duration?: number, name?: string) => void;
  addSolidClip: (solid: Partial<SolidStyle>, name?: string, extra?: Partial<Clip>) => void;
  /** Adds an adjustment layer above everything at the playhead (grades all layers below it). */
  addAdjustmentLayer: (duration?: number) => void;

  updateClip: (clipId: string, patch: Partial<Clip>, record?: boolean) => void;
  updateClips: (clipIds: string[], patch: Partial<Clip> | ((c: Clip) => Partial<Clip>), record?: boolean) => void;
  updateClipEffects: (clipId: string, patch: Partial<ClipEffects>, record?: boolean) => void;
  updateClipTransform: (clipId: string, patch: Partial<Transform>, record?: boolean) => void;
  updateClipCrop: (clipId: string, patch: Partial<Crop>, record?: boolean) => void;
  updateClipAudio: (clipId: string, patch: Partial<ClipAudio>, record?: boolean) => void;
  updateClipText: (clipId: string, patch: Partial<TextStyle>, record?: boolean) => void;
  updateClipSolid: (clipId: string, patch: Partial<SolidStyle>, record?: boolean) => void;
  updateClipChromaKey: (clipId: string, patch: Partial<ChromaKey>, record?: boolean) => void;
  updateClipMask: (clipId: string, patch: Partial<ClipMask>, record?: boolean) => void;
  setClipTransition: (clipId: string, transition: Transition | undefined) => void;
  setClipBlendMode: (clipId: string, mode: BlendMode) => void;
  setClipSpeed: (clipId: string, speed: number) => void;
  setClipColor: (clipIds: string[], color: string) => void;

  moveClips: (clipIds: string[], deltaTime: number, targetTrackId?: string, record?: boolean) => void;
  /** Absolute placement used by interactive drags: sets start/trackId for each clip. */
  placeClips: (placements: { id: string; start: number; trackId: string }[]) => void;
  resolveOverlaps: (clipIds: string[]) => void;
  removeClips: (clipIds: string[], ripple?: boolean) => void;
  duplicateClips: (clipIds: string[]) => void;
  splitAtTime: (time: number, clipIds?: string[]) => void;
  trimToPlayhead: (side: "start" | "end") => void;
  closeGapAt: (trackId: string, time: number) => void;
  linkClips: (clipIds: string[]) => void;
  unlinkClips: (clipIds: string[]) => void;
  detachAudio: (clipId: string) => void;
  nudgeClips: (clipIds: string[], frames: number) => void;
  alignClipsToPlayhead: (clipIds: string[]) => void;

  // keyframes
  toggleKeyframe: (clipId: string, prop: AnimProp) => void;
  setKeyframeValue: (clipId: string, prop: AnimProp, value: number, record?: boolean) => void;
  removeKeyframe: (clipId: string, prop: AnimProp, time: number) => void;
  clearKeyframes: (clipId: string, prop?: AnimProp) => void;
  setKeyframeEasing: (clipId: string, prop: AnimProp, time: number, easing: Easing) => void;

  // markers / in-out
  addMarker: (time?: number, label?: string) => void;
  /** Bulk marker insert (used by beat detection). Replaces markers with the same `tag`. */
  addMarkers: (markers: { time: number; label: string; color?: string }[], tag?: string) => void;
  removeMarkersByTag: (tag: string) => void;
  /** Slice every clip on the given tracks at each time. */
  splitAtTimes: (times: number[], trackIds?: string[]) => void;
  updateMarker: (id: string, patch: Partial<Marker>) => void;
  removeMarker: (id: string) => void;
  setInPoint: (t: number | null) => void;
  setOutPoint: (t: number | null) => void;
  clearInOut: () => void;

  // selection
  selectClip: (id: string | null, additive?: boolean) => void;
  selectClips: (ids: string[]) => void;
  toggleClipSelection: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  copySelected: () => void;
  cutSelected: () => void;
  pasteClipboard: () => void;

  // playback
  setCurrentTime: (t: number) => void;
  setIsPlaying: (v: boolean) => void;
  togglePlay: () => void;
  setShuttleRate: (r: number) => void;
  toggleLoop: () => void;
  setMasterVolume: (v: number) => void;
  toggleMasterMute: () => void;
  jumpToEdit: (dir: -1 | 1) => void;

  // ui
  setZoom: (z: number) => void;
  toggleSnapping: () => void;
  toggleRipple: () => void;
  setTool: (t: ToolMode) => void;
  toggleSafeZones: () => void;
  toggleGrid: () => void;
  setPreviewQuality: (q: EditorState["previewQuality"]) => void;
  setLeftTab: (t: LeftTab) => void;
  setRightTab: (t: RightTab) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;

  // history
  commitHistory: () => void;
  undo: () => void;
  redo: () => void;

  setExporting: (v: boolean) => void;
  setExportProgress: (v: number) => void;

  setShuttleRateRaw: (r: number) => void;
  toggleHighContrast: () => void;
  toggleReduceMotion: () => void;
  toggleLargeUI: () => void;

  newProject: () => void;
  serialize: () => SerializedProject;
  loadProject: (p: SerializedProject, assets: MediaAsset[]) => void;
  markSaved: () => void;
}

const MAX_HISTORY = 100;

// ─────────────────────────────────────────────────────────────────────────────
// helpers

function snapshot(s: Pick<EditorState, "tracks" | "markers">): Snapshot {
  return structuredClone({ tracks: s.tracks, markers: s.markers });
}

/** Flush pending (live edit) snapshot, then push current state as history. */
function record(s: EditorState): Pick<EditorState, "past" | "future" | "pending" | "dirty"> {
  const base = s.pending ?? snapshot(s);
  return { past: [...s.past, base].slice(-MAX_HISTORY), future: [], pending: null, dirty: true };
}

/** Start/continue a live edit without recording. */
function live(s: EditorState): Pick<EditorState, "pending" | "dirty"> {
  return { pending: s.pending ?? snapshot(s), dirty: true };
}

function trackLabel(type: TrackType, n: number) {
  return type === "video" ? `V${n}` : `A${n}`;
}

function makeTrack(type: TrackType, name: string): Track {
  return { id: uid("track"), type, name, clips: [], muted: false, solo: false, hidden: false, locked: false, volume: 100, height: "m" };
}

function makeDefaultTracks(): Track[] {
  return [makeTrack("video", "V2"), makeTrack("video", "V1"), makeTrack("audio", "A1"), makeTrack("audio", "A2")];
}

export function makeClip(partial: Partial<Clip> & Pick<Clip, "trackId" | "kind" | "name" | "start" | "duration">): Clip {
  return {
    id: uid("clip"),
    color: pickClipColor(),
    trimIn: 0,
    speed: 1,
    effects: defaultEffects(),
    transform: defaultTransform(),
    crop: defaultCrop(),
    cornerRadius: 0,
    fit: "contain",
    blendMode: "source-over",
    keyframes: {},
    audio: defaultAudio(),
    ...partial,
    mediaId: partial.mediaId,
  };
}

function cloneClip(c: Clip, overrides: Partial<Clip> = {}): Clip {
  return structuredClone({ ...c, ...overrides });
}

function mapClips(tracks: Track[], ids: Set<string> | string[], fn: (c: Clip, t: Track) => Clip): Track[] {
  const set = ids instanceof Set ? ids : new Set(ids);
  return tracks.map((t) => (t.clips.some((c) => set.has(c.id)) ? { ...t, clips: t.clips.map((c) => (set.has(c.id) ? fn(c, t) : c)) } : t));
}

/** Expand a set of clip ids to include linked partners. */
function expandLinked(tracks: Track[], ids: string[]): string[] {
  const clips = allClips(tracks);
  const groups = new Set(clips.filter((c) => ids.includes(c.id) && c.linkGroup).map((c) => c.linkGroup!));
  const out = new Set(ids);
  for (const c of clips) if (c.linkGroup && groups.has(c.linkGroup)) out.add(c.id);
  return Array.from(out);
}

/** Overwrite-mode overlap resolution: clips in `ids` win; others on the same track are trimmed/split/removed. */
function resolveOverlapsIn(tracks: Track[], ids: string[]): Track[] {
  const set = new Set(ids);
  return tracks.map((t) => {
    const winners = t.clips.filter((c) => set.has(c.id));
    if (!winners.length) return t;
    let others = t.clips.filter((c) => !set.has(c.id));
    for (const w of winners) {
      const ws = w.start;
      const we = w.start + w.duration;
      const next: Clip[] = [];
      for (const o of others) {
        const os = o.start;
        const oe = o.start + o.duration;
        if (oe <= ws + 1e-6 || os >= we - 1e-6) {
          next.push(o);
          continue;
        }
        // overlap
        if (os < ws - 1e-6) {
          const d = ws - os;
          next.push({ ...o, duration: d, keyframes: o.keyframes });
        }
        if (oe > we + 1e-6) {
          const cut = we - os;
          next.push({
            ...o,
            id: os < ws - 1e-6 ? uid("clip") : o.id,
            start: we,
            duration: oe - we,
            trimIn: o.trimIn + cut * o.speed,
            keyframes: shiftKeyframes(o.keyframes, -cut, oe - we),
            transitionIn: undefined,
          });
        }
      }
      others = next;
    }
    return { ...t, clips: [...others, ...winners].sort((a, b) => a.start - b.start) };
  });
}

function splitClip(c: Clip, time: number): [Clip, Clip] | null {
  const local = time - c.start;
  if (local <= 0.02 || local >= c.duration - 0.02) return null;
  const left: Clip = { ...c, duration: local, keyframes: shiftKeyframes(c.keyframes, 0, local) };
  const right: Clip = {
    ...c,
    id: uid("clip"),
    start: time,
    duration: c.duration - local,
    trimIn: c.trimIn + local * c.speed,
    keyframes: shiftKeyframes(c.keyframes, -local, c.duration - local),
    transitionIn: undefined,
    linkGroup: c.linkGroup,
  };
  // fades: keep visual fades at outer edges only
  left.effects = { ...left.effects, fadeOut: 0 };
  right.effects = { ...right.effects, fadeIn: 0 };
  left.audio = { ...left.audio, fadeOut: 0 };
  right.audio = { ...right.audio, fadeIn: 0 };
  return [left, right];
}

// ─────────────────────────────────────────────────────────────────────────────

let toastSeq = 0;

export const useEditorStore = create<EditorState>((set, get) => ({
  projectName: "Untitled Project",
  settings: defaultProjectSettings(),
  mediaAssets: [],
  tracks: makeDefaultTracks(),
  markers: [],
  inPoint: null,
  outPoint: null,

  selectedClipIds: [],
  selectedClipId: null,
  clipboard: [],

  currentTime: 0,
  isPlaying: false,
  shuttleRate: 0,
  loopPlayback: false,
  masterVolume: 100,
  masterMuted: false,

  zoom: 60,
  snapping: true,
  rippleMode: false,
  tool: "select",
  showSafeZones: false,
  showGrid: false,
  previewQuality: "half",

  leftTab: "media",
  rightTab: "inspector",
  leftPanelOpen: true,
  rightPanelOpen: true,

  past: [],
  future: [],
  pending: null,
  dirty: false,

  isExporting: false,
  exportProgress: 0,

  highContrast: false,
  reduceMotion: false,
  largeUI: false,

  toast: null,

  // ── project ──
  setProjectName: (name) => set({ projectName: name, dirty: true }),
  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch }, dirty: true })),
  notify: (message, kind = "info") => {
    const id = ++toastSeq;
    set({ toast: { id, message, kind } });
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, 3200);
  },

  // ── media ──
  addMedia: (assets) => set((s) => ({ mediaAssets: [...s.mediaAssets, ...assets], dirty: true })),
  removeMedia: (id) =>
    set((s) => {
      const usedIds = allClips(s.tracks).filter((c) => c.mediaId === id).map((c) => c.id);
      const tracks = usedIds.length ? s.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.mediaId !== id) })) : s.tracks;
      return {
        mediaAssets: s.mediaAssets.filter((m) => m.id !== id),
        tracks,
        selectedClipIds: s.selectedClipIds.filter((x) => !usedIds.includes(x)),
        selectedClipId: usedIds.includes(s.selectedClipId ?? "") ? null : s.selectedClipId,
        ...(usedIds.length ? record(s) : {}),
      };
    }),
  patchMedia: (id, patch) => set((s) => ({ mediaAssets: s.mediaAssets.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),

  // ── tracks ──
  addTrack: (type, name) => {
    const id = uid("track");
    set((s) => {
      const count = s.tracks.filter((t) => t.type === type).length + 1;
      const track: Track = { ...makeTrack(type, name || trackLabel(type, count)), id };
      const tracks = type === "video" ? [track, ...s.tracks] : [...s.tracks, track];
      return { tracks, ...record(s) };
    });
    return id;
  },
  removeTrack: (id) =>
    set((s) => {
      const removedIds = s.tracks.find((t) => t.id === id)?.clips.map((c) => c.id) ?? [];
      return {
        tracks: s.tracks.filter((t) => t.id !== id),
        selectedClipIds: s.selectedClipIds.filter((x) => !removedIds.includes(x)),
        ...record(s),
      };
    }),
  toggleTrackProp: (id, prop) => set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, [prop]: !t[prop] } : t)), dirty: true })),
  renameTrack: (id, name) => set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, name } : t)), dirty: true })),
  setTrackVolume: (id, volume) => set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, volume: clamp(volume, 0, 200) } : t)), dirty: true })),
  setTrackHeight: (id, height) => set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, height } : t)) })),
  moveTrack: (id, dir) =>
    set((s) => {
      const idx = s.tracks.findIndex((t) => t.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= s.tracks.length) return {};
      if (s.tracks[j].type !== s.tracks[idx].type) return {};
      const tracks = [...s.tracks];
      [tracks[idx], tracks[j]] = [tracks[j], tracks[idx]];
      return { tracks, ...record(s) };
    }),

  // ── clip creation ──
  addClip: (trackId, clip, select = true) =>
    set((s) => {
      const tracks = resolveOverlapsIn(
        s.tracks.map((t) => (t.id === trackId ? { ...t, clips: [...t.clips, { ...clip, trackId }] } : t)),
        [clip.id]
      );
      return { tracks, ...(select ? { selectedClipIds: [clip.id], selectedClipId: clip.id } : {}), ...record(s) };
    }),

  addMediaToTimeline: (assetId, opts = {}) => {
    const s = get();
    const asset = s.mediaAssets.find((m) => m.id === assetId);
    if (!asset || asset.missing) return;
    const isAudioOnly = asset.type === "audio";
    const wantType: TrackType = isAudioOnly ? "audio" : "video";

    let tracks = s.tracks;
    let trackId = opts.trackId;
    if (trackId) {
      const tr = tracks.find((t) => t.id === trackId);
      if (!tr || tr.type !== wantType || tr.locked) trackId = undefined;
    }
    if (!trackId) {
      const candidates = tracks.filter((t) => t.type === wantType && !t.locked);
      // Prefer the primary track (bottom video / top audio)
      const primary = wantType === "video" ? candidates[candidates.length - 1] : candidates[0];
      if (primary) trackId = primary.id;
      else {
        const nt = makeTrack(wantType, trackLabel(wantType, 1));
        tracks = wantType === "video" ? [nt, ...tracks] : [...tracks, nt];
        trackId = nt.id;
      }
    }
    const targetTrack = tracks.find((t) => t.id === trackId)!;
    const start = opts.start ?? Math.max(s.currentTime, 0);
    // If dropping at playhead and something occupies it, append at end of that track instead.
    let placeAt = start;
    if (opts.start === undefined) {
      const occupied = targetTrack.clips.some((c) => start > c.start - 1e-6 && start < c.start + c.duration - 1e-6);
      if (occupied) placeAt = targetTrack.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
    }
    const duration = asset.duration;
    const main = makeClip({
      trackId,
      kind: "media",
      mediaId: asset.id,
      name: asset.name.replace(/\.[^.]+$/, ""),
      start: placeAt,
      duration,
      color: isAudioOnly ? "#10b981" : asset.type === "image" ? "#8b5cf6" : "#6366f1",
    });
    const newIds = [main.id];
    let newTracks = tracks.map((t) => (t.id === trackId ? { ...t, clips: [...t.clips, main] } : t));

    // Video with audio → linked audio clip on first free audio track
    if (asset.type === "video" && asset.hasAudio !== false) {
      const linkGroup = uid("link");
      main.linkGroup = linkGroup;
      main.audioDetached = true; // audio lives on the linked audio clip
      let audioTracks = newTracks.filter((t) => t.type === "audio" && !t.locked);
      if (!audioTracks.length) {
        const nt = makeTrack("audio", "A1");
        newTracks = [...newTracks, nt];
        audioTracks = [nt];
      }
      // choose the first audio track with no overlap
      let aTrack =
        audioTracks.find((t) => !t.clips.some((c) => placeAt < c.start + c.duration && placeAt + duration > c.start)) ?? audioTracks[0];
      const aClip = makeClip({
        trackId: aTrack.id,
        kind: "media",
        mediaId: asset.id,
        name: main.name,
        start: placeAt,
        duration,
        color: "#10b981",
        linkGroup,
      });
      newIds.push(aClip.id);
      newTracks = newTracks.map((t) => (t.id === aTrack.id ? { ...t, clips: [...t.clips, aClip] } : t));
    }
    newTracks = resolveOverlapsIn(newTracks, newIds);
    set({
      tracks: newTracks,
      ...(opts.select === false ? {} : { selectedClipIds: newIds, selectedClipId: main.id }),
      ...record(s),
    });
  },

  addTextClip: (style, transform, duration = 4, name = "Title") => {
    const s = get();
    let tracks = s.tracks;
    // Put titles on the top-most unlocked video track that is free at playhead; create one if needed.
    const start = s.currentTime;
    const videoTracks = tracks.filter((t) => t.type === "video" && !t.locked);
    let target = videoTracks.find((t) => !t.clips.some((c) => start < c.start + c.duration && start + duration > c.start));
    if (!target) {
      const n = tracks.filter((t) => t.type === "video").length + 1;
      target = makeTrack("video", trackLabel("video", n));
      tracks = [target, ...tracks];
    }
    const clip = makeClip({
      trackId: target.id,
      kind: "text",
      name,
      start,
      duration,
      color: "#f59e0b",
      text: { ...defaultTextStyle(), ...(style ?? {}) },
      transform: { ...defaultTransform(), ...(transform ?? {}) },
    });
    tracks = tracks.map((t) => (t.id === target!.id ? { ...t, clips: [...t.clips, clip] } : t));
    set({ tracks: resolveOverlapsIn(tracks, [clip.id]), selectedClipIds: [clip.id], selectedClipId: clip.id, rightTab: "inspector", ...record(s) });
  },

  addSolidClip: (solid, name = "Solid", extra = {}) => {
    const s = get();
    let tracks = s.tracks;
    const start = s.currentTime;
    const duration = 5;
    const videoTracks = tracks.filter((t) => t.type === "video" && !t.locked);
    let target = videoTracks.find((t) => !t.clips.some((c) => start < c.start + c.duration && start + duration > c.start));
    if (!target) {
      const n = tracks.filter((t) => t.type === "video").length + 1;
      target = makeTrack("video", trackLabel("video", n));
      tracks = [target, ...tracks];
    }
    const clip = makeClip({
      trackId: target.id,
      kind: "solid",
      name,
      start,
      duration,
      color: "#64748b",
      solid: { ...defaultSolid(), ...solid },
      ...extra,
    });
    tracks = tracks.map((t) => (t.id === target!.id ? { ...t, clips: [...t.clips, clip] } : t));
    set({ tracks: resolveOverlapsIn(tracks, [clip.id]), selectedClipIds: [clip.id], selectedClipId: clip.id, ...record(s) });
  },

  addAdjustmentLayer: (duration) => {
    const s = get();
    let tracks = s.tracks;
    const start = s.currentTime;
    const total = getProjectDuration(tracks);
    const dur = duration ?? Math.max(1, total - start || 5);
    // Adjustment layers want to sit on top: use the top-most video track if it's free, otherwise add one.
    const top = tracks.find((t) => t.type === "video");
    let target = top && !top.locked && !top.clips.some((c) => start < c.start + c.duration && start + dur > c.start) ? top : undefined;
    if (!target) {
      const n = tracks.filter((t) => t.type === "video").length + 1;
      target = makeTrack("video", trackLabel("video", n));
      tracks = [target, ...tracks];
    }
    const clip = makeClip({
      trackId: target.id,
      kind: "adjustment",
      name: "Adjustment",
      start,
      duration: dur,
      color: "#a855f7",
      mask: defaultMask(),
    });
    tracks = tracks.map((t) => (t.id === target!.id ? { ...t, clips: [...t.clips, clip] } : t));
    set({ tracks: resolveOverlapsIn(tracks, [clip.id]), selectedClipIds: [clip.id], selectedClipId: clip.id, rightTab: "color", ...record(s) });
    get().notify("Adjustment layer added — everything below it is graded by its Color tab", "info");
  },

  // ── clip updates ──
  updateClip: (clipId, patch, rec = true) =>
    set((s) => ({
      tracks: mapClips(s.tracks, [clipId], (c) => ({ ...c, ...patch })),
      ...(rec ? record(s) : live(s)),
    })),
  updateClips: (clipIds, patch, rec = true) =>
    set((s) => ({
      tracks: mapClips(s.tracks, clipIds, (c) => ({ ...c, ...(typeof patch === "function" ? patch(c) : patch) })),
      ...(rec ? record(s) : live(s)),
    })),
  updateClipEffects: (clipId, patch, rec = false) =>
    set((s) => ({ tracks: mapClips(s.tracks, [clipId], (c) => ({ ...c, effects: { ...c.effects, ...patch } })), ...(rec ? record(s) : live(s)) })),
  updateClipTransform: (clipId, patch, rec = false) =>
    set((s) => ({ tracks: mapClips(s.tracks, [clipId], (c) => ({ ...c, transform: { ...c.transform, ...patch } })), ...(rec ? record(s) : live(s)) })),
  updateClipCrop: (clipId, patch, rec = false) =>
    set((s) => ({ tracks: mapClips(s.tracks, [clipId], (c) => ({ ...c, crop: { ...c.crop, ...patch } })), ...(rec ? record(s) : live(s)) })),
  updateClipAudio: (clipId, patch, rec = false) =>
    set((s) => ({ tracks: mapClips(s.tracks, [clipId], (c) => ({ ...c, audio: { ...c.audio, ...patch } })), ...(rec ? record(s) : live(s)) })),
  updateClipText: (clipId, patch, rec = false) =>
    set((s) => ({
      tracks: mapClips(s.tracks, [clipId], (c) => ({ ...c, text: { ...(c.text ?? defaultTextStyle()), ...patch } })),
      ...(rec ? record(s) : live(s)),
    })),
  updateClipSolid: (clipId, patch, rec = false) =>
    set((s) => ({
      tracks: mapClips(s.tracks, [clipId], (c) => ({ ...c, solid: { ...(c.solid ?? defaultSolid()), ...patch } })),
      ...(rec ? record(s) : live(s)),
    })),
  updateClipChromaKey: (clipId, patch, rec = false) =>
    set((s) => ({
      tracks: mapClips(s.tracks, [clipId], (c) => ({ ...c, chromaKey: { ...(c.chromaKey ?? defaultChromaKey()), ...patch } })),
      ...(rec ? record(s) : live(s)),
    })),
  updateClipMask: (clipId, patch, rec = false) =>
    set((s) => ({
      tracks: mapClips(s.tracks, [clipId], (c) => ({ ...c, mask: { ...(c.mask ?? defaultMask()), ...patch } })),
      ...(rec ? record(s) : live(s)),
    })),
  setClipTransition: (clipId, transition) =>
    set((s) => ({
      tracks: mapClips(s.tracks, [clipId], (c) => ({
        ...c,
        transitionIn: transition && transition.type !== "none" ? { ...transition, duration: clamp(transition.duration, 0.1, Math.max(0.1, c.duration)) } : undefined,
      })),
      ...record(s),
    })),
  setClipBlendMode: (clipId, mode) => set((s) => ({ tracks: mapClips(s.tracks, [clipId], (c) => ({ ...c, blendMode: mode })), ...record(s) })),
  setClipSpeed: (clipId, speed) =>
    set((s) => {
      speed = clamp(speed, 0.1, 8);
      const ids = expandLinked(s.tracks, [clipId]);
      const tracks = mapClips(s.tracks, ids, (c) => {
        const asset = s.mediaAssets.find((m) => m.id === c.mediaId);
        const sourceLen = c.duration * c.speed;
        let duration = sourceLen / speed;
        if (asset && asset.type !== "image") duration = Math.min(duration, (asset.duration - c.trimIn) / speed);
        const factor = duration / c.duration;
        return { ...c, speed, duration: Math.max(0.05, duration), keyframes: scaleKeyframes(c.keyframes, factor) };
      });
      return { tracks: resolveOverlapsIn(tracks, ids), ...record(s) };
    }),
  setClipColor: (clipIds, color) => set((s) => ({ tracks: mapClips(s.tracks, clipIds, (c) => ({ ...c, color })), ...record(s) })),

  // ── clip movement ──
  moveClips: (clipIds, deltaTime, targetTrackId, rec = false) =>
    set((s) => {
      const ids = expandLinked(s.tracks, clipIds);
      const clips = allClips(s.tracks).filter((c) => ids.includes(c.id));
      if (!clips.length) return {};
      const minStart = Math.min(...clips.map((c) => c.start));
      const d = Math.max(deltaTime, -minStart);
      // Track change only applies to the primary (first) clip and its same-type companions
      const primary = findClip(s.tracks, clipIds[0]);
      let trackShift = 0;
      if (targetTrackId && primary && targetTrackId !== primary.track.id) {
        const fromIdx = s.tracks.findIndex((t) => t.id === primary.track.id);
        const toIdx = s.tracks.findIndex((t) => t.id === targetTrackId);
        if (toIdx >= 0 && s.tracks[toIdx].type === primary.track.type && !s.tracks[toIdx].locked) trackShift = toIdx - fromIdx;
      }
      // Compute destination track per clip
      const dest = new Map<string, string>();
      for (const c of clips) {
        const fromIdx = s.tracks.findIndex((t) => t.id === c.trackId);
        let toIdx = fromIdx + trackShift;
        const type = s.tracks[fromIdx].type;
        if (trackShift !== 0) {
          // find same-type track at the shifted index; if invalid, keep
          if (toIdx < 0 || toIdx >= s.tracks.length || s.tracks[toIdx].type !== type || s.tracks[toIdx].locked) toIdx = fromIdx;
        }
        dest.set(c.id, s.tracks[toIdx].id);
      }
      const moved = new Map(clips.map((c) => [c.id, { ...c, start: Math.max(0, c.start + d), trackId: dest.get(c.id)! }]));
      const tracks = s.tracks.map((t) => {
        const kept = t.clips.filter((c) => !moved.has(c.id));
        const incoming = Array.from(moved.values()).filter((c) => c.trackId === t.id);
        return incoming.length || kept.length !== t.clips.length ? { ...t, clips: [...kept, ...incoming] } : t;
      });
      return { tracks, ...(rec ? record(s) : live(s)) };
    }),

  placeClips: (placements) =>
    set((s) => {
      const map = new Map(placements.map((p) => [p.id, p]));
      const moving = allClips(s.tracks).filter((c) => map.has(c.id)).map((c) => ({ ...c, start: Math.max(0, map.get(c.id)!.start), trackId: map.get(c.id)!.trackId }));
      const tracks = s.tracks.map((t) => {
        const kept = t.clips.filter((c) => !map.has(c.id));
        const incoming = moving.filter((c) => c.trackId === t.id);
        return incoming.length || kept.length !== t.clips.length ? { ...t, clips: [...kept, ...incoming] } : t;
      });
      return { tracks, ...live(s) };
    }),

  resolveOverlaps: (clipIds) => set((s) => ({ tracks: resolveOverlapsIn(s.tracks, expandLinked(s.tracks, clipIds)) })),

  removeClips: (clipIds, ripple) =>
    set((s) => {
      const ids = new Set(expandLinked(s.tracks, clipIds));
      const useRipple = ripple ?? s.rippleMode;
      const tracks = s.tracks.map((t) => {
        const removed = t.clips.filter((c) => ids.has(c.id));
        let remaining = t.clips.filter((c) => !ids.has(c.id));
        if (useRipple && removed.length) {
          for (const gone of removed.sort((a, b) => b.start - a.start)) {
            remaining = remaining.map((c) => (c.start >= gone.start + gone.duration - 1e-6 ? { ...c, start: Math.max(0, c.start - gone.duration) } : c));
          }
        }
        return removed.length ? { ...t, clips: remaining } : t;
      });
      return { tracks, selectedClipIds: [], selectedClipId: null, ...record(s) };
    }),

  duplicateClips: (clipIds) =>
    set((s) => {
      const ids = expandLinked(s.tracks, clipIds);
      const clips = allClips(s.tracks).filter((c) => ids.includes(c.id));
      if (!clips.length) return {};
      const groupEnd = Math.max(...clips.map((c) => c.start + c.duration));
      const groupStart = Math.min(...clips.map((c) => c.start));
      const offset = groupEnd - groupStart;
      const linkMap = new Map<string, string>();
      const created = clips.map((c) => {
        let lg = c.linkGroup;
        if (lg) {
          if (!linkMap.has(lg)) linkMap.set(lg, uid("link"));
          lg = linkMap.get(lg);
        }
        return cloneClip(c, { id: uid("clip"), start: c.start + offset, linkGroup: lg });
      });
      let tracks = s.tracks.map((t) => {
        const add = created.filter((c) => c.trackId === t.id);
        return add.length ? { ...t, clips: [...t.clips, ...add] } : t;
      });
      tracks = resolveOverlapsIn(
        tracks,
        created.map((c) => c.id)
      );
      const newIds = created.map((c) => c.id);
      return { tracks, selectedClipIds: newIds, selectedClipId: newIds[0], ...record(s) };
    }),

  splitAtTime: (time, clipIds) =>
    set((s) => {
      let targets: string[];
      if (clipIds && clipIds.length) targets = expandLinked(s.tracks, clipIds);
      else {
        targets = s.tracks.filter((t) => !t.locked).flatMap((t) => t.clips.filter((c) => time > c.start + 0.02 && time < c.start + c.duration - 0.02).map((c) => c.id));
      }
      if (!targets.length) return {};
      let changed = false;
      const newSel: string[] = [];
      const linkRemap = new Map<string, string>();
      const tracks = s.tracks.map((t) => {
        if (!t.clips.some((c) => targets.includes(c.id))) return t;
        const clips: Clip[] = [];
        for (const c of t.clips) {
          if (!targets.includes(c.id)) {
            clips.push(c);
            continue;
          }
          const parts = splitClip(c, time);
          if (!parts) {
            clips.push(c);
            continue;
          }
          changed = true;
          const [l, r] = parts;
          if (r.linkGroup) {
            if (!linkRemap.has(r.linkGroup)) linkRemap.set(r.linkGroup, uid("link"));
            r.linkGroup = linkRemap.get(r.linkGroup);
          }
          clips.push(l, r);
          newSel.push(r.id);
        }
        return { ...t, clips };
      });
      if (!changed) return {};
      return { tracks, selectedClipIds: newSel, selectedClipId: newSel[0] ?? null, ...record(s) };
    }),

  trimToPlayhead: (side) =>
    set((s) => {
      const t = s.currentTime;
      const ids = expandLinked(s.tracks, s.selectedClipIds);
      const targets = ids.length ? ids : s.tracks.filter((tr) => !tr.locked).flatMap((tr) => tr.clips.filter((c) => t > c.start && t < c.start + c.duration).map((c) => c.id));
      if (!targets.length) return {};
      const tracks = mapClips(s.tracks, targets, (c) => {
        if (t <= c.start + 0.02 || t >= c.start + c.duration - 0.02) return c;
        if (side === "start") {
          const cut = t - c.start;
          return { ...c, start: t, duration: c.duration - cut, trimIn: c.trimIn + cut * c.speed, keyframes: shiftKeyframes(c.keyframes, -cut, c.duration - cut) };
        }
        return { ...c, duration: t - c.start, keyframes: shiftKeyframes(c.keyframes, 0, t - c.start) };
      });
      return { tracks, ...record(s) };
    }),

  closeGapAt: (trackId, time) =>
    set((s) => {
      const track = s.tracks.find((t) => t.id === trackId);
      if (!track) return {};
      const sorted = [...track.clips].sort((a, b) => a.start - b.start);
      const prevEnd = sorted.filter((c) => c.start + c.duration <= time + 1e-6).reduce((m, c) => Math.max(m, c.start + c.duration), 0);
      const next = sorted.find((c) => c.start >= time - 1e-6);
      if (!next) return {};
      const gap = next.start - prevEnd;
      if (gap <= 1e-6) return {};
      const tracks = s.tracks.map((t) =>
        t.id === trackId ? { ...t, clips: t.clips.map((c) => (c.start >= next.start - 1e-6 ? { ...c, start: c.start - gap } : c)) } : t
      );
      return { tracks, ...record(s) };
    }),

  linkClips: (clipIds) =>
    set((s) => {
      if (clipIds.length < 2) return {};
      const groupId = uid("link");
      return { tracks: mapClips(s.tracks, clipIds, (c) => ({ ...c, linkGroup: groupId })), ...record(s) };
    }),
  unlinkClips: (clipIds) =>
    set((s) => ({ tracks: mapClips(s.tracks, expandLinked(s.tracks, clipIds), (c) => ({ ...c, linkGroup: undefined })), ...record(s) })),

  detachAudio: (clipId) =>
    set((s) => {
      const found = findClip(s.tracks, clipId);
      if (!found || found.track.type !== "video" || found.clip.kind !== "media" || found.clip.audioDetached) return {};
      const asset = s.mediaAssets.find((m) => m.id === found.clip.mediaId);
      if (!asset || asset.type !== "video") return {};
      let tracks = s.tracks;
      let aTrack = tracks.find((t) => t.type === "audio" && !t.locked);
      if (!aTrack) {
        aTrack = makeTrack("audio", "A1");
        tracks = [...tracks, aTrack];
      }
      const linkGroup = found.clip.linkGroup ?? uid("link");
      const aClip = makeClip({
        trackId: aTrack.id,
        kind: "media",
        mediaId: asset.id,
        name: found.clip.name,
        start: found.clip.start,
        duration: found.clip.duration,
        trimIn: found.clip.trimIn,
        speed: found.clip.speed,
        color: "#10b981",
        linkGroup,
        audio: { ...found.clip.audio },
      });
      tracks = mapClips(tracks, [clipId], (c) => ({ ...c, audioDetached: true, linkGroup }));
      tracks = tracks.map((t) => (t.id === aTrack!.id ? { ...t, clips: [...t.clips, aClip] } : t));
      return { tracks: resolveOverlapsIn(tracks, [aClip.id]), ...record(s) };
    }),

  nudgeClips: (clipIds, frames) => {
    const s = get();
    const delta = frames / s.settings.fps;
    s.moveClips(clipIds, delta, undefined, true);
    get().resolveOverlaps(clipIds);
  },

  alignClipsToPlayhead: (clipIds) =>
    set((s) => {
      const ids = expandLinked(s.tracks, clipIds);
      const clips = allClips(s.tracks).filter((c) => ids.includes(c.id));
      if (!clips.length) return {};
      const minStart = Math.min(...clips.map((c) => c.start));
      const d = s.currentTime - minStart;
      const tracks = mapClips(s.tracks, ids, (c) => ({ ...c, start: c.start + d }));
      return { tracks: resolveOverlapsIn(tracks, ids), ...record(s) };
    }),

  // ── keyframes ──
  toggleKeyframe: (clipId, prop) =>
    set((s) => {
      const found = findClip(s.tracks, clipId);
      if (!found) return {};
      const local = clamp(s.currentTime - found.clip.start, 0, found.clip.duration);
      const existing = keyframeAt(found.clip.keyframes, prop, local);
      const tracks = mapClips(s.tracks, [clipId], (c) => {
        if (existing) return { ...c, keyframes: removeKeyframeAt(c.keyframes, prop, local) };
        const cur = c.keyframes[prop]?.length ? (evaluateAt(c, prop, local)) : baseValue(c, prop);
        return { ...c, keyframes: upsertKeyframe(c.keyframes, prop, local, cur) };
      });
      return { tracks, ...record(s) };
    }),
  setKeyframeValue: (clipId, prop, value, rec = false) =>
    set((s) => {
      const found = findClip(s.tracks, clipId);
      if (!found) return {};
      const local = clamp(s.currentTime - found.clip.start, 0, found.clip.duration);
      const tracks = mapClips(s.tracks, [clipId], (c) => ({ ...c, keyframes: upsertKeyframe(c.keyframes, prop, local, value) }));
      return { tracks, ...(rec ? record(s) : live(s)) };
    }),
  removeKeyframe: (clipId, prop, time) =>
    set((s) => ({ tracks: mapClips(s.tracks, [clipId], (c) => ({ ...c, keyframes: removeKeyframeAt(c.keyframes, prop, time) })), ...record(s) })),
  clearKeyframes: (clipId, prop) =>
    set((s) => ({
      tracks: mapClips(s.tracks, [clipId], (c) => {
        if (!prop) return { ...c, keyframes: {} };
        const k = { ...c.keyframes };
        delete k[prop];
        return { ...c, keyframes: k };
      }),
      ...record(s),
    })),
  setKeyframeEasing: (clipId, prop, time, easing) =>
    set((s) => ({
      tracks: mapClips(s.tracks, [clipId], (c) => ({
        ...c,
        keyframes: { ...c.keyframes, [prop]: (c.keyframes[prop] || []).map((k) => (Math.abs(k.time - time) < 0.02 ? { ...k, easing } : k)) },
      })),
      ...record(s),
    })),

  // ── markers / in-out ──
  addMarker: (time, label) =>
    set((s) => {
      const t = time ?? s.currentTime;
      if (s.markers.some((m) => Math.abs(m.time - t) < 0.02)) return {};
      const colors = ["#22d3ee", "#a78bfa", "#f472b6", "#fbbf24", "#34d399"];
      const marker: Marker = { id: uid("mk"), time: t, label: label ?? `Marker ${s.markers.length + 1}`, color: colors[s.markers.length % colors.length] };
      return { markers: [...s.markers, marker].sort((a, b) => a.time - b.time), ...record(s) };
    }),
  addMarkers: (list, tag) =>
    set((s) => {
      const kept = tag ? s.markers.filter((m) => m.tag !== tag) : s.markers;
      const fresh: Marker[] = list
        .filter((m) => !kept.some((k) => Math.abs(k.time - m.time) < 0.02))
        .map((m) => ({ id: uid("mk"), time: m.time, label: m.label, color: m.color ?? "#f472b6", tag }));
      return { markers: [...kept, ...fresh].sort((a, b) => a.time - b.time), ...record(s) };
    }),
  removeMarkersByTag: (tag) => set((s) => ({ markers: s.markers.filter((m) => m.tag !== tag), ...record(s) })),
  splitAtTimes: (times, trackIds) =>
    set((s) => {
      let tracks = s.tracks;
      let changed = false;
      const sorted = [...times].sort((a, b) => a - b);
      for (const time of sorted) {
        tracks = tracks.map((t) => {
          if (t.locked || (trackIds && !trackIds.includes(t.id))) return t;
          let touched = false;
          const clips: Clip[] = [];
          for (const c of t.clips) {
            const parts = splitClip(c, time);
            if (!parts) {
              clips.push(c);
              continue;
            }
            touched = true;
            clips.push(parts[0], parts[1]);
          }
          if (!touched) return t;
          changed = true;
          return { ...t, clips };
        });
      }
      if (!changed) return {};
      return { tracks, ...record(s) };
    }),
  updateMarker: (id, patch) => set((s) => ({ markers: s.markers.map((m) => (m.id === id ? { ...m, ...patch } : m)).sort((a, b) => a.time - b.time), dirty: true })),
  removeMarker: (id) => set((s) => ({ markers: s.markers.filter((m) => m.id !== id), ...record(s) })),
  setInPoint: (t) => set((s) => ({ inPoint: t, outPoint: t !== null && s.outPoint !== null && s.outPoint <= t ? null : s.outPoint })),
  setOutPoint: (t) => set((s) => ({ outPoint: t, inPoint: t !== null && s.inPoint !== null && s.inPoint >= t ? null : s.inPoint })),
  clearInOut: () => set({ inPoint: null, outPoint: null }),

  // ── selection ──
  selectClip: (id, additive = false) =>
    set((s) => {
      if (id === null) return { selectedClipIds: [], selectedClipId: null };
      if (additive) {
        const ids = s.selectedClipIds.includes(id) ? s.selectedClipIds.filter((x) => x !== id) : [...s.selectedClipIds, id];
        return { selectedClipIds: ids, selectedClipId: ids.includes(id) ? id : ids[ids.length - 1] ?? null };
      }
      return { selectedClipIds: [id], selectedClipId: id };
    }),
  selectClips: (ids) => set({ selectedClipIds: ids, selectedClipId: ids[ids.length - 1] ?? null }),
  toggleClipSelection: (id) => get().selectClip(id, true),
  selectAll: () =>
    set((s) => {
      const ids = s.tracks.filter((t) => !t.locked).flatMap((t) => t.clips.map((c) => c.id));
      return { selectedClipIds: ids, selectedClipId: ids[0] ?? null };
    }),
  clearSelection: () => set({ selectedClipIds: [], selectedClipId: null }),

  copySelected: () =>
    set((s) => {
      const ids = expandLinked(s.tracks, s.selectedClipIds);
      const selected = allClips(s.tracks).filter((c) => ids.includes(c.id));
      if (!selected.length) return {};
      return { clipboard: selected.map((c) => structuredClone(c)) };
    }),
  cutSelected: () => {
    get().copySelected();
    const s = get();
    if (s.selectedClipIds.length) s.removeClips(s.selectedClipIds, false);
  },
  pasteClipboard: () =>
    set((s) => {
      if (s.clipboard.length === 0) return {};
      const minStart = Math.min(...s.clipboard.map((c) => c.start));
      const linkMap = new Map<string, string>();
      const pasted = s.clipboard.map((c) => {
        let lg = c.linkGroup;
        if (lg) {
          if (!linkMap.has(lg)) linkMap.set(lg, uid("link"));
          lg = linkMap.get(lg);
        }
        // Fall back to a same-type track if the original is gone
        let trackId = c.trackId;
        if (!s.tracks.some((t) => t.id === trackId)) {
          const kind = s.mediaAssets.find((m) => m.id === c.mediaId)?.type === "audio" ? "audio" : "video";
          trackId = s.tracks.find((t) => t.type === kind)?.id ?? trackId;
        }
        return cloneClip(c, { id: uid("clip"), start: s.currentTime + (c.start - minStart), linkGroup: lg, trackId });
      });
      let tracks = s.tracks.map((t) => {
        const add = pasted.filter((c) => c.trackId === t.id);
        return add.length ? { ...t, clips: [...t.clips, ...add] } : t;
      });
      const newIds = pasted.map((c) => c.id);
      tracks = resolveOverlapsIn(tracks, newIds);
      return { tracks, selectedClipIds: newIds, selectedClipId: newIds[0] ?? null, ...record(s) };
    }),

  // ── playback ──
  setCurrentTime: (t) => set({ currentTime: Math.max(0, t) }),
  setIsPlaying: (v) => set({ isPlaying: v, ...(v ? {} : { shuttleRate: 0 }) }),
  togglePlay: () =>
    set((s) => {
      const duration = getProjectDuration(s.tracks);
      if (duration <= 0) return { isPlaying: false, shuttleRate: 0 };
      if (s.isPlaying) return { isPlaying: false, shuttleRate: 0 };
      const end = s.outPoint ?? duration;
      if (s.currentTime >= end - 1e-3) return { isPlaying: true, currentTime: s.inPoint ?? 0, shuttleRate: 0 };
      return { isPlaying: true, shuttleRate: 0 };
    }),
  setShuttleRate: (r) => set({ shuttleRate: r, isPlaying: r !== 0 }),
  toggleLoop: () => set((s) => ({ loopPlayback: !s.loopPlayback })),
  setMasterVolume: (v) => set({ masterVolume: clamp(v, 0, 100), masterMuted: false }),
  toggleMasterMute: () => set((s) => ({ masterMuted: !s.masterMuted })),
  jumpToEdit: (dir) =>
    set((s) => {
      const points = new Set<number>([0, getProjectDuration(s.tracks)]);
      for (const c of allClips(s.tracks)) {
        points.add(c.start);
        points.add(c.start + c.duration);
      }
      for (const m of s.markers) points.add(m.time);
      const sorted = Array.from(points).sort((a, b) => a - b);
      const eps = 1 / s.settings.fps / 2;
      const next = dir > 0 ? sorted.find((p) => p > s.currentTime + eps) : [...sorted].reverse().find((p) => p < s.currentTime - eps);
      return next === undefined ? {} : { currentTime: next };
    }),

  // ── ui ──
  setZoom: (z) => set({ zoom: clamp(z, 4, 800) }),
  toggleSnapping: () => set((s) => ({ snapping: !s.snapping })),
  toggleRipple: () => set((s) => ({ rippleMode: !s.rippleMode })),
  setTool: (t) => set({ tool: t }),
  toggleSafeZones: () => set((s) => ({ showSafeZones: !s.showSafeZones })),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  setPreviewQuality: (q) => set({ previewQuality: q }),
  setLeftTab: (t) => set({ leftTab: t, leftPanelOpen: true }),
  setRightTab: (t) => set({ rightTab: t, rightPanelOpen: true }),
  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),

  // ── history ──
  commitHistory: () =>
    set((s) => {
      if (!s.pending) return {};
      return { past: [...s.past, s.pending].slice(-MAX_HISTORY), future: [], pending: null, dirty: true };
    }),
  undo: () =>
    set((s) => {
      if (s.pending) {
        // Undo a live edit that hasn't been committed
        return { tracks: s.pending.tracks, markers: s.pending.markers, pending: null };
      }
      if (s.past.length === 0) return {};
      const prev = s.past[s.past.length - 1];
      const existing = new Set(allClips(prev.tracks).map((c) => c.id));
      return {
        tracks: prev.tracks,
        markers: prev.markers,
        past: s.past.slice(0, -1),
        future: [snapshot(s), ...s.future].slice(0, MAX_HISTORY),
        selectedClipIds: s.selectedClipIds.filter((id) => existing.has(id)),
        selectedClipId: s.selectedClipId && existing.has(s.selectedClipId) ? s.selectedClipId : null,
        dirty: true,
      };
    }),
  redo: () =>
    set((s) => {
      if (s.future.length === 0) return {};
      const next = s.future[0];
      const existing = new Set(allClips(next.tracks).map((c) => c.id));
      return {
        tracks: next.tracks,
        markers: next.markers,
        future: s.future.slice(1),
        past: [...s.past, snapshot(s)].slice(-MAX_HISTORY),
        pending: null,
        selectedClipIds: s.selectedClipIds.filter((id) => existing.has(id)),
        selectedClipId: s.selectedClipId && existing.has(s.selectedClipId) ? s.selectedClipId : null,
        dirty: true,
      };
    }),

  setExporting: (v) => set({ isExporting: v, exportProgress: v ? 0 : get().exportProgress }),
  setExportProgress: (v) => set({ exportProgress: v }),

  setShuttleRateRaw: (r) => set({ shuttleRate: r }),
  toggleHighContrast: () => set((s) => ({ highContrast: !s.highContrast })),
  toggleReduceMotion: () => set((s) => ({ reduceMotion: !s.reduceMotion })),
  toggleLargeUI: () => set((s) => ({ largeUI: !s.largeUI })),

  // ── project io ──
  newProject: () =>
    set({
      projectName: "Untitled Project",
      settings: defaultProjectSettings(),
      tracks: makeDefaultTracks(),
      markers: [],
      mediaAssets: [],
      inPoint: null,
      outPoint: null,
      selectedClipIds: [],
      selectedClipId: null,
      currentTime: 0,
      isPlaying: false,
      shuttleRate: 0,
      past: [],
      future: [],
      pending: null,
      dirty: false,
    }),
  serialize: () => {
    const s = get();
    return {
      version: 2,
      projectName: s.projectName,
      settings: s.settings,
      tracks: s.tracks,
      markers: s.markers,
      mediaAssets: s.mediaAssets.map(({ url: _url, filmstrip: _f, ...rest }) => rest),
      inPoint: s.inPoint,
      outPoint: s.outPoint,
      savedAt: Date.now(),
    };
  },
  loadProject: (p, assets) =>
    set({
      projectName: p.projectName,
      settings: { ...defaultProjectSettings(), ...p.settings },
      tracks: p.tracks.map((t) => ({ ...makeTrack(t.type, t.name), ...t, clips: t.clips.map((c) => ({ ...makeClip({ trackId: t.id, kind: c.kind ?? "media", name: c.name, start: c.start, duration: c.duration }), ...c })) })),
      markers: p.markers ?? [],
      mediaAssets: assets,
      inPoint: p.inPoint ?? null,
      outPoint: p.outPoint ?? null,
      selectedClipIds: [],
      selectedClipId: null,
      currentTime: 0,
      isPlaying: false,
      past: [],
      future: [],
      pending: null,
      dirty: false,
    }),
  markSaved: () => set({ dirty: false }),
}));

function evaluateAt(c: Clip, prop: AnimProp, local: number): number {
  return evaluateKeyframes(c.keyframes[prop], local, baseValue(c, prop));
}

// ── Selectors ────────────────────────────────────────────────────────────────

export function useSelectedClip() {
  // findClip returns a fresh wrapper object each call; useShallow compares its
  // {clip, track} fields by reference so unrelated store updates don't rerender.
  return useEditorStore(useShallow((s) => (s.selectedClipId ? findClip(s.tracks, s.selectedClipId) : null)));
}

export function useProjectDuration() {
  return useEditorStore((s) => getProjectDuration(s.tracks));
}
