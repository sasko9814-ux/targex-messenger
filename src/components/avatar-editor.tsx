import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { checkAvatarFile } from "@/lib/avatar-rules";

const VIEW = 240;
const OUT = 512;

type Img = { el: HTMLImageElement; url: string };

/** Square crop: drag (or arrow keys) to position, slider to zoom. Exports a 512px image. */
export function AvatarEditor({
  hasAvatar,
  busy,
  onSave,
  onRemove,
}: {
  hasAvatar: boolean;
  busy: boolean;
  onSave: (blob: Blob) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [img, setImg] = useState<Img | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(
    () => () => {
      if (img) URL.revokeObjectURL(img.url);
    },
    [img],
  );

  const base = img ? VIEW / Math.min(img.el.naturalWidth, img.el.naturalHeight) : 1;
  const w = img ? img.el.naturalWidth * base * zoom : 0;
  const h = img ? img.el.naturalHeight * base * zoom : 0;
  const clamp = (p: { x: number; y: number }) => ({
    x: Math.min(0, Math.max(VIEW - w, p.x)),
    y: Math.min(0, Math.max(VIEW - h, p.y)),
  });
  const p = clamp(pos);

  function pick(f: File | undefined) {
    if (!f) return;
    const bad = checkAvatarFile(f);
    if (bad) {
      setError(bad);
      return;
    }
    const url = URL.createObjectURL(f);
    const el = new Image();
    el.onload = () => {
      setError(null);
      setZoom(1);
      const s = VIEW / Math.min(el.naturalWidth, el.naturalHeight);
      setPos({ x: (VIEW - el.naturalWidth * s) / 2, y: (VIEW - el.naturalHeight * s) / 2 });
      setImg({ el, url });
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Не вдалося прочитати зображення");
    };
    el.src = url;
  }

  function setZoomCentered(z: number) {
    const cx = (VIEW / 2 - p.x) / zoom,
      cy = (VIEW / 2 - p.y) / zoom;
    setZoom(z);
    setPos({ x: VIEW / 2 - cx * z, y: VIEW / 2 - cy * z });
  }

  function save() {
    if (!img) return;
    const c = document.createElement("canvas");
    c.width = c.height = OUT;
    const k = OUT / VIEW;
    c.getContext("2d")!.drawImage(img.el, p.x * k, p.y * k, w * k, h * k);
    c.toBlob(
      (b) => {
        if (!b) {
          setError("Не вдалося підготувати фото");
          return;
        }
        onSave(b);
        setImg(null);
      },
      "image/webp",
      0.9,
    );
  }

  const onDown = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX - p.x, y: e.clientY - p.y };
  };
  const onMove = (e: PointerEvent) => {
    if (drag.current) setPos({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
  };
  const onKey = (e: KeyboardEvent) => {
    const d = { ArrowLeft: [8, 0], ArrowRight: [-8, 0], ArrowUp: [0, 8], ArrowDown: [0, -8] }[
      e.key
    ];
    if (d) {
      e.preventDefault();
      setPos({ x: p.x + d[0]!, y: p.y + d[1]! });
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {img ? (
        <div className="space-y-3 rounded-2xl bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Перетягніть фото, щоб розмістити його, і змініть масштаб.
          </p>
          <div
            role="img"
            aria-label="Попередній перегляд фото профілю. Стрілки переміщують фото"
            tabIndex={0}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={() => (drag.current = null)}
            onKeyDown={onKey}
            className="relative mx-auto touch-none overflow-hidden rounded-full ring-2 ring-primary outline-none focus-visible:ring-4"
            style={{ width: VIEW, height: VIEW, cursor: "grab" }}
          >
            <img
              src={img.url}
              alt=""
              draggable={false}
              className="absolute max-w-none select-none"
              style={{ left: p.x, top: p.y, width: w, height: h }}
            />
          </div>
          <label className="block text-sm">
            <span className="text-muted-foreground">Масштаб</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoomCentered(Number(e.target.value))}
              className="mt-1 w-full accent-primary"
            />
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setImg(null)}
              className="h-11 flex-1 rounded-full border border-input font-medium"
            >
              Скасувати
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Зберегти фото
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="flex items-center gap-2 rounded-full border border-input px-4 py-2 text-sm disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}{" "}
            {hasAvatar ? "Змінити фото" : "Додати фото"}
          </button>
          {hasAvatar && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm("Видалити фото профілю?")) onRemove();
              }}
              className="flex items-center gap-2 rounded-full border border-input px-4 py-2 text-sm text-destructive disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" /> Видалити фото
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-center text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
