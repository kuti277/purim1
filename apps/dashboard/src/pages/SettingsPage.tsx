import { useEffect, useRef, useState } from "react";
import {
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import { clientDb, clientStorage } from "../lib/firebase";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Announcement {
  id: string;
  icon: string;
  text: string;
}

/** Shape of the `settings/global` Firestore document. */
export interface GlobalSettings {
  campaignName: string;
  globalGoal: number;
  announcements: Announcement[];
  audioUrl: string;
  audioVolume: number;    // 0 – 100
  audioPlaying: boolean;
  playSlogan: boolean;    // plays /assets/slogan.mp3 on the showcase
}

const SETTINGS_DOC = doc(clientDb, "settings", "global");

const DEFAULTS: GlobalSettings = {
  campaignName: "מגבית פורים",
  globalGoal: 10000,
  announcements: [],
  audioUrl: "",
  audioVolume: 70,
  audioPlaying: false,
  playSlogan: false,
};

// ─── Shared field styles ───────────────────────────────────────────────────────

const fieldCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 " +
  "placeholder-gray-400 focus:border-indigo-500 focus:outline-none " +
  "focus:ring-1 focus:ring-indigo-500 bg-white";

const labelCls = "text-xs font-medium text-gray-600";

// ─── Persist helper ────────────────────────────────────────────────────────────

async function saveField(patch: Partial<GlobalSettings>): Promise<void> {
  await setDoc(SETTINGS_DOC, patch, { merge: true });
}

// ─── Section card wrapper ──────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-gray-500">{description}</p>
        )}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

// ─── Save button ───────────────────────────────────────────────────────────────

function SaveButton({
  saving,
  saved,
  onClick,
}: {
  saving: boolean;
  saved: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className="
        rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm
        transition-colors hover:bg-indigo-500
        disabled:cursor-not-allowed disabled:opacity-50
        focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1
      "
    >
      {saving ? "שומר..." : saved ? "✓ נשמר" : "שמור"}
    </button>
  );
}

// ─── Section 1: General Settings ──────────────────────────────────────────────

function GeneralSection({ initial }: { initial: GlobalSettings }) {
  const [name, setName]   = useState(initial.campaignName);
  const [goal, setGoal]   = useState(String(initial.globalGoal));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  // Sync if parent receives fresh Firestore data after initial mount
  useEffect(() => { setName(initial.campaignName); }, [initial.campaignName]);
  useEffect(() => { setGoal(String(initial.globalGoal)); }, [initial.globalGoal]);

  async function handleSave() {
    const parsedGoal = parseInt(goal, 10);
    if (!name.trim() || isNaN(parsedGoal) || parsedGoal <= 0) return;
    setSaving(true);
    try {
      await saveField({ campaignName: name.trim(), globalGoal: parsedGoal });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="הגדרות כלליות"
      description="שם הקמפיין והיעד הכולל המוצגים בשידור החי"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="gs-name" className={labelCls}>
            שם הקמפיין
          </label>
          <input
            id="gs-name"
            type="text"
            placeholder="מגבית פורים"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldCls}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="gs-goal" className={labelCls}>
            יעד קמפיין כולל (₪)
          </label>
          <input
            id="gs-goal"
            type="number"
            min="1"
            step="100"
            dir="ltr"
            placeholder="10000"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className={fieldCls}
          />
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <SaveButton saving={saving} saved={saved} onClick={() => void handleSave()} />
      </div>
    </SectionCard>
  );
}

// ─── Section 2: Announcements ─────────────────────────────────────────────────

function AnnouncementsSection({ initial }: { initial: GlobalSettings }) {
  const [items, setItems]   = useState<Announcement[]>(initial.announcements);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  useEffect(() => { setItems(initial.announcements); }, [initial.announcements]);

  function addRow() {
    setItems((prev) => [
      ...prev,
      { id: `ann-${Date.now()}`, icon: "📢", text: "" },
    ]);
  }

  function updateRow(id: string, key: "icon" | "text", value: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [key]: value } : item)),
    );
  }

  function removeRow(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveField({ announcements: items });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="הודעות מערכת"
      description="הודעות המוצגות בעמודת ההודעות בשידור החי — גוללות בלולאה"
    >
      <div className="space-y-2">
        {items.length === 0 && (
          <p className="py-4 text-center text-sm text-gray-400">
            אין הודעות עדיין — לחץ "הוסף הודעה" כדי להתחיל
          </p>
        )}

        {items.map((item, i) => (
          <div key={item.id} className="flex items-center gap-2">
            {/* Row number */}
            <span className="w-5 shrink-0 text-center text-xs font-medium text-gray-400">
              {i + 1}
            </span>

            {/* Icon */}
            <input
              type="text"
              aria-label="אייקון"
              placeholder="📢"
              value={item.icon}
              onChange={(e) => updateRow(item.id, "icon", e.target.value)}
              className="w-14 shrink-0 rounded-lg border border-gray-300 px-2 py-2 text-center text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />

            {/* Text */}
            <input
              type="text"
              aria-label="טקסט הודעה"
              placeholder="הזן טקסט הודעה..."
              value={item.text}
              onChange={(e) => updateRow(item.id, "text", e.target.value)}
              className={`flex-1 ${fieldCls}`}
            />

            {/* Delete */}
            <button
              type="button"
              onClick={() => removeRow(item.id)}
              className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
              aria-label="מחק הודעה"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={addRow}
          className="
            flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white
            px-3 py-2 text-sm font-medium text-gray-600 transition-colors
            hover:bg-gray-50 hover:text-gray-900
          "
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          הוסף הודעה
        </button>
        <SaveButton saving={saving} saved={saved} onClick={() => void handleSave()} />
      </div>
    </SectionCard>
  );
}

// ─── Section 3: Music Controller ──────────────────────────────────────────────

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type UploadStatus = "idle" | "uploading" | "done" | "error";

interface UploadState {
  status: UploadStatus;
  progress: number;
  error: string | null;
}

const IDLE_UPLOAD: UploadState = { status: "idle", progress: 0, error: null };

// ─── Audio Player sub-component ────────────────────────────────────────────────

function AudioPlayer({
  audioUrl,
  audioVolume,
  audioPlaying,
  onTogglePlay,
  onVolumeChange,
}: {
  audioUrl: string;
  audioVolume: number;
  audioPlaying: boolean;
  onTogglePlay: () => void;
  onVolumeChange: (v: number) => void;
}) {
  const audioRef               = useRef<HTMLAudioElement>(null);
  const [current,  setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);

  // Sync element volume whenever the prop changes
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = audioVolume / 100;
  }, [audioVolume]);

  // Sync play/pause to the <audio> element whenever Firestore state changes
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !audioUrl) return;
    if (audioPlaying) { el.play().catch(() => {}); } else { el.pause(); }
  }, [audioPlaying, audioUrl]);

  function handleTimeUpdate() {
    const el = audioRef.current;
    if (!el) return;
    setCurrent(el.currentTime);
    if (el.buffered.length > 0) {
      setBuffered((el.buffered.end(el.buffered.length - 1) / el.duration) * 100);
    }
  }

  function handleLoadedMetadata() {
    if (audioRef.current) setDuration(audioRef.current.duration);
  }

  function handleBarClick(e: React.MouseEvent<HTMLDivElement>) {
    const el = audioRef.current;
    if (!el || !isFinite(el.duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = ((e.clientX - rect.left) / rect.width) * 100;
    el.currentTime = (Math.max(0, Math.min(100, pct)) / 100) * el.duration;
    setCurrent(el.currentTime);
  }

  const progress  = duration > 0 ? (current / duration) * 100 : 0;
  const trackName = audioUrl ? (audioUrl.split("%2F").pop()?.split("?")[0] ?? "bg.mp3") : "";

  // Empty-state shown after hooks — no early return before hooks
  if (!audioUrl) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/50 px-5 py-6">
        <p className="text-xs font-medium text-slate-600 tracking-widest uppercase">
          ⚠ לא הועלה קובץ — יש להעלות קובץ לפני הניגון
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-950/70 p-5 space-y-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      {/* Hidden audio element — local preview */}
      <audio
        ref={audioRef}
        src={audioUrl}
        loop
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
      />

      {/* Track info row */}
      <div className="flex items-center gap-2.5">
        {/* Animated equaliser bars */}
        <div className={`flex items-end gap-[3px] h-4 shrink-0 ${audioPlaying ? "text-cyan-400" : "text-slate-600"}`}>
          {([0.55, 1, 0.72] as const).map((h, i) => (
            <span
              key={i}
              className={`w-[3px] rounded-full bg-current ${audioPlaying ? "animate-bounce" : ""}`}
              style={{ height: `${h * 100}%`, animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </div>
        <p className="text-xs font-bold text-slate-400 tracking-wide truncate flex-1">{trackName}</p>
        <p className="shrink-0 text-xs tabular-nums text-slate-500" dir="ltr">
          <span className="text-slate-300 font-semibold">{fmt(current)}</span>
          {" / "}
          <span>{fmt(duration)}</span>
        </p>
      </div>

      {/* Seekable progress bar */}
      <div
        className="group relative h-2 w-full cursor-pointer rounded-full bg-slate-800 overflow-visible"
        onClick={handleBarClick}
        role="slider"
        aria-label="עמדה בשיר"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {/* Buffered layer */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-slate-700/80"
          style={{ width: `${buffered}%` }}
        />
        {/* Played gradient */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-500 to-sky-400 transition-[width] duration-100"
          style={{ width: `${progress}%` }}
        />
        {/* Seek thumb — visible on hover */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full bg-white shadow-[0_0_10px_rgba(6,182,212,0.85)] opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
          style={{ left: `${progress}%` }}
        />
      </div>

      {/* Controls: play/pause + volume */}
      <div className="flex items-center gap-4">
        {/* Play / Pause */}
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={audioPlaying ? "השהה" : "הפעל"}
          className={`
            flex h-10 w-10 shrink-0 items-center justify-center rounded-full
            shadow-lg transition-all duration-200 focus:outline-none
            focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950
            ${audioPlaying
              ? "bg-cyan-500 shadow-[0_0_22px_rgba(6,182,212,0.55)] hover:bg-cyan-400 focus:ring-cyan-400"
              : "bg-slate-700 hover:bg-slate-600 focus:ring-slate-500"
            }
          `}
        >
          {audioPlaying ? (
            <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="h-4 w-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
            </svg>
          )}
        </button>

        {/* Volume */}
        <div className="flex flex-1 items-center gap-2.5">
          <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            {audioVolume === 0 ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
            ) : audioVolume < 50 ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25h2.24z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25h2.24z" />
            )}
          </svg>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            dir="ltr"
            value={audioVolume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            className="flex-1 h-1.5 cursor-pointer accent-cyan-500"
          />
          <span className="w-8 shrink-0 text-right text-xs tabular-nums font-bold text-slate-400" dir="ltr">
            {audioVolume}%
          </span>
        </div>
      </div>
    </div>
  );
}

function MusicSection({ initial }: { initial: GlobalSettings }) {
  const [audioUrl, setAudioUrl]         = useState(initial.audioUrl);
  const [audioVolume, setAudioVolume]   = useState(initial.audioVolume);
  const [audioPlaying, setAudioPlaying] = useState(initial.audioPlaying);
  const [playSlogan, setPlaySlogan]     = useState(initial.playSlogan);
  const [upload, setUpload]             = useState<UploadState>(IDLE_UPLOAD);
  const volumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setAudioUrl(initial.audioUrl);         }, [initial.audioUrl]);
  useEffect(() => { setAudioVolume(initial.audioVolume);   }, [initial.audioVolume]);
  useEffect(() => { setAudioPlaying(initial.audioPlaying); }, [initial.audioPlaying]);
  useEffect(() => { setPlaySlogan(initial.playSlogan);     }, [initial.playSlogan]);

  // ── File upload ──────────────────────────────────────────────────────────────
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void startUpload(file);
    // Reset input so the same file can be re-selected if needed
    e.target.value = "";
  }

  async function startUpload(file: File) {
    setUpload({ status: "uploading", progress: 0, error: null });

    const storageRef = ref(clientStorage, "music/bg.mp3");
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || "audio/mpeg",
    });

    task.on(
      "state_changed",
      (snapshot) => {
        const pct = Math.round(
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
        );
        setUpload((s) => ({ ...s, progress: pct }));
      },
      (err) => {
        console.error("[SettingsPage] upload error:", err);
        setUpload({ status: "error", progress: 0, error: err.message });
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          await saveField({ audioUrl: url });
          setAudioUrl(url);
          setUpload({ status: "done", progress: 100, error: null });
        } catch (err) {
          console.error("[SettingsPage] getDownloadURL error:", err);
          setUpload({ status: "error", progress: 0, error: "שגיאה בשמירת הקובץ" });
        }
      },
    );
  }

  // ── Volume (debounced save) ──────────────────────────────────────────────────
  function handleVolumeChange(value: number) {
    setAudioVolume(value);
    if (volumeTimer.current) clearTimeout(volumeTimer.current);
    volumeTimer.current = setTimeout(() => {
      void saveField({ audioVolume: value });
    }, 600);
  }

  // cleanup debounce on unmount
  useEffect(() => {
    return () => { if (volumeTimer.current) clearTimeout(volumeTimer.current); };
  }, []);

  // ── Play / Pause toggle (immediate save) ─────────────────────────────────────
  async function handleTogglePlay() {
    const next = !audioPlaying;
    setAudioPlaying(next);
    await saveField({ audioPlaying: next });
  }

  // ── Slogan toggle (immediate save) ───────────────────────────────────────────
  async function handleToggleSlogan() {
    const next = !playSlogan;
    setPlaySlogan(next);
    await saveField({ playSlogan: next });
  }

  // Derived display label for the uploaded file
  const uploadedLabel = audioUrl
    ? audioUrl.split("%2F").pop()?.split("?")[0] ?? "bg.mp3"
    : null;

  return (
    <SectionCard
      title="🎵 מוזיקת רקע"
      description="שליטה על מוזיקת הרקע של שידור הTV — מוצג בזמן אמת"
    >
      <div className="space-y-6">

        {/* ── File upload ── */}
        <div>
          <p className={`mb-2 ${labelCls}`}>קובץ אודיו</p>

          {/* Drop-zone / click-to-browse */}
          <label
            className="
              block cursor-pointer rounded-xl border-2 border-dashed border-gray-300
              px-4 py-6 text-center transition-colors
              hover:border-indigo-400 hover:bg-indigo-50/50
            "
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="sr-only"
              onChange={handleFileSelect}
              disabled={upload.status === "uploading"}
            />
            <svg
              className="mx-auto h-8 w-8 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
            <p className="mt-2 text-sm font-medium text-gray-600">
              לחץ לבחירת קובץ אודיו
            </p>
            <p className="mt-0.5 text-xs text-gray-400">MP3, WAV, OGG, AAC</p>
          </label>

          {/* Upload progress bar */}
          {upload.status === "uploading" && (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-gray-500">
                <span>מעלה קובץ...</span>
                <span dir="ltr">{upload.progress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                  style={{ width: `${upload.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Upload success */}
          {upload.status === "done" && (
            <p className="mt-2 text-sm font-medium text-green-600">
              ✓ הקובץ הועלה בהצלחה
            </p>
          )}

          {/* Upload error */}
          {upload.status === "error" && (
            <p className="mt-2 text-sm text-red-600">
              ✗ שגיאה בהעלאה: {upload.error}
            </p>
          )}

          {/* Current file indicator */}
          {uploadedLabel && upload.status !== "uploading" && (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <svg
                className="h-4 w-4 shrink-0 text-indigo-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
              <span className="truncate font-medium">{uploadedLabel}</span>
              <span className="shrink-0 text-gray-400">· פעיל</span>
            </div>
          )}
        </div>

        {/* ── Advanced Audio Player ── */}
        <AudioPlayer
          audioUrl={audioUrl}
          audioVolume={audioVolume}
          audioPlaying={audioPlaying}
          onTogglePlay={() => void handleTogglePlay()}
          onVolumeChange={handleVolumeChange}
        />

        {/* ── Campaign slogan toggle ── */}
        <div>
          <p className={`mb-3 ${labelCls}`}>שיר קמפיין</p>
          <button
            type="button"
            onClick={() => void handleToggleSlogan()}
            className={`
              flex w-full items-center justify-center gap-3 rounded-xl px-5 py-4
              text-base font-bold transition-all border-2
              focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white
              ${playSlogan
                ? "border-amber-400 bg-amber-500 text-white hover:bg-amber-400 focus:ring-amber-500"
                : "border-slate-700 bg-slate-800/70 text-slate-400 hover:border-amber-500/60 hover:text-amber-400 focus:ring-amber-500"
              }
            `}
          >
            <span className="text-lg">🎤</span>
            {playSlogan ? "כיבוי שיר קמפיין" : "הפעל שיר קמפיין"}
          </button>
        </div>

      </div>
    </SectionCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [loading, setLoading]   = useState(true);

  // Single onSnapshot listener — all three sections read from this state
  useEffect(() => {
    const unsub = onSnapshot(
      SETTINGS_DOC,
      (snap) => {
        if (snap.exists()) {
          // Merge with defaults so any missing field never causes undefined reads
          setSettings({ ...DEFAULTS, ...(snap.data() as Partial<GlobalSettings>) });
        } else {
          // Document doesn't exist yet — show the page with defaults
          setSettings(DEFAULTS);
        }
        setLoading(false);
      },
      (err) => {
        console.error("[SettingsPage] snapshot error:", err);
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  // Should never be null after loading resolves, but guard for TypeScript
  if (!settings) return null;

  return (
    <div className="space-y-6">

      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">חדר בקרה והגדרות</h1>
        <p className="mt-1 text-sm text-gray-500">
          שליטה על שידור הTV החי — כל שינוי מועבר לשידור בזמן אמת
        </p>
      </div>

      {/* General settings */}
      <GeneralSection initial={settings} />

      {/* Announcements */}
      <AnnouncementsSection initial={settings} />

      {/* Music controller */}
      <MusicSection initial={settings} />

    </div>
  );
}
