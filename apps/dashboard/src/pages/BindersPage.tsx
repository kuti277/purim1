import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import * as XLSX from "xlsx";
import { clientDb } from "../lib/firebase";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type BinderStatus = "collected" | "collecting" | "not_collected";

export interface BinderFormData {
  region: string;
  firstName: string;
  lastName: string;
  street: string;
  buildingNum: string;
  phone: string;
  cellphone: string;
  city: string;
  relation: string;
  notes: string;
  status: BinderStatus;
}

export interface BinderRow extends BinderFormData {
  id: string;
  createdAt: Timestamp;
  statusUpdatedAt: Timestamp;
}

// ─── Status config ─────────────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<
  BinderStatus,
  { label: string; badge: string; selectClass: string; dot: string }
> = {
  collected: {
    label: "נאסף",
    badge:
      "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/40",
    selectClass: "text-emerald-400",
    dot: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]",
  },
  collecting: {
    label: "באיסוף",
    badge: "bg-orange-400/15 text-orange-300 ring-1 ring-orange-400/40",
    selectClass: "text-orange-400",
    dot: "bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.8)]",
  },
  not_collected: {
    label: "לא נאסף",
    badge: "bg-red-400/15 text-red-300 ring-1 ring-red-400/40",
    selectClass: "text-red-400",
    dot: "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]",
  },
};

// ─── Shared style constants ─────────────────────────────────────────────────────

const EMPTY_FORM: BinderFormData = {
  region: "",
  firstName: "",
  lastName: "",
  street: "",
  buildingNum: "",
  phone: "",
  cellphone: "",
  city: "",
  relation: "",
  notes: "",
  status: "not_collected",
};

const INP =
  "w-full rounded-lg bg-slate-800 border border-slate-700 text-white " +
  "placeholder-slate-500 px-3 py-2 text-sm transition-colors " +
  "focus:border-cyan-500/70 focus:outline-none focus:ring-1 focus:ring-cyan-500/25";

const LBL =
  "block mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500";

// ─── Search helper ─────────────────────────────────────────────────────────────

function matchesSearch(b: BinderRow, q: string): boolean {
  if (!q.trim()) return true;
  const lower = q.toLowerCase();
  return [
    b.region, b.firstName, b.lastName, b.street,
    b.buildingNum, b.phone, b.cellphone, b.city,
    b.relation, b.notes,
  ].some((f) => (f ?? "").toLowerCase().includes(lower));
}

// ─── Import / Export helpers ───────────────────────────────────────────────────

function exportBindersCsv(binders: BinderRow[]) {
  const BOM = "\uFEFF";
  const headers = ["אזור", "שם פרטי", "שם משפחה", "רחוב", "מס׳ בניין", "טלפון", "נייד", "עיר", "קשר", "הערות", "סטטוס"];
  const rows = binders.map((b) => [
    b.region, b.firstName, b.lastName, b.street, b.buildingNum,
    b.phone, b.cellphone, b.city, b.relation, b.notes,
    STATUS_CONFIG[b.status]?.label ?? b.status,
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "binders.csv"; a.click();
  URL.revokeObjectURL(url);
}

async function parseBinderRows(file: File): Promise<BinderFormData[]> {
  const buf  = await file.arrayBuffer();
  const wb   = XLSX.read(buf);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
  const statusMap: Record<string, BinderStatus> = {
    "נאסף": "collected", "באיסוף": "collecting", "לא נאסף": "not_collected",
    "collected": "collected", "collecting": "collecting", "not_collected": "not_collected",
  };
  return rows.map((r) => ({
    region:      String(r["אזור"]       ?? r["region"]      ?? "").trim(),
    firstName:   String(r["שם פרטי"]    ?? r["firstName"]   ?? "").trim(),
    lastName:    String(r["שם משפחה"]   ?? r["lastName"]    ?? "").trim(),
    street:      String(r["רחוב"]       ?? r["street"]      ?? "").trim(),
    buildingNum: String(r["מס׳ בניין"]  ?? r["buildingNum"] ?? "").trim(),
    phone:       String(r["טלפון"]      ?? r["phone"]       ?? "").trim(),
    cellphone:   String(r["נייד"]       ?? r["cellphone"]   ?? "").trim(),
    city:        String(r["עיר"]        ?? r["city"]        ?? "").trim(),
    relation:    String(r["קשר"]        ?? r["relation"]    ?? "").trim(),
    notes:       String(r["הערות"]      ?? r["notes"]       ?? "").trim(),
    status:      statusMap[String(r["סטטוס"] ?? r["status"] ?? "").trim()] ?? "not_collected",
  } as BinderFormData)).filter((r) => r.firstName || r.lastName);
}

// ─── Binder form modal ─────────────────────────────────────────────────────────

function BinderModal({
  title,
  initial,
  onSave,
  onClose,
  saving,
}: {
  title: string;
  initial: BinderFormData;
  onSave: (data: BinderFormData) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<BinderFormData>({ ...initial });
  const set = (k: keyof BinderFormData, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-slate-700/60 bg-slate-900 shadow-[0_0_80px_rgba(6,182,212,0.12)] overflow-y-auto max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-black text-white">{title}</h2>
            <div className="h-0.5 w-10 rounded-full bg-gradient-to-l from-cyan-500 to-sky-400 mt-1.5" />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">

          {/* Region + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LBL}>אזור</label>
              <input
                type="text"
                placeholder="אזור..."
                value={form.region}
                onChange={(e) => set("region", e.target.value)}
                className={INP}
              />
            </div>
            <div>
              <label className={LBL}>סטטוס</label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className={INP + " cursor-pointer [color-scheme:dark]"}
              >
                {(Object.entries(STATUS_CONFIG) as [BinderStatus, { label: string }][]).map(
                  ([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          {/* First + Last name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LBL}>שם פרטי</label>
              <input
                type="text"
                placeholder="שם פרטי..."
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                className={INP}
              />
            </div>
            <div>
              <label className={LBL}>שם משפחה</label>
              <input
                type="text"
                placeholder="שם משפחה..."
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                className={INP}
              />
            </div>
          </div>

          {/* Street + Building + City */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className={LBL}>רחוב</label>
              <input
                type="text"
                placeholder="שם הרחוב..."
                value={form.street}
                onChange={(e) => set("street", e.target.value)}
                className={INP}
              />
            </div>
            <div>
              <label className={LBL}>מס׳ בניין</label>
              <input
                type="text"
                placeholder="12"
                value={form.buildingNum}
                onChange={(e) => set("buildingNum", e.target.value)}
                className={INP}
              />
            </div>
          </div>

          <div>
            <label className={LBL}>עיר</label>
            <input
              type="text"
              placeholder="שם העיר..."
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              className={INP}
            />
          </div>

          {/* Phone + Cellphone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LBL}>טלפון</label>
              <input
                type="tel"
                dir="ltr"
                placeholder="02-..."
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                className={INP}
              />
            </div>
            <div>
              <label className={LBL}>נייד</label>
              <input
                type="tel"
                dir="ltr"
                placeholder="050-..."
                value={form.cellphone}
                onChange={(e) => set("cellphone", e.target.value)}
                className={INP}
              />
            </div>
          </div>

          {/* Connection / Relation */}
          <div>
            <label className={LBL}>קשר / חיבור</label>
            <input
              type="text"
              placeholder="דרך מי הגיע..."
              value={form.relation}
              onChange={(e) => set("relation", e.target.value)}
              className={INP}
            />
          </div>

          {/* Notes */}
          <div>
            <label className={LBL}>הערות</label>
            <textarea
              rows={3}
              placeholder="הערות נוספות..."
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              className={INP + " resize-none"}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 border-t border-slate-800 pt-4 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={() => onSave(form)}
              disabled={saving}
              className="
                group relative overflow-hidden rounded-xl px-6 py-2.5 text-sm font-black text-white
                bg-gradient-to-r from-cyan-500 to-sky-500
                shadow-[0_4px_20px_rgba(6,182,212,0.4)]
                hover:from-cyan-400 hover:to-sky-400
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200
              "
            >
              <span className="pointer-events-none absolute inset-0 translate-x-full group-hover:translate-x-[-200%] transition-transform duration-700 bg-gradient-to-l from-transparent via-white/15 to-transparent skew-x-12" />
              <span className="relative">
                {saving ? "שומר..." : title.startsWith("עריכת") ? "עדכן קלסר" : "הוסף קלסר"}
              </span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Delete confirm modal ────────────────────────────────────────────────────────

function DeleteModal({
  name,
  onConfirm,
  onClose,
  deleting,
}: {
  name: string;
  onConfirm: () => void;
  onClose: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-red-500/30 bg-slate-900 p-6 shadow-[0_0_60px_rgba(239,68,68,0.15)]">
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 ring-1 ring-red-500/40">
            <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h3 className="text-base font-black text-white">מחיקת קלסר</h3>
          <p className="text-sm text-slate-400">
            למחוק את הקלסר של{" "}
            <span className="font-bold text-white">{name}</span>?
            <br />
            <span className="text-xs text-slate-600">פעולה זו אינה ניתנת לביטול.</span>
          </p>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-700 py-2.5 text-sm font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting}
              className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-black text-white hover:bg-red-500 disabled:opacity-50 transition-colors shadow-[0_4px_16px_rgba(239,68,68,0.4)]"
            >
              {deleting ? "מוחק..." : "מחק"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function BindersPage() {
  const [binders, setBinders]         = useState<BinderRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [addOpen, setAddOpen]         = useState(false);
  const [editTarget, setEditTarget]   = useState<BinderRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BinderRow | null>(null);
  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [search, setSearch]           = useState("");
  const [filterStatus, setFilterStatus] = useState<BinderStatus | "">("");

  // Import state
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  // ── Firestore real-time listener ─────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(clientDb, "binders"),
      orderBy("createdAt", "desc"),
    );
    return onSnapshot(
      q,
      (snap) => {
        setBinders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BinderRow)));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, []);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(
    () =>
      binders.filter((b) => {
        if (filterStatus && b.status !== filterStatus) return false;
        return matchesSearch(b, search);
      }),
    [binders, search, filterStatus],
  );

  // ── Aggregate counts ──────────────────────────────────────────────────────
  const counts = useMemo(
    () => ({
      collected:     binders.filter((b) => b.status === "collected").length,
      collecting:    binders.filter((b) => b.status === "collecting").length,
      not_collected: binders.filter((b) => b.status === "not_collected").length,
    }),
    [binders],
  );

  // ── CRUD handlers ─────────────────────────────────────────────────────────

  async function handleSave(data: BinderFormData) {
    setSaving(true);
    try {
      if (editTarget) {
        await updateDoc(doc(clientDb, "binders", editTarget.id), {
          ...data,
          statusUpdatedAt: serverTimestamp(),
        });
        setEditTarget(null);
      } else {
        await addDoc(collection(clientDb, "binders"), {
          ...data,
          createdAt: serverTimestamp(),
          statusUpdatedAt: serverTimestamp(),
        });
        setAddOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(clientDb, "binders", deleteTarget.id));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  async function quickStatus(id: string, status: BinderStatus) {
    await updateDoc(doc(clientDb, "binders", id), {
      status,
      statusUpdatedAt: serverTimestamp(),
    });
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const rows = await parseBinderRows(file);
      if (!rows.length) {
        setImporting(false);
        setImportMsg("לא נמצאו שורות תקינות בקובץ");
        setTimeout(() => setImportMsg(null), 4000);
        return;
      }
      const CHUNK = 499;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const batch = writeBatch(clientDb);
        rows.slice(i, i + CHUNK).forEach((row) => {
          batch.set(doc(collection(clientDb, "binders")), {
            ...row,
            createdAt: serverTimestamp(),
            statusUpdatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
      setImportMsg(`✓ יובאו ${rows.length} קלסרים בהצלחה`);
      setTimeout(() => setImportMsg(null), 4000);
    } catch (err) {
      console.error("[BindersPage] import error:", err);
      setImportMsg("שגיאה בייבוא — בדוק את פורמט הקובץ");
      setTimeout(() => setImportMsg(null), 4000);
    } finally {
      setImporting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6" dir="rtl">

      {/* Page heading */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            ניהול קלסרים
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {binders.length} קלסרים במאגר ·{" "}
            <span className="font-semibold text-emerald-400">{counts.collected} נאספו</span>
            {" · "}
            <span className="font-semibold text-orange-400">{counts.collecting} באיסוף</span>
            {" · "}
            <span className="font-semibold text-red-400">{counts.not_collected} לא נאספו</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Export */}
          <button
            type="button"
            onClick={() => exportBindersCsv(binders)}
            disabled={binders.length === 0}
            className="flex items-center gap-1.5 rounded-xl border border-lime-500/40 bg-transparent px-4 py-2.5 text-xs font-bold text-lime-400 transition-colors hover:bg-lime-500/10 hover:border-lime-400/60 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            ייצוא CSV
          </button>

          {/* Import */}
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 rounded-xl border border-orange-500/40 bg-transparent px-4 py-2.5 text-xs font-bold text-orange-400 transition-colors hover:bg-orange-500/10 hover:border-orange-400/60 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {importing ? (
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            )}
            {importing ? "מייבא..." : "ייבוא Excel/CSV"}
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => void handleImport(e)}
          />

          {/* Add */}
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="
              group relative flex items-center gap-2.5 overflow-hidden
              rounded-xl px-5 py-3 text-sm font-black text-white
              bg-gradient-to-r from-cyan-500 to-sky-500
              shadow-[0_4px_20px_rgba(6,182,212,0.45)]
              hover:from-cyan-400 hover:to-sky-400
              hover:shadow-[0_6px_30px_rgba(6,182,212,0.65)]
              transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-cyan-500/60 focus:ring-offset-2 focus:ring-offset-slate-950
            "
          >
            <span className="pointer-events-none absolute inset-0 translate-x-full group-hover:translate-x-[-200%] transition-transform duration-700 bg-gradient-to-l from-transparent via-white/15 to-transparent skew-x-12" />
            <svg className="relative h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span className="relative">הוסף קלסר</span>
          </button>
        </div>
      </div>

      {/* Import result banner */}
      {importMsg && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium ${
            importMsg.startsWith("✓")
              ? "border border-lime-500/30 bg-lime-500/10 text-lime-400"
              : "border border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {importMsg}
        </div>
      )}

      {/* Search + filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">

        {/* Search input */}
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 right-3 h-4 w-4 text-slate-500"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="חיפוש לפי שם, עיר, רחוב, טלפון, אזור, קשר..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="
              w-full rounded-xl bg-slate-900 border border-slate-800
              pr-10 pl-4 py-2.5 text-sm text-white placeholder-slate-500
              focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/25
              transition-colors
            "
          />
        </div>

        {/* Status filter pills */}
        <div className="flex shrink-0 gap-2">
          {([
            ["",             "הכל"],
            ["collecting",    "באיסוף"],
            ["collected",     "נאסף"],
            ["not_collected", "לא נאסף"],
          ] as const).map(([val, lbl]) => {
            const isActive = filterStatus === val;
            let activeClass = "bg-slate-700 text-white";
            if (val === "collecting")    activeClass = "bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40";
            if (val === "collected")     activeClass = "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40";
            if (val === "not_collected") activeClass = "bg-red-500/20 text-red-300 ring-1 ring-red-500/40";

            return (
              <button
                key={val}
                type="button"
                onClick={() => setFilterStatus(val as BinderStatus | "")}
                className={`
                  rounded-xl px-3 py-2 text-xs font-bold transition-all
                  ${isActive
                    ? activeClass
                    : "bg-slate-900 border border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700"
                  }
                `}
              >
                {lbl}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-800 shadow-[0_0_40px_rgba(6,182,212,0.04)]">
        {/* Top accent stripe */}
        <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-cyan-500 to-sky-400" />

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-slate-600 text-sm">
              {search || filterStatus
                ? "לא נמצאו קלסרים התואמים את הסינון"
                : "אין קלסרים עדיין — לחץ 'הוסף קלסר' כדי להתחיל"}
            </p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[600px] no-scrollbar">
            <table className="min-w-full text-sm" dir="rtl">

              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-900/95 backdrop-blur-sm border-b-2 border-cyan-500/30">
                  {[
                    "סטטוס", "שם מלא", "אזור", "עיר",
                    "כתובת", "טלפון", "קשר", "הערות", "פעולות",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-cyan-400/80 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filtered.map((b, i) => {
                  const sc = STATUS_CONFIG[b.status];
                  return (
                    <tr
                      key={b.id}
                      className={`
                        border-b border-slate-800/60 transition-colors hover:bg-cyan-500/[0.03]
                        ${i % 2 === 1 ? "bg-slate-900/20" : "bg-transparent"}
                      `}
                    >
                      {/* Status — inline dropdown for quick update */}
                      <td className="px-3 py-2.5">
                        <select
                          value={b.status}
                          onChange={(e) =>
                            void quickStatus(b.id, e.target.value as BinderStatus)
                          }
                          className={`
                            rounded-full px-2.5 py-1 text-xs font-bold cursor-pointer
                            bg-transparent border-0 outline-none appearance-none
                            ${sc.selectClass}
                          `}
                        >
                          {(Object.entries(STATUS_CONFIG) as [BinderStatus, { label: string }][]).map(
                            ([k, v]) => (
                              <option key={k} value={k} className="bg-slate-900 text-white text-sm">
                                {v.label}
                              </option>
                            ),
                          )}
                        </select>
                      </td>

                      {/* Full name */}
                      <td className="px-4 py-3 font-bold text-white whitespace-nowrap">
                        {b.firstName} {b.lastName}
                      </td>

                      {/* Region */}
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        {b.region || <span className="text-slate-700">—</span>}
                      </td>

                      {/* City */}
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        {b.city || <span className="text-slate-700">—</span>}
                      </td>

                      {/* Street + building */}
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {b.street
                          ? `${b.street} ${b.buildingNum}`.trim()
                          : <span className="text-slate-700">—</span>}
                      </td>

                      {/* Phone — prefer cellphone */}
                      <td className="px-4 py-3 tabular-nums text-slate-400 whitespace-nowrap" dir="ltr">
                        {b.cellphone || b.phone || <span className="text-slate-700">—</span>}
                      </td>

                      {/* Relation */}
                      <td className="px-4 py-3 text-slate-500 max-w-[120px] truncate">
                        {b.relation || <span className="text-slate-700">—</span>}
                      </td>

                      {/* Notes */}
                      <td className="px-4 py-3 text-slate-600 max-w-[150px] truncate">
                        {b.notes || <span className="text-slate-700">—</span>}
                      </td>

                      {/* Action buttons */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {/* Edit */}
                          <button
                            type="button"
                            onClick={() => setEditTarget(b)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-cyan-500/15 hover:text-cyan-400 transition-colors"
                            title="עריכה"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                            </svg>
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(b)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-red-500/15 hover:text-red-400 transition-colors"
                            title="מחיקה"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Bottom scroll fade */}
        {filtered.length > 0 && !loading && (
          <div className="pointer-events-none absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-slate-950/60 to-transparent" />
        )}
      </div>

      {/* ── Modals ── */}

      {addOpen && (
        <BinderModal
          title="הוספת קלסר חדש"
          initial={EMPTY_FORM}
          onSave={(data) => void handleSave(data)}
          onClose={() => setAddOpen(false)}
          saving={saving}
        />
      )}

      {editTarget && (
        <BinderModal
          title="עריכת קלסר"
          initial={{
            region:      editTarget.region,
            firstName:   editTarget.firstName,
            lastName:    editTarget.lastName,
            street:      editTarget.street,
            buildingNum: editTarget.buildingNum,
            phone:       editTarget.phone,
            cellphone:   editTarget.cellphone,
            city:        editTarget.city,
            relation:    editTarget.relation,
            notes:       editTarget.notes,
            status:      editTarget.status,
          }}
          onSave={(data) => void handleSave(data)}
          onClose={() => setEditTarget(null)}
          saving={saving}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          name={`${deleteTarget.firstName} ${deleteTarget.lastName}`}
          onConfirm={() => void handleDelete()}
          onClose={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}
    </div>
  );
}
