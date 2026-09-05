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
  Keyframe,
  KeyframeMap,
} from "../types";
import { allClips, clamp, findClip, getProjectDuration, pickClipColor, uid } from "../lib/utils";
import { baseValue, durationForSource, evaluateKeyframes, keyframeAt, removeKeyframeAt, scaleKeyframes, shiftKeyframes, sourceOffsetAt, sourceSpan, upsertKeyframe } from "../lib/keyframes";
import { sourceTime } from "../lib/renderer";
import { ComposeLayoutId, MotionPresetId, composeCell, composeLayoutById, layoutCells, motionPresetById } from "../lib/motion";
import { BURST_STYLES, FacecamPresetId, ZoomCutMode, facecamPatch, montageRanges, popTrackAtTimes, zoomCutScaleTrack } from "../lib/gaming";
import { TEXT_PRESETS, buildTextStyle, buildTextTransform } from "../lib/presets";
import type { ScopeKind } from "../lib/scopes";

// ─────────────────────────────────────────────────────────────────────────────

export type LeftTab = "media" | "text" | "elements" | "transitions" | "looks" | "motion" | "gaming";
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
  /** Video scope shown under the preview (null = hidden). */
  scope: ScopeKind | null;
  setScope: (k: ScopeKind | null) => void;
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
  /** Time remapping: reverse, freeze frame, speed ramp presets. */
  setClipReverse: (clipId: string, reverse: boolean) => void;
  setClipSpeedRamp: (clipId: string, ramp: Keyframe[] | undefined) => void;
  /** Split at the playhead and insert a held frame of `seconds` between the halves. */
  freezeFrameAtPlayhead: (clipId: string, seconds?: number) => void;

  // trim tools
  /** Slip: move the source in/out points without changing timeline position or length. */
  slipClip: (clipId: string, deltaSource: number, record?: boolean) => void;
  /** Roll: move the edit point between this clip and the next adjacent one. */
  rollEdit: (clipId: string, delta: number, record?: boolean) => void;
  /** Ripple trim: trim an edge and shift everything after it on the track. */
  rippleTrim: (clipId: string, side: "start" | "end", delta: number, record?: boolean) => void;

  // attribute clipboard
  attributesClipboard: Partial<Clip> | null;
  copyAttributes: (clipId: string) => void;
  pasteAttributes: (clipIds: string[], parts?: { transform?: boolean; effects?: boolean; audio?: boolean; text?: boolean; mask?: boolean; chromaKey?: boolean; speed?: boolean }) => void;
  setClipColor: (clipIds: string[], color: string) => void;

  // motion / compose (Motion tab)
  /** Applies a keyframed camera-move preset to the selected video-track clips. */
  applyMotionPreset: (clipIds: string[], presetId: MotionPresetId, strength?: number) => void;
  /** Clears all motion (transform) keyframes on the given clips. */
  clearMotion: (clipIds: string[]) => void;
  /** Arranges the selected clips into a split-screen composition. */
  applyComposeLayout: (clipIds: string[], layoutId: ComposeLayoutId, opts?: { gap?: number }) => void;
  /** Resets transform / fit / crop on the selected clips back to full frame. */
  resetCompose: (clipIds: string[]) => void;
  /** Jump-cut: deletes timeline spans from a clip and its linked partner, rippling later clips on the same tracks left. */
  removeSilenceSpans: (clipId: string, spans: [number, number][]) => string[];

  // gaming (Gaming tab)
  /** Impact hit at the playhead: splits, inserts a freeze hit-stop, shakes + punch-zooms the aftermath, flashes white. */
  impactAtPlayhead: (opts?: { clipId?: string; freeze?: number; shake?: number; zoom?: number; flash?: boolean; sfxAssetId?: string }) => void;
  /** Alternating punch-in scale keyframes across the given video clips (talking-head energy). */
  applyZoomCuts: (clipIds: string[], opts?: { interval?: number; amount?: number; mode?: ZoomCutMode }) => void;
  /** Slo-mo replay of the seconds before the playhead, inserted right after it with a REPLAY label. */
  instantReplay: (opts?: { clipId?: string; seconds?: number; speed?: number; label?: boolean }) => void;
  /** Condense the timeline to ±pre/post around every marker (kill-cut montage assembler). */
  montageFromMarkers: (opts?: { pre?: number; post?: number; gap?: number; punch?: boolean }) => void;
  /** Scale pops on every marker inside the given clips (montage pumping on the beat). */
  punchToBeats: (clipIds: string[], opts?: { amount?: number }) => void;
  /** Stuffs clips into a corner facecam cell with an optional border ring. */
  applyFacecam: (clipIds: string[], preset: FacecamPresetId, opts?: { size?: number; border?: number; borderColor?: string }) => void;
  /** Sequential meme pop-captions starting at the playhead. */
  captionBurst: (lines: string[], opts?: { duration?: number; gap?: number }) => void;
  /** Places an SFX asset at the playhead on a free audio track (layers, never overwrites). */
  addSfxClip: (assetId: string) => void;
  /** Censor box at the playhead: bleep tone + blurred adjustment-box. */
  censorAtPlayhead: (assetId: string, opts?: { duration?: number; shape?: "ellipse" | "rectangle" }) => void;

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
  /** Replace all keyframes of one property (used by auto-duck / generated curves). */
  setKeyframeCurve: (clipId: string, prop: AnimProp, keyframes: Keyframe[] | undefined) => void;
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

/** Shift a speed-ramp curve into a sliced piece's local time base. */
function shiftRamp(ramp: Keyframe[] | undefined, delta: number, duration: number): Keyframe[] | undefined {
  if (!ramp || !ramp.length) return ramp;
  const moved = ramp.map((k) => ({ ...k, time: k.time + delta })).filter((k) => k.time >= -0.001 && k.time <= duration + 0.001);
  return moved.length ? moved : undefined;
}

function splitClip(c: Clip, time: number): [Clip, Clip] | null {
  const local = time - c.start;
  if (local <= 0.02 || local >= c.duration - 0.02) return null;
  const left: Clip = { ...c, duration: local, keyframes: shiftKeyframes(c.keyframes, 0, local), speedRamp: shiftRamp(c.speedRamp, 0, local) };
  const right: Clip = {
    ...c,
    id: uid("clip"),
    start: time,
    duration: c.duration - local,
    trimIn: c.trimIn + local * c.speed,
    keyframes: shiftKeyframes(c.keyframes, -local, c.duration - local),
    speedRamp: shiftRamp(c.speedRamp, -local, c.duration - local),
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

/** Extract the timeline range [a, b] out of a clip as its own clip (keeps the right media / keyframes). */
function sliceClip(c: Clip, a: number, b: number): Clip {
  const la = a - c.start;
  const end = c.start + c.duration;
  const d = b - a;
  const atHead = la <= 0.001;
  const atTail = b >= end - 0.001;
  return {
    ...c,
    start: a,
    duration: d,
    trimIn: c.trimIn + la * c.speed,
    keyframes: shiftKeyframes(c.keyframes, -la, d),
    speedRamp: shiftRamp(c.speedRamp, -la, d),
    transitionIn: atHead ? c.transitionIn : undefined,
    effects: { ...c.effects, fadeIn: atHead ? c.effects.fadeIn : 0, fadeOut: atTail ? c.effects.fadeOut : 0 },
    audio: { ...c.audio, fadeIn: atHead ? c.audio.fadeIn : 0, fadeOut: atTail ? c.audio.fadeOut : 0 },
  };
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
  attributesClipboard: null,

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
  scope: null,
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

  // ── motion / compose ──
  applyMotionPreset: (clipIds, presetId, strength = 1) =>
    set((s) => {
      const def = motionPresetById(presetId);
      if (!def) return {};
      const targets = new Set(clipIds);
      const clipsOnVideo = allClips(s.tracks).filter((c) => targets.has(c.id) && s.tracks.find((t) => t.id === c.trackId)?.type === "video");
      if (!clipsOnVideo.length) return {};
      const tracks = mapClips(s.tracks, clipsOnVideo.map((c) => c.id), (c) => {
        const built = def.build({ duration: c.duration, width: s.settings.width, height: s.settings.height, strength, startScale: c.transform.scale });
        const kfs = { ...c.keyframes };
        for (const [prop, arr] of Object.entries(built.keyframes) as [keyof KeyframeMap, Keyframe[]][]) {
          if (arr && arr.length) kfs[prop] = arr;
        }
        return { ...c, keyframes: kfs, transform: { ...c.transform, ...(built.transform ?? {}) } };
      });
      return { tracks, ...record(s) };
    }),

  clearMotion: (clipIds) =>
    set((s) => {
      const tracks = mapClips(s.tracks, clipIds, (c) => {
        const k = { ...c.keyframes };
        for (const p of ["x", "y", "scale", "rotation"] as const) delete k[p];
        return { ...c, keyframes: k };
      });
      return { tracks, ...record(s) };
    }),

  applyComposeLayout: (clipIds, layoutId, opts) =>
    set((s) => {
      const def = composeLayoutById(layoutId);
      if (!def) return {};
      const W = s.settings.width;
      const H = s.settings.height;
      // Order: topmost track first (facecam usually lives above gameplay), then start time.
      const order = new Map(s.tracks.map((t, i) => [t.id, i]));
      const targets = allClips(s.tracks)
        .filter((c) => clipIds.includes(c.id) && order.get(c.trackId) !== undefined && s.tracks.find((t) => t.id === c.trackId)?.type === "video" && c.kind !== "adjustment")
        .sort((a, b) => (order.get(a.trackId)! - order.get(b.trackId)!) || (a.start - b.start));
      if (!targets.length) return {};
      const gapPx = Math.max(0, (opts?.gap ?? 0.8) * 0.01 * Math.min(W, H));
      const cells = layoutCells(layoutId, targets.length);
      const patchById = new Map<string, Partial<Clip>>();
      targets.slice(0, cells.length).forEach((c, i) => {
        const asset = c.mediaId ? s.mediaAssets.find((m) => m.id === c.mediaId) : undefined;
        const srcAspect = asset?.width && asset?.height ? asset.width / asset.height : null;
        const patch = composeCell({ clip: c, srcAspect }, cells[i], W, H, gapPx);
        patchById.set(c.id, c.kind === "media" ? patch : { transform: patch.transform, fit: c.fit, crop: c.crop, cornerRadius: patch.cornerRadius });
      });
      if (!patchById.size) return {};
      const tracks = mapClips(s.tracks, Array.from(patchById.keys()), (c) => ({ ...c, ...patchById.get(c.id)! }));
      return { tracks, ...record(s) };
    }),

  resetCompose: (clipIds) =>
    set((s) => {
      const tracks = mapClips(s.tracks, clipIds, (c) => ({
        ...c,
        transform: { ...c.transform, x: 0, y: 0, scale: 1, rotation: 0 },
        fit: "contain" as const,
        crop: defaultCrop(),
        cornerRadius: 0,
      }));
      return { tracks, ...record(s) };
    }),

  removeSilenceSpans: (clipId, spans) => {
    const s = get();
    const found = findClip(s.tracks, clipId);
    if (!found || !spans.length) return [];
    const fps = s.settings.fps;
    const snap = (t: number) => Math.round(t * fps) / fps;
    // Normalise: clip to clip bounds, snap to frames, drop slivers, sort.
    const cs = found.clip.start;
    const ce = found.clip.start + found.clip.duration;
    const clean: [number, number][] = [];
    for (let [a, b] of spans) {
      a = snap(clamp(a, cs, ce));
      b = snap(clamp(b, cs, ce));
      if (b - a >= 1 / fps) clean.push([a, b]);
    }
    clean.sort((a, b) => a[0] - b[0]);
    if (!clean.length) return [];

    const groupIds = new Set(expandLinked(s.tracks, [clipId]));
    const keptIds: string[] = [];
    // Pieces are re-linked by their original start time (video piece ↔ audio piece
    // at the same time) so each cut segment stays A/V-synced but can be moved
    // independently after the cut.
    const groupFor = (target: Clip, origStart: number, index: number) => (index === 0 ? target.linkGroup : `${target.linkGroup ?? "cut"}@${Math.round(origStart * 1000)}`);

    const tracks = s.tracks.map((tr) => {
      const target = tr.clips.find((c) => groupIds.has(c.id));
      if (!target) return tr;
      // clip spans to this clip's own bounds (linked partners can differ slightly)
      const spans: [number, number][] = clean
        .map(([a, b]) => [Math.max(a, target.start), Math.min(b, target.start + target.duration)] as [number, number])
        .filter(([a, b]) => b - a >= 1 / fps);
      // 1. slice the target clip around every removed span
      const pieces: { clip: Clip; origStart: number }[] = [];
      let cursor = target.start;
      for (const [a, b] of spans) {
        if (a > cursor + 0.001) pieces.push({ clip: sliceClip(target, cursor, a), origStart: cursor });
        cursor = Math.max(cursor, b);
      }
      if (cursor < target.start + target.duration - 0.001) pieces.push({ clip: sliceClip(target, cursor, target.start + target.duration), origStart: cursor });
      if (!pieces.length) return { ...tr, clips: tr.clips.filter((c) => c.id !== target.id) };
      // 2. butt the kept pieces together starting at the original start
      let next = target.start;
      const laid: Clip[] = pieces.map(({ clip: p, origStart }, i) => {
        const piece = i === 0 ? { ...p, id: target.id, start: next } : { ...p, id: uid("clip"), start: next, transitionIn: undefined, linkGroup: groupFor(target, origStart, i) };
        next += piece.duration;
        if (tr.type === "video" || i === 0) keptIds.push(piece.id);
        return piece;
      });
      // 3. ripple every other clip on this track left by the time removed before it
      const removedBefore = (t: number) => {
        let acc = 0;
        for (const [a, b] of clean) acc += Math.max(0, Math.min(b, t) - Math.min(a, t));
        return acc;
      };
      const others = tr.clips
        .filter((c) => c.id !== target.id)
        .map((c) => ({ ...c, start: Math.max(0, c.start - removedBefore(c.start)) }));
      return { ...tr, clips: [...others, ...laid].sort((a, b) => a.start - b.start) };
    });
    const result = resolveOverlapsIn(tracks, keptIds);
    set({ tracks: result, selectedClipIds: keptIds.length ? [keptIds[0]] : [], selectedClipId: keptIds[0] ?? null, ...record(s) });
    return keptIds;
  },

  // ── gaming ──
  impactAtPlayhead: (opts = {}) => {
    const g = get();
    const t = g.currentTime;
    const isVideoMedia = (c: Clip, trackId: string) => {
      const tr = g.tracks.find((x) => x.id === trackId);
      return tr?.type === "video" && c.kind === "media" && !tr.locked;
    };
    let target: Clip | null = null;
    if (opts.clipId) {
      const f = findClip(g.tracks, opts.clipId);
      if (f && isVideoMedia(f.clip, f.track.id) && t > f.clip.start && t < f.clip.start + f.clip.duration) target = f.clip;
    }
    if (!target) {
      const sel = g.selectedClipIds
        .map((id) => findClip(g.tracks, id))
        .find((f) => f && isVideoMedia(f.clip, f.track.id) && t > f.clip.start + 0.02 && t < f.clip.start + f.clip.duration - 0.02);
      if (sel) target = sel.clip;
    }
    if (!target) {
      for (const tr of g.tracks) {
        if (tr.type !== "video" || tr.locked) continue;
        const c = tr.clips.find((x) => x.kind === "media" && t > x.start + 0.02 && t < x.start + x.duration - 0.02);
        if (c) {
          target = c;
          break;
        }
      }
    }
    if (!target) {
      g.notify("Park the playhead over a video clip first", "error");
      return;
    }
    const targetId = target.id;
    const fps = g.settings.fps;
    const fz = Math.round(Math.max(0, opts.freeze ?? 0.12) * fps) / fps;
    const shakeStrength = opts.shake ?? 1;
    const zoomAmount = opts.zoom ?? 0.24;
    const wantFlash = opts.flash ?? true;
    const flashDur = 0.22;
    const sfxAssetId = opts.sfxAssetId;

    set((s) => {
      const found = findClip(s.tracks, targetId);
      if (!found) return {};
      const { clip } = found;
      const t = s.currentTime;
      const linkedIds = new Set(expandLinked(s.tracks, [clip.id]));
      const asset = s.mediaAssets.find((m) => m.id === clip.mediaId);
      const srcT = asset ? sourceTime(clip, t, asset) : clip.trimIn;
      const W = s.settings.width;
      const H = s.settings.height;

      // Motion for the aftermath: violent shake + punch zoom.
      const shakeDef = motionPresetById("hit-shake")!;
      const punchDef = motionPresetById("punch-in")!;
      const armRight = (right: Clip): Clip => {
        const shake = shakeDef.build({ duration: right.duration, width: W, height: H, strength: Math.max(0.1, shakeStrength), startScale: right.transform.scale });
        let kfs = { ...right.keyframes, ...shake.keyframes };
        let transform = right.transform;
        if (zoomAmount > 0.005) {
          const punch = punchDef.build({ duration: right.duration, width: W, height: H, strength: zoomAmount / 0.24, startScale: right.transform.scale });
          if (punch.keyframes.scale) kfs = { ...kfs, scale: punch.keyframes.scale };
          if (punch.transform?.scale) transform = { ...transform, scale: punch.transform.scale };
        }
        return { ...right, keyframes: kfs, transform };
      };

      let rightId = "";
      const tracks = s.tracks.map((tr) => {
        if (tr.locked) return tr;
        const isTargetTrack = tr.id === found.track.id;
        const relevant = isTargetTrack ? tr.clips.find((c) => c.id === clip.id) : tr.clips.find((c) => linkedIds.has(c.id));
        if (!relevant) {
          if (fz <= 0) return tr;
          return { ...tr, clips: tr.clips.map((c) => (c.start >= t - 1e-6 ? { ...c, start: c.start + fz } : c)) };
        }
        // Split the relevant clip at t (unless t sits at its head).
        if (t <= relevant.start + 0.02) {
          const shifted: Clip = { ...relevant, start: relevant.start + fz };
          const armed = isTargetTrack && tr.type === "video" ? armRight(shifted) : shifted;
          if (isTargetTrack) rightId = armed.id;
          if (fz <= 0) return { ...tr, clips: tr.clips.map((c) => (c.id === relevant.id ? armed : c.start >= t - 1e-6 ? { ...c, start: c.start + fz } : c)) };
          // freeze hold of the first frame ahead of the clip (video) — audio just gets a dropout gap
          const hold: Clip | null =
            tr.type === "video" && relevant.kind === "media"
              ? {
                  ...cloneClip(relevant),
                  id: uid("clip"),
                  name: `${relevant.name} (hit)`,
                  start: t,
                  duration: fz,
                  trimIn: relevant.trimIn,
                  freeze: true,
                  reverse: false,
                  speedRamp: undefined,
                  keyframes: {},
                  transitionIn: undefined,
                  linkGroup: undefined,
                  audioDetached: true,
                }
              : null;
          const clips = tr.clips.flatMap((c) => {
            if (c.id === relevant.id) return hold ? [hold, armed] : [armed];
            if (c.start >= t - 1e-6) return [{ ...c, start: c.start + fz }];
            return [c];
          });
          return { ...tr, clips };
        }
        if (t >= relevant.start + relevant.duration - 0.02) {
          if (fz <= 0) return tr;
          return { ...tr, clips: tr.clips.map((c) => (c.start >= t - 1e-6 ? { ...c, start: c.start + fz } : c)) };
        }
        const parts = splitClip(relevant, t);
        if (!parts) return tr;
        const [left, right] = parts;
        const shiftedRight = { ...right, start: right.start + fz };
        const armed = isTargetTrack && tr.type === "video" ? armRight(shiftedRight) : shiftedRight;
        if (isTargetTrack) rightId = armed.id;
        const hold: Clip | null =
          fz > 0 && tr.type === "video" && relevant.kind === "media"
            ? {
                ...cloneClip(right),
                id: uid("clip"),
                name: `${relevant.name} (hit)`,
                start: t,
                duration: fz,
                trimIn: isTargetTrack ? srcT : right.trimIn,
                freeze: true,
                reverse: false,
                speedRamp: undefined,
                keyframes: {},
                transitionIn: undefined,
                linkGroup: undefined,
                audioDetached: true,
              }
            : null;
        const clips = tr.clips.flatMap((c) => {
          if (c.id === relevant.id) return hold ? [left, hold, armed] : [left, armed];
          if (c.start >= t - 1e-6) return [{ ...c, start: c.start + fz }];
          return [c];
        });
        return { ...tr, clips };
      });

      let out = tracks;
      // White flash frame over the hit.
      if (wantFlash) {
        let flashTrack = out.find((tr) => tr.type === "video" && !tr.locked && !tr.clips.some((c) => t < c.start + c.duration && t + flashDur > c.start));
        if (!flashTrack) {
          const n = out.filter((tr) => tr.type === "video").length + 1;
          flashTrack = makeTrack("video", trackLabel("video", n));
          out = [flashTrack, ...out];
        }
        const flash = makeClip({
          trackId: flashTrack.id,
          kind: "solid",
          name: "Impact flash",
          start: t,
          duration: flashDur,
          color: "#e2e8f0",
          solid: { ...defaultSolid(), color: "#ffffff", width: 100, height: 100, cornerRadius: 0 },
          effects: { ...defaultEffects(), opacity: 75, fadeOut: flashDur },
        });
        out = out.map((tr) => (tr.id === flashTrack!.id ? { ...tr, clips: [...tr.clips, flash] } : tr));
      }
      // Optional impact SFX layered underneath.
      if (sfxAssetId) {
        const sfx = s.mediaAssets.find((m) => m.id === sfxAssetId);
        if (sfx) {
          let aTrack = out.find((tr) => tr.type === "audio" && !tr.locked && !tr.clips.some((c) => t < c.start + c.duration && t + sfx.duration > c.start));
          if (!aTrack) {
            const n = out.filter((tr) => tr.type === "audio").length + 1;
            aTrack = makeTrack("audio", trackLabel("audio", n));
            out = [...out, aTrack];
          }
          const hit = makeClip({ trackId: aTrack.id, kind: "media", mediaId: sfx.id, name: sfx.name.replace(/\.wav$/, ""), start: t, duration: sfx.duration, color: "#10b981" });
          out = out.map((tr) => (tr.id === aTrack!.id ? { ...tr, clips: [...tr.clips, hit] } : tr));
        }
      }
      return { tracks: out, selectedClipIds: rightId ? [rightId] : [], selectedClipId: rightId || null, ...record(s) };
    });
    get().notify("💥 Impact! Freeze + flash + shake applied", "success");
  },

  applyZoomCuts: (clipIds, opts = {}) => {
    const s = get();
    const interval = opts.interval ?? 1.5;
    const amount = (opts.amount ?? 12) / 100;
    const mode = opts.mode ?? "alternate";
    const targets = allClips(s.tracks).filter((c) => clipIds.includes(c.id) && s.tracks.some((t) => t.id === c.trackId && t.type === "video"));
    if (!targets.length) {
      s.notify("Select one or more video clips first", "error");
      return;
    }
    const ids = targets.map((c) => c.id);
    set((st) => ({
      tracks: mapClips(st.tracks, ids, (c) => ({
        ...c,
        keyframes: { ...c.keyframes, scale: zoomCutScaleTrack(c.duration, c.transform.scale, { interval, amount, mode, fps: st.settings.fps }) },
      })),
      ...record(st),
    }));
    get().notify(`Zoom cuts: punching every ${interval}s on ${targets.length} clip${targets.length > 1 ? "s" : ""}`, "success");
  },

  instantReplay: (opts = {}) => {
    const g = get();
    const t = g.currentTime;
    const seconds = opts.seconds ?? 3;
    const speed = clamp(opts.speed ?? 0.3, 0.1, 1);
    const wantLabel = opts.label ?? true;
    let target: Clip | null = null;
    const ok = (c: Clip, trackId: string) => {
      const tr = g.tracks.find((x) => x.id === trackId);
      const asset = g.mediaAssets.find((m) => m.id === c.mediaId);
      return tr?.type === "video" && !tr.locked && c.kind === "media" && asset?.type === "video";
    };
    if (opts.clipId) {
      const f = findClip(g.tracks, opts.clipId);
      if (f && ok(f.clip, f.track.id) && t > f.clip.start + 0.2 && t <= f.clip.start + f.clip.duration) target = f.clip;
    }
    if (!target) {
      const sel = g.selectedClipIds
        .map((id) => findClip(g.tracks, id))
        .find((f) => f && ok(f.clip, f.track.id) && t > f.clip.start + 0.2 && t <= f.clip.start + f.clip.duration);
      if (sel) target = sel.clip;
    }
    if (!target) {
      g.notify("Park the playhead inside a gameplay clip (with footage behind it) first", "error");
      return;
    }
    const targetId = target.id;
    set((s) => {
      const found = findClip(s.tracks, targetId);
      if (!found) return {};
      const { clip } = found;
      const t = s.currentTime;
      const segStart = Math.max(clip.start, t - seconds);
      const segEnd = Math.min(t, clip.start + clip.duration);
      if (segEnd - segStart < 0.3) return {};
      const group = expandLinked(s.tracks, [clip.id]);
      const affected = new Set(group.map((id) => findClip(s.tracks, id)?.track.id));
      const replayGroup = uid("link");
      const replayClips: Clip[] = [];
      for (const id of group) {
        const f = findClip(s.tracks, id);
        if (!f) continue;
        const c = f.clip;
        const asset = s.mediaAssets.find((m) => m.id === c.mediaId);
        if (c.kind !== "media" || !asset || asset.type === "image") continue;
        const a = Math.max(segStart, c.start);
        const b = Math.min(segEnd, c.start + c.duration);
        if (b - a < 0.1) continue;
        const piece = sliceClip(c, a, b);
        const sourceLen = (b - a) * c.speed;
        const dur = Math.max(0.1, sourceLen / speed);
        const factor = dur / piece.duration;
        replayClips.push({
          ...piece,
          id: uid("clip"),
          start: t,
          duration: dur,
          speed,
          speedRamp: undefined,
          freeze: false,
          name: `${c.name} ↺`,
          keyframes: scaleKeyframes(piece.keyframes, factor),
          transform: f.track.type === "video" ? { ...piece.transform, scale: piece.transform.scale * 1.12 } : piece.transform,
          linkGroup: replayGroup,
          transitionIn: undefined,
        });
      }
      if (!replayClips.length) return {};
      const replayDur = replayClips[0].duration;
      let tracks = s.tracks.map((tr) => {
        if (!affected.has(tr.id) || tr.locked) return tr;
        return { ...tr, clips: tr.clips.map((c) => (c.start >= t - 1e-6 ? { ...c, start: c.start + replayDur } : c)) };
      });
      tracks = tracks.map((tr) => {
        const add = replayClips.filter((c) => c.trackId === tr.id);
        return add.length ? { ...tr, clips: [...tr.clips, ...add].sort((a, b) => a.start - b.start) } : tr;
      });
      if (wantLabel) {
        const preset = TEXT_PRESETS.find((p) => p.id === "em-replay")!;
        const labelDur = Math.min(2.2, replayDur);
        let labelTrack = tracks.find((tr) => tr.type === "video" && !tr.locked && !tr.clips.some((c) => t < c.start + c.duration && t + labelDur > c.start));
        if (!labelTrack) {
          const n = tracks.filter((tr) => tr.type === "video").length + 1;
          labelTrack = makeTrack("video", trackLabel("video", n));
          tracks = [labelTrack, ...tracks];
        }
        const label = makeClip({
          trackId: labelTrack.id,
          kind: "text",
          name: "REPLAY",
          start: t,
          duration: labelDur,
          color: "#f59e0b",
          text: { ...buildTextStyle(preset), content: "↺ REPLAY" },
          transform: buildTextTransform(preset),
        });
        tracks = tracks.map((tr) => (tr.id === labelTrack!.id ? { ...tr, clips: [...tr.clips, label] } : tr));
      }
      const main = replayClips.find((c) => tracks.some((tr) => tr.id === c.trackId && tr.type === "video")) ?? replayClips[0];
      return { tracks, selectedClipIds: [main.id], selectedClipId: main.id, ...record(s) };
    });
    get().notify(`⏪ Replay inserted (${seconds}s @ ${speed}×) — other tracks untouched`, "success");
  },

  montageFromMarkers: (opts = {}) => {
    const g = get();
    const pre = opts.pre ?? 1.5;
    const post = opts.post ?? 1.5;
    const gap = Math.max(0, opts.gap ?? 0);
    const punch = opts.punch ?? true;
    if (!g.markers.length) {
      g.notify("Drop markers (M) on your kills and funny moments first", "error");
      return;
    }
    const maxDur = getProjectDuration(g.tracks);
    const ranges = montageRanges(g.markers, pre, post, maxDur);
    if (!ranges.length) {
      g.notify("No usable marker ranges", "error");
      return;
    }
    const kept = ranges.reduce((acc, r) => acc + (r.end - r.start), 0);
    const lockedTouched = g.tracks.some((t) => t.locked && t.clips.length);
    set((s) => {
      const punchDef = punch ? motionPresetById("punch-in") : null;
      const W = s.settings.width;
      const H = s.settings.height;
      const groupIds = ranges.map(() => uid("link"));
      const starts: number[] = [];
      let cursor = 0;
      const tracks = s.tracks.map((tr) => {
        if (tr.locked) return tr;
        const pieces: Clip[] = [];
        ranges.forEach((r, ri) => {
          if (tr === s.tracks.find((x) => x.id === tr.id)) void 0;
          for (const c of tr.clips) {
            const a = Math.max(r.start, c.start);
            const b = Math.min(r.end, c.start + c.duration);
            if (b - a < 0.08) continue;
            const piece = sliceClip(c, a, b);
            piece.id = uid("clip");
            piece.start = 0; // placed below
            piece.linkGroup = groupIds[ri];
            piece.transitionIn = undefined;
            (piece as Clip & { __off?: number }).__off = a - r.start;
            if (punchDef && tr.type === "video" && piece.kind !== "adjustment") {
              const built = punchDef.build({ duration: piece.duration, width: W, height: H, strength: 1, startScale: piece.transform.scale });
              if (built.keyframes.scale) piece.keyframes = { ...piece.keyframes, scale: built.keyframes.scale };
              if (built.transform?.scale) piece.transform = { ...piece.transform, scale: built.transform.scale };
            }
            pieces.push(piece);
          }
        });
        return { ...tr, clips: pieces };
      });
      // lay the ranges back-to-back from zero
      ranges.forEach((r, ri) => {
        starts.push(cursor);
        const len = r.end - r.start;
        for (const tr of tracks) {
          for (const p of tr.clips) {
            if (p.linkGroup === groupIds[ri]) p.start = cursor + ((p as Clip & { __off?: number }).__off ?? 0);
            delete (p as Clip & { __off?: number }).__off;
          }
        }
        cursor += len + (ri < ranges.length - 1 ? gap : 0);
      });
      for (const tr of tracks) tr.clips.sort((a, b) => a.start - b.start);
      const markers: Marker[] = ranges.map((r, i) => ({ id: uid("mk"), time: starts[i], label: r.label, color: r.color }));
      const firstVideo = allClips(tracks).find((c) => tracks.some((tr) => tr.id === c.trackId && tr.type === "video"));
      return {
        tracks,
        markers,
        selectedClipIds: firstVideo ? [firstVideo.id] : [],
        selectedClipId: firstVideo?.id ?? null,
        currentTime: 0,
        ...record(s),
      };
    });
    get().notify(
      `🎬 Montage: ${kept.toFixed(1)}s across ${ranges.length} moment${ranges.length > 1 ? "s" : ""} (was ${maxDur.toFixed(1)}s)${lockedTouched ? " — locked tracks untouched" : ""}`,
      "success"
    );
  },

  punchToBeats: (clipIds, opts = {}) => {
    const s = get();
    const amount = (opts.amount ?? 10) / 100;
    const targets = allClips(s.tracks).filter((c) => clipIds.includes(c.id) && s.tracks.some((t) => t.id === c.trackId && t.type === "video"));
    if (!targets.length) {
      s.notify("Select one or more video clips first", "error");
      return;
    }
    const hitsIn = (c: Clip) =>
      s.markers.map((m) => m.time).filter((t) => t > c.start + 0.02 && t < c.start + c.duration - 0.02).map((t) => t - c.start);
    if (!targets.some((c) => hitsIn(c).length)) {
      s.notify("No markers inside the selected clips — detect beats or press M on the drops", "error");
      return;
    }
    const ids = targets.map((c) => c.id);
    set((st) => ({
      tracks: mapClips(st.tracks, ids, (c) => {
        const times = st.markers.map((m) => m.time).filter((t) => t > c.start + 0.02 && t < c.start + c.duration - 0.02).map((t) => t - c.start);
        if (!times.length) return c;
        return { ...c, keyframes: { ...c.keyframes, scale: popTrackAtTimes(c.duration, c.transform.scale, times, { amount }) } };
      }),
      ...record(st),
    }));
    get().notify(`🥁 Beat punch applied to ${targets.length} clip${targets.length > 1 ? "s" : ""}`, "success");
  },

  applyFacecam: (clipIds, preset, opts = {}) => {
    const s = get();
    const size = opts.size ?? 0.26;
    const border = opts.border ?? 6;
    const borderColor = opts.borderColor ?? "#ffffff";
    const targets = allClips(s.tracks).filter((c) => {
      if (!clipIds.includes(c.id) || c.kind !== "media") return false;
      const tr = s.tracks.find((t) => t.id === c.trackId);
      const asset = s.mediaAssets.find((m) => m.id === c.mediaId);
      return tr?.type === "video" && !tr.locked && !!asset && asset.type !== "audio";
    });
    if (!targets.length) {
      s.notify("Select your facecam clip (a video clip) first", "error");
      return;
    }
    const ids = new Set(targets.map((c) => c.id));
    set((st) => {
      const W = st.settings.width;
      const H = st.settings.height;
      const borders: { clip: Clip; trackId: string; b: NonNullable<ReturnType<typeof facecamPatch>["border"]> }[] = [];
      let tracks = st.tracks.map((tr) => ({
        ...tr,
        clips: tr.clips.map((c) => {
          if (!ids.has(c.id)) return c;
          const asset = st.mediaAssets.find((m) => m.id === c.mediaId);
          const srcAspect = asset?.width && asset?.height ? asset.width / asset.height : null;
          const patch = facecamPatch(preset, W, H, srcAspect, { size, border, borderColor });
          if (patch.border) borders.push({ clip: c, trackId: tr.id, b: patch.border });
          return { ...c, transform: patch.transform, fit: patch.fit, crop: patch.crop, cornerRadius: patch.cornerRadius };
        }),
      }));
      for (const { clip, trackId, b } of borders) {
        const idx = tracks.findIndex((t) => t.id === trackId);
        let dest = -1;
        for (let i = idx + 1; i < tracks.length; i++) {
          const t = tracks[i];
          if (t.type !== "video" || t.locked) continue;
          if (!t.clips.some((c) => clip.start < c.start + c.duration && clip.start + clip.duration > c.start)) {
            dest = i;
            break;
          }
        }
        const ring = makeClip({
          kind: "solid",
          name: "Facecam border",
          start: clip.start,
          duration: clip.duration,
          color: "#64748b",
          solid: { ...defaultSolid(), shape: b.shape, width: b.wPct, height: b.hPct, cornerRadius: b.cornerRadius, strokeWidth: b.strokeWidth, strokeColor: b.strokeColor },
          transform: { x: b.x, y: b.y, scale: 1, rotation: 0 },
          trackId: "",
        });
        if (dest >= 0) {
          ring.trackId = tracks[dest].id;
          tracks[dest] = { ...tracks[dest], clips: [...tracks[dest].clips, ring] };
        } else {
          const nt = makeTrack("video", `V${tracks.filter((t) => t.type === "video").length + 1}`);
          ring.trackId = nt.id;
          nt.clips.push(ring);
          tracks = [...tracks.slice(0, idx + 1), nt, ...tracks.slice(idx + 1)];
        }
      }
      return { tracks, ...record(st) };
    });
    get().notify("📹 Facecam placed — green screen? Enable Chroma key in the Inspector", "success");
  },

  captionBurst: (lines, opts = {}) => {
    const s = get();
    const clean = lines.map((l) => l.trim()).filter(Boolean).slice(0, 24);
    if (!clean.length) {
      s.notify("Type some captions first", "error");
      return;
    }
    const dur = clamp(opts.duration ?? 0.7, 0.2, 5);
    const gap = clamp(opts.gap ?? 0.08, 0, 2);
    const total = clean.length * dur + (clean.length - 1) * gap;
    const t = s.currentTime;
    set((st) => {
      let tracks = st.tracks;
      let target = tracks.filter((x) => x.type === "video" && !x.locked).find((x) => !x.clips.some((c) => t < c.start + c.duration && t + total > c.start));
      if (!target) {
        const n = tracks.filter((x) => x.type === "video").length + 1;
        target = makeTrack("video", trackLabel("video", n));
        tracks = [target, ...tracks];
      }
      const clips = clean.map((line, i) => {
        const style = BURST_STYLES[i % BURST_STYLES.length];
        const preset = TEXT_PRESETS.find((p) => p.id === style.presetId) ?? TEXT_PRESETS[0];
        return makeClip({
          trackId: target!.id,
          kind: "text",
          name: line.slice(0, 28) || "Caption",
          start: t + i * (dur + gap),
          duration: dur,
          color: "#f59e0b",
          text: { ...buildTextStyle(preset), content: line },
          transform: { x: style.x, y: style.y, scale: 1, rotation: style.rotation },
        });
      });
      tracks = tracks.map((tr) => (tr.id === target!.id ? { ...tr, clips: [...tr.clips, ...clips].sort((a, b) => a.start - b.start) } : tr));
      const ids = clips.map((c) => c.id);
      return { tracks, selectedClipIds: ids, selectedClipId: ids[0], ...record(st) };
    });
    get().notify(`💬 Caption burst: ${clean.length} captions placed`, "success");
  },

  addSfxClip: (assetId) => {
    const s = get();
    const asset = s.mediaAssets.find((m) => m.id === assetId);
    if (!asset) {
      s.notify("SFX asset missing", "error");
      return;
    }
    const t = s.currentTime;
    set((st) => {
      let tracks = st.tracks;
      let target = tracks.filter((x) => x.type === "audio" && !x.locked).find((x) => !x.clips.some((c) => t < c.start + c.duration && t + asset.duration > c.start));
      if (!target) {
        const n = tracks.filter((x) => x.type === "audio").length + 1;
        target = makeTrack("audio", trackLabel("audio", n));
        tracks = [...tracks, target];
      }
      const clip = makeClip({ trackId: target.id, kind: "media", mediaId: asset.id, name: asset.name.replace(/\.wav$/, ""), start: t, duration: asset.duration, color: "#10b981" });
      tracks = tracks.map((tr) => (tr.id === target!.id ? { ...tr, clips: [...tr.clips, clip].sort((a, b) => a.start - b.start) } : tr));
      return { tracks, selectedClipIds: [clip.id], selectedClipId: clip.id, ...record(st) };
    });
  },

  censorAtPlayhead: (assetId, opts = {}) => {
    const s = get();
    const asset = s.mediaAssets.find((m) => m.id === assetId);
    if (!asset) {
      s.notify("Bleep asset missing", "error");
      return;
    }
    const dur = Math.min(Math.max(0.2, opts.duration ?? 1), asset.duration);
    const shape = opts.shape ?? "ellipse";
    const t = s.currentTime;
    set((st) => {
      let tracks = st.tracks;
      let aTarget = tracks.filter((x) => x.type === "audio" && !x.locked).find((x) => !x.clips.some((c) => t < c.start + c.duration && t + dur > c.start));
      if (!aTarget) {
        const n = tracks.filter((x) => x.type === "audio").length + 1;
        aTarget = makeTrack("audio", trackLabel("audio", n));
        tracks = [...tracks, aTarget];
      }
      const bleep = makeClip({ trackId: aTarget.id, kind: "media", mediaId: asset.id, name: `Bleep ${dur.toFixed(1)}s`, start: t, duration: dur, color: "#ef4444" });
      let vTarget = tracks.filter((x) => x.type === "video" && !x.locked).find((x) => !x.clips.some((c) => t < c.start + c.duration && t + dur > c.start));
      if (!vTarget) {
        const n = tracks.filter((x) => x.type === "video").length + 1;
        vTarget = makeTrack("video", trackLabel("video", n));
        tracks = [vTarget, ...tracks];
      }
      const box = makeClip({
        trackId: vTarget.id,
        kind: "adjustment",
        name: "Censor blur",
        start: t,
        duration: dur,
        color: "#a855f7",
        effects: { ...defaultEffects(), blur: 18 },
        mask: { ...defaultMask(), shape, x: 0, y: 0, width: 34, height: 44, feather: 24 },
      });
      tracks = tracks.map((tr) => {
        if (tr.id === aTarget!.id) return { ...tr, clips: [...tr.clips, bleep].sort((a, b) => a.start - b.start) };
        if (tr.id === vTarget!.id) return { ...tr, clips: [...tr.clips, box].sort((a, b) => a.start - b.start) };
        return tr;
      });
      return { tracks, selectedClipIds: [box.id], selectedClipId: box.id, ...record(st) };
    });
    get().notify("🤐 Censor placed — move the box in Inspector → Mask", "success");
  },

  setClipReverse: (clipId, reverse) =>
    set((s) => ({ tracks: mapClips(s.tracks, expandLinked(s.tracks, [clipId]), (c) => ({ ...c, reverse })), ...record(s) })),

  setClipSpeedRamp: (clipId, ramp) =>
    set((s) => {
      const ids = expandLinked(s.tracks, [clipId]);
      const tracks = mapClips(s.tracks, ids, (c) => {
        const asset = s.mediaAssets.find((m) => m.id === c.mediaId);
        const sourceLen = sourceSpan(c); // media currently covered
        const next: Clip = { ...c, speedRamp: ramp && ramp.length ? [...ramp].sort((a, b) => a.time - b.time) : undefined };
        // Keep covering the same media: recompute the timeline duration for the new curve.
        // The ramp's time base is the clip's own duration, so stretching the ramp by f
        // scales the consumed source by f too → closed form D' = D · S / Src(D).
        let duration: number;
        const maxSource = asset && asset.type !== "image" ? asset.duration - c.trimIn : Infinity;
        if (next.speedRamp) {
          const srcAtD = Math.max(1e-6, sourceOffsetAt(next, c.duration));
          duration = (c.duration * Math.min(sourceLen, maxSource)) / srcAtD;
        } else {
          duration = Math.min(sourceLen, maxSource) / next.speed;
        }
        duration = Math.max(0.05, duration);
        const factor = duration / c.duration;
        return { ...next, duration, keyframes: scaleKeyframes(c.keyframes, factor), speedRamp: next.speedRamp ? scaleKeyframes({ x: next.speedRamp }, factor).x : undefined };
      });
      return { tracks: resolveOverlapsIn(tracks, ids), ...record(s) };
    }),

  freezeFrameAtPlayhead: (clipId, seconds = 2) =>
    set((s) => {
      const found = findClip(s.tracks, clipId);
      if (!found) return {};
      const { clip } = found;
      const t = s.currentTime;
      if (t <= clip.start + 0.02 || t >= clip.start + clip.duration - 0.02) return {};
      const parts = splitClip(clip, t);
      if (!parts) return {};
      const [left, right] = parts;
      const asset = s.mediaAssets.find((m) => m.id === clip.mediaId);
      const srcT = asset ? sourceTime(clip, t, asset) : right.trimIn;
      const hold: Clip = {
        ...cloneClip(right),
        id: uid("clip"),
        name: `${clip.name} (freeze)`,
        start: t,
        duration: seconds,
        trimIn: srcT,
        freeze: true,
        reverse: false,
        speedRamp: undefined,
        keyframes: {},
        transitionIn: undefined,
        linkGroup: undefined,
        audioDetached: true,
      };
      const shifted = { ...right, start: right.start + seconds };
      // Insert edit: linked partners are split at the playhead too, and everything that
      // starts at/after the cut on ANY unlocked track moves right by `seconds` so sync is kept.
      const linkedIds = new Set(expandLinked(s.tracks, [clip.id]));
      const tracks = s.tracks.map((tr) => {
        if (tr.locked) return tr;
        const clips = tr.clips.flatMap((c) => {
          if (c.id === clip.id) return [left, hold, shifted];
          if (linkedIds.has(c.id)) {
            const p = splitClip(c, t);
            if (!p) return [c];
            return [p[0], { ...p[1], start: p[1].start + seconds }];
          }
          if (c.start >= t - 1e-6) return [{ ...c, start: c.start + seconds }];
          return [c];
        });
        return { ...tr, clips };
      });
      return { tracks, selectedClipIds: [hold.id], selectedClipId: hold.id, ...record(s) };
    }),

  // ── trim tools ──
  slipClip: (clipId, deltaSource, rec = false) =>
    set((s) => {
      const ids = expandLinked(s.tracks, [clipId]);
      const tracks = mapClips(s.tracks, ids, (c) => {
        const asset = s.mediaAssets.find((m) => m.id === c.mediaId);
        if (!asset || asset.type === "image") return c;
        const span = sourceSpan(c);
        const trimIn = clamp(c.trimIn + deltaSource, 0, Math.max(0, asset.duration - span));
        return { ...c, trimIn };
      });
      return { tracks, ...(rec ? record(s) : live(s)) };
    }),

  rollEdit: (clipId, delta, rec = false) =>
    set((s) => {
      const found = findClip(s.tracks, clipId);
      if (!found) return {};
      const { clip, track } = found;
      const tol = 1 / s.settings.fps + 1e-3;
      const next = track.clips.find((c) => c.id !== clip.id && Math.abs(c.start - (clip.start + clip.duration)) <= tol);
      if (!next) return {};
      const aAsset = s.mediaAssets.find((m) => m.id === clip.mediaId);
      const bAsset = s.mediaAssets.find((m) => m.id === next.mediaId);
      // limits: A can't grow past its media, B can't lose its head past its media start, neither below min length
      const aMax = aAsset && aAsset.type !== "image" ? durationForSource(clip, aAsset.duration - clip.trimIn) - clip.duration : Infinity;
      const bMin = bAsset && bAsset.type !== "image" ? -(next.trimIn / (next.speed || 1)) : -Infinity;
      let d = clamp(delta, Math.max(-(clip.duration - 0.05), bMin), Math.min(next.duration - 0.05, aMax));
      d = Math.round(d * s.settings.fps) / s.settings.fps;
      if (Math.abs(d) < 1e-6) return {};
      const ids = new Set(expandLinked(s.tracks, [clip.id, next.id]));
      const aLinked = new Set(expandLinked(s.tracks, [clip.id]));
      const tracks = mapClips(s.tracks, ids, (c) => {
        if (aLinked.has(c.id)) return { ...c, duration: c.duration + d, keyframes: shiftKeyframes(c.keyframes, 0, c.duration + d) };
        return { ...c, start: c.start + d, duration: c.duration - d, trimIn: Math.max(0, c.trimIn + d * c.speed), keyframes: shiftKeyframes(c.keyframes, -d, c.duration - d) };
      });
      return { tracks, ...(rec ? record(s) : live(s)) };
    }),

  rippleTrim: (clipId, side, delta, rec = false) =>
    set((s) => {
      const found = findClip(s.tracks, clipId);
      if (!found) return {};
      const { clip } = found;
      const asset = s.mediaAssets.find((m) => m.id === clip.mediaId);
      const isMedia = asset && asset.type !== "image";
      let d = Math.round(delta * s.settings.fps) / s.settings.fps;
      if (side === "end") {
        const max = isMedia ? durationForSource(clip, asset!.duration - clip.trimIn) - clip.duration : Infinity;
        d = clamp(d, -(clip.duration - 0.05), max);
      } else {
        const minBack = isMedia ? -(clip.trimIn / (clip.speed || 1)) : -Infinity;
        d = clamp(d, Math.max(minBack, -clip.start), clip.duration - 0.05);
      }
      if (Math.abs(d) < 1e-6) return {};
      const ids = new Set(expandLinked(s.tracks, [clip.id]));
      const edgeTime = side === "end" ? clip.start + clip.duration : clip.start;
      // Amount by which everything after the edit moves
      const shift = side === "end" ? d : -d;
      const tracks = s.tracks.map((tr) => {
        const touches = tr.clips.some((c) => ids.has(c.id));
        if (!touches) return tr;
        const clips = tr.clips.map((c) => {
          if (ids.has(c.id)) {
            if (side === "end") return { ...c, duration: c.duration + d, keyframes: shiftKeyframes(c.keyframes, 0, c.duration + d) };
            return { ...c, start: c.start + d, duration: c.duration - d, trimIn: Math.max(0, c.trimIn + d * c.speed), keyframes: shiftKeyframes(c.keyframes, -d, c.duration - d) };
          }
          if (c.start >= edgeTime - 1e-6) return { ...c, start: Math.max(0, c.start + shift) };
          return c;
        });
        return { ...tr, clips };
      });
      // when trimming the start, the clip itself also moves back so downstream stays butted — that's handled by start+d above;
      // but its downstream neighbours must move by -d as well, which `shift` covers.
      return { tracks, ...(rec ? record(s) : live(s)) };
    }),

  // ── attribute clipboard ──
  copyAttributes: (clipId) => {
    const found = findClip(get().tracks, clipId);
    if (!found) return;
    const c = found.clip;
    set({
      attributesClipboard: structuredClone({
        transform: c.transform,
        effects: c.effects,
        audio: c.audio,
        text: c.text,
        mask: c.mask,
        chromaKey: c.chromaKey,
        speed: c.speed,
        fit: c.fit,
        blendMode: c.blendMode,
        cornerRadius: c.cornerRadius,
        crop: c.crop,
        keyframes: c.keyframes,
      }),
    });
    get().notify("Attributes copied — select clips and paste attributes (⌥⌘V)", "info");
  },

  pasteAttributes: (clipIds, parts = { transform: true, effects: true, audio: true, text: true, mask: true, chromaKey: true, speed: false }) =>
    set((s) => {
      const src = s.attributesClipboard;
      if (!src || !clipIds.length) return {};
      const tracks = mapClips(s.tracks, clipIds, (c) => {
        const next: Clip = { ...c };
        if (parts.transform && src.transform) {
          next.transform = { ...src.transform };
          next.fit = src.fit ?? c.fit;
          next.blendMode = src.blendMode ?? c.blendMode;
          next.cornerRadius = src.cornerRadius ?? c.cornerRadius;
          next.crop = src.crop ? { ...src.crop } : c.crop;
          if (src.keyframes) {
            const k = { ...c.keyframes };
            for (const p of ["x", "y", "scale", "rotation"] as const) if (src.keyframes[p]) k[p] = scaleKeyframes({ [p]: src.keyframes[p] } as KeyframeMap, 1)[p];
            next.keyframes = k;
          }
        }
        if (parts.effects && src.effects) {
          next.effects = { ...src.effects, fadeIn: c.effects.fadeIn, fadeOut: c.effects.fadeOut };
          if (src.keyframes?.opacity) next.keyframes = { ...next.keyframes, opacity: src.keyframes.opacity };
        }
        if (parts.audio && src.audio) next.audio = { ...src.audio, fadeIn: c.audio.fadeIn, fadeOut: c.audio.fadeOut };
        if (parts.text && src.text && c.kind === "text" && c.text) next.text = { ...src.text, content: c.text.content };
        if (parts.mask && src.mask !== undefined) next.mask = src.mask ? { ...src.mask } : undefined;
        if (parts.chromaKey && src.chromaKey !== undefined && c.kind === "media") next.chromaKey = src.chromaKey ? { ...src.chromaKey } : undefined;
        return next;
      });
      return { tracks, ...record(s) };
    }),

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
  setKeyframeCurve: (clipId, prop, keyframes) =>
    set((s) => ({
      tracks: mapClips(s.tracks, [clipId], (c) => {
        const next = { ...c.keyframes };
        if (keyframes && keyframes.length) next[prop] = [...keyframes].sort((a, b) => a.time - b.time);
        else delete next[prop];
        return { ...c, keyframes: next };
      }),
      ...record(s),
    })),
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
  setScope: (k) => set({ scope: k }),
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
