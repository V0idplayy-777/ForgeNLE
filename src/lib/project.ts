import { useEditorStore } from "../store/useEditorStore";
import { MediaAsset, SerializedProject } from "../types";
import { clearMediaBlobs, clearProjectJson, loadMediaBlob, loadProjectJson, saveProjectJson } from "./storage";
import { probeRestored, generateFilmstrip } from "./mediaImport";
import { computeWaveform } from "./waveform";
import { downloadBlob, safeFilename } from "./utils";

let autosaveTimer: number | null = null;

/** Debounced autosave whenever project data changes. */
export function startAutosave() {
  const save = () => {
    const s = useEditorStore.getState();
    saveProjectJson(JSON.stringify(s.serialize()));
    s.markSaved();
  };
  const unsub = useEditorStore.subscribe((s, prev) => {
    if (s.tracks === prev.tracks && s.markers === prev.markers && s.mediaAssets === prev.mediaAssets && s.settings === prev.settings && s.projectName === prev.projectName && s.inPoint === prev.inPoint && s.outPoint === prev.outPoint) return;
    if (autosaveTimer) window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(save, 1200);
  });
  const onHide = () => {
    if (document.visibilityState === "hidden") save();
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("beforeunload", save);
  return () => {
    unsub();
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("beforeunload", save);
  };
}

export function saveNow() {
  const s = useEditorStore.getState();
  saveProjectJson(JSON.stringify(s.serialize()));
  s.markSaved();
}

/** Restore the last autosaved project (with media from IndexedDB). */
export async function restoreLastProject(): Promise<boolean> {
  const json = loadProjectJson();
  if (!json) return false;
  let p: SerializedProject;
  try {
    p = JSON.parse(json);
  } catch {
    return false;
  }
  if (!p || p.version !== 2) return false;
  const assets = await rehydrateAssets(p.mediaAssets);
  useEditorStore.getState().loadProject(p, assets);
  analyzeAssets(assets);
  return true;
}

async function rehydrateAssets(list: Omit<MediaAsset, "url">[]): Promise<MediaAsset[]> {
  const out: MediaAsset[] = [];
  for (const a of list) {
    const blob = await loadMediaBlob(a.id);
    if (blob) out.push(await probeRestored(a, blob));
    else out.push({ ...a, url: "", missing: true, thumbnail: a.type === "image" ? undefined : a.thumbnail });
  }
  return out;
}

function analyzeAssets(assets: MediaAsset[]) {
  for (const asset of assets) {
    if (asset.missing) continue;
    if ((asset.type === "video" || asset.type === "audio") && !asset.waveform) {
      computeWaveform(asset.url).then((wf) => wf && useEditorStore.getState().patchMedia(asset.id, { waveform: wf }));
    }
    if (asset.type === "video") {
      generateFilmstrip(asset.url, asset.duration).then((frames) => frames.length && useEditorStore.getState().patchMedia(asset.id, { filmstrip: frames }));
    }
  }
}

/** Download the project as a .forge JSON file. */
export function exportProjectFile() {
  const s = useEditorStore.getState();
  const data = JSON.stringify(s.serialize(), null, 2);
  downloadBlob(new Blob([data], { type: "application/json" }), `${safeFilename(s.projectName)}.forge.json`);
}

/** Load a .forge JSON file. Media is matched from IndexedDB by id; missing files are flagged for relinking. */
export async function importProjectFile(file: File) {
  const text = await file.text();
  const p = JSON.parse(text) as SerializedProject;
  if (!p || p.version !== 2) throw new Error("Not a Forge project file.");
  const assets = await rehydrateAssets(p.mediaAssets);
  useEditorStore.getState().loadProject(p, assets);
  analyzeAssets(assets);
  const missing = assets.filter((a) => a.missing).length;
  if (missing) useEditorStore.getState().notify(`${missing} media file(s) need relinking — re-import them from the Media panel.`, "error");
}

/** Relink a missing asset by re-importing a file with the same id. */
export async function relinkAsset(assetId: string, file: File) {
  const s = useEditorStore.getState();
  const asset = s.mediaAssets.find((a) => a.id === assetId);
  if (!asset) return;
  const { saveMediaBlob } = await import("./storage");
  await saveMediaBlob(assetId, file);
  const restored = await probeRestored(asset, file);
  s.patchMedia(assetId, { ...restored, name: file.name });
  analyzeAssets([restored]);
}

export async function resetEverything() {
  clearProjectJson();
  await clearMediaBlobs();
  useEditorStore.getState().newProject();
}
