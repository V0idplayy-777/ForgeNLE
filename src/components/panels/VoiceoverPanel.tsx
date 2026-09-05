import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "../../store/useEditorStore";
import { Section, Row, Toggle, Select, Btn } from "../ui/controls";
import { VoiceRecorder, extensionForMime, listMicrophones } from "../../lib/voiceover";
import { importFiles } from "../../lib/mediaImport";
import { computeWaveform } from "../../lib/waveform";
import { getProjectDuration } from "../../lib/utils";
import { Mic, Square, AudioLines } from "lucide-react";
import { cn } from "../../utils/cn";

/**
 * Records the mic straight into the timeline: a new audio asset + clip placed
 * at the playhead position where recording started (optionally playing the
 * timeline so you can narrate to picture).
 */
export default function VoiceoverSection() {
  const notify = useEditorStore((s) => s.notify);
  const [phase, setPhase] = useState<"idle" | "recording" | "saving">("idle");
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [playAlong, setPlayAlong] = useState(true);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState("");
  const recRef = useRef<VoiceRecorder | null>(null);
  const startAtRef = useRef(0);
  const rafRef = useRef(0);
  const stoppingRef = useRef(false);

  useEffect(() => {
    listMicrophones().then((ds) => setDevices(ds.filter((d) => d.label)));
  }, []);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      recRef.current?.cancel();
    },
    []
  );

  async function startRecording() {
    const s = useEditorStore.getState();
    if (!navigator.mediaDevices?.getUserMedia) {
      s.notify("Microphone recording needs a Chromium/Safari browser with mic access", "error");
      return;
    }
    const rec = new VoiceRecorder();
    try {
      await rec.start(device || undefined);
    } catch (e: any) {
      const name = e?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError") s.notify("Microphone permission denied — allow mic access for this site", "error");
      else if (name === "NotFoundError") s.notify("No microphone found", "error");
      else s.notify(`Couldn't start recording: ${e?.message ?? name}`, "error");
      return;
    }
    recRef.current = rec;
    startAtRef.current = s.currentTime;
    stoppingRef.current = false;
    setLevel(0);
    setElapsed(0);
    setPhase("recording");
    // refresh device list now that permission granted labels
    listMicrophones().then((ds) => setDevices(ds.filter((d) => d.label)));
    if (playAlong) {
      const dur = getProjectDuration(s.tracks);
      if (dur > s.currentTime + 0.05 && !s.isPlaying) s.setIsPlaying(true);
    }

    let lastPaint = 0;
    const loop = () => {
      if (!recRef.current?.recording) return;
      const now = performance.now();
      if (now - lastPaint > 33) {
        lastPaint = now;
        setLevel(recRef.current.level());
        setElapsed(recRef.current.elapsed());
      }
      // auto-stop at the end of the timeline when narrating to picture
      const st = useEditorStore.getState();
      if (st.isPlaying && st.currentTime >= getProjectDuration(st.tracks) - 0.02) {
        void stopRecording();
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }

  async function stopRecording() {
    cancelAnimationFrame(rafRef.current);
    const rec = recRef.current;
    if (!rec || stoppingRef.current) return;
    stoppingRef.current = true;
    const s = useEditorStore.getState();
    if (s.isPlaying) s.setIsPlaying(false);
    setPhase("saving");
    const startAt = startAtRef.current;
    try {
      const result = await rec.stop();
      recRef.current = null;
      if (!result) {
        notify("Nothing recorded", "error");
        return;
      }
      const count = useEditorStore.getState().mediaAssets.filter((a) => a.type === "audio" && a.name.startsWith("Voiceover")).length + 1;
      const name = `Voiceover ${count}`;
      const file = new File([result.blob], `${name}.${extensionForMime(result.mimeType)}`, { type: result.mimeType.split(";")[0] });
      const [asset] = await importFiles([file]);
      if (!asset) {
        notify("Recording failed to process", "error");
        return;
      }
      const st = useEditorStore.getState();
      st.addMedia([asset]);
      // waveform for the media bin + timeline
      computeWaveform(asset.url).then((wf) => {
        if (wf) useEditorStore.getState().patchMedia(asset.id, { waveform: wf });
      });
      // place on a free audio track (prefer a dedicated VO track), overwriting at the playhead
      let trackId: string | undefined;
      const audioTracks = st.tracks.filter((t) => t.type === "audio" && !t.locked);
      const voTrack = audioTracks.find((t) => /^vo/i.test(t.name) && !t.clips.some((c) => startAt < c.start + c.duration && startAt + asset.duration > c.start));
      const free = audioTracks.find((t) => !t.clips.some((c) => startAt < c.start + c.duration && startAt + asset.duration > c.start));
      trackId = voTrack?.id ?? free?.id;
      if (!trackId) {
        const nt = useEditorStore.getState();
        trackId = nt.addTrack("audio", `VO${nt.tracks.filter((t) => t.type === "audio").length > 2 ? "" : " 1"}`);
      }
      useEditorStore.getState().addMediaToTimeline(asset.id, { trackId, start: startAt, select: true });
      notify(`${name} recorded — ${formatSec(asset.duration)} added at the playhead`, "success");
    } catch (e: any) {
      notify(`Recording failed: ${e?.message ?? e}`, "error");
    } finally {
      setPhase("idle");
      setLevel(0);
    }
  }

  const recording = phase === "recording";

  return (
    <Section title="Voiceover">
      <p className="mb-2 text-[10px] leading-relaxed text-neutral-500">
        Record your mic straight into the timeline as an audio clip at the playhead{recording ? "" : "."}
      </p>
      {devices.length > 0 && !recording && (
        <Row label="Microphone">
          <Select value={device} onChange={setDevice} options={[{ value: "", label: "Default microphone" }, ...devices.map((d) => ({ value: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 6)}` }))]} />
        </Row>
      )}
      {!recording && (
        <Row label="Play along">
          <Toggle checked={playAlong} onChange={setPlayAlong} label="Play timeline while recording" />
        </Row>
      )}
      <div className="mt-1 flex items-center gap-2">
        {recording ? (
          <Btn variant="danger" onClick={stopRecording} className="h-9 shrink-0 px-3">
            <Square size={11} fill="currentColor" /> Stop
          </Btn>
        ) : (
          <Btn variant="primary" onClick={startRecording} disabled={phase === "saving"} className="h-9 shrink-0 px-3">
            {phase === "saving" ? <AudioLines size={12} className="animate-pulse" /> : <Mic size={12} />}
            {phase === "saving" ? "Saving…" : "Record"}
          </Btn>
        )}
        <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-white/5 bg-black/30 px-2">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", recording ? "animate-pulse bg-red-500" : "bg-neutral-700")} />
          <span className="w-10 shrink-0 font-mono text-[11px] text-neutral-300">{formatSec(elapsed)}</span>
          <div className="flex h-4 min-w-0 flex-1 items-center justify-end gap-[2px]">
            {Array.from({ length: 24 }).map((_, i) => {
              const on = level * 24 > i;
              return <div key={i} className={cn("w-[3px] rounded-sm", on ? (i > 19 ? "bg-red-400" : i > 15 ? "bg-amber-400" : "bg-emerald-400") : "bg-white/10")} style={{ height: `${35 + Math.min(65, i * 4)}%` }} />;
            })}
          </div>
        </div>
      </div>
    </Section>
  );
}

function formatSec(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 10);
  return `${m}:${String(sec).padStart(2, "0")}.${cs}`;
}
