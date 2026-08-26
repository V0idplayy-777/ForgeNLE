import { useRef } from "react";
import { Clip } from "../../types";
import { useEditorStore } from "../../store/useEditorStore";
import { fadeOpacity, clamp } from "../../lib/utils";

interface Props {
  clip: Clip;
  zIndex: number;
  stageRef: React.RefObject<HTMLDivElement | null>;
}

export default function TextLayer({ clip, zIndex, stageRef }: Props) {
  const currentTime = useEditorStore((s) => s.currentTime);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const selectClip = useEditorStore((s) => s.selectClip);
  const updateClip = useEditorStore((s) => s.updateClip);
  const commitHistory = useEditorStore((s) => s.commitHistory);
  const dragging = useRef(false);

  const active = currentTime >= clip.start && currentTime < clip.start + clip.duration;
  if (!active || !clip.text) return null;
  const t = clip.text;
  const opacity = fadeOpacity(clip, currentTime);
  const selected = selectedClipId === clip.id;

  function onPointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    selectClip(clip.id);
    dragging.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100);
    updateClip(clip.id, { text: { ...t, x, y } }, false);
  }
  function onPointerUp() {
    if (dragging.current) commitHistory();
    dragging.current = false;
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: "absolute",
        left: `${t.x}%`,
        top: `${t.y}%`,
        transform: "translate(-50%, -50%)",
        color: t.color,
        fontSize: t.fontSize,
        fontFamily: t.fontFamily,
        fontWeight: t.bold ? 700 : 400,
        fontStyle: t.italic ? "italic" : "normal",
        textAlign: t.align,
        background: t.background,
        opacity,
        zIndex,
        padding: t.background !== "transparent" ? "6px 14px" : 0,
        borderRadius: 6,
        whiteSpace: "pre-wrap",
        maxWidth: "90%",
        cursor: "move",
        userSelect: "none",
        textShadow: t.outline ? "0 2px 8px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)" : "none",
        outline: selected ? "2px dashed #f59e0b" : "none",
        outlineOffset: 4,
      }}
    >
      {t.content}
    </div>
  );
}
