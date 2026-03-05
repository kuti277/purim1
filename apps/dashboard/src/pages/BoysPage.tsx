import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import * as XLSX from "xlsx";
import { clientApp, clientDb } from "../lib/firebase";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface BoyDoc {
  id: string;
  name: string;
  shiur: string;
  goal: number;
  totalRaised: number;
  status: "in_field" | "finished" | "not_out";
  folderId?: string;
  nedarimName?: string;
  donorNumber?: string;
}

type StatusKey = "in_field" | "finished" | "not_out";

interface FormState {
  name: string;
  shiur: string;
  goal: string;        // string for controlled input; parsed to number on save
  status: StatusKey;
  nedarimName: string;
  donorNumber: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  in_field: "בשטח",
  finished: "סיים",
  not_out:  "לא יצא",
};

// Full class strings so Tailwind never purges them.
const STATUS_BADGE_CLS: Record<StatusKey, string> = {
  in_field: "bg-lime-500/10  text-lime-400  ring-lime-400/30",
  finished: "bg-slate-700/50 text-slate-400 ring-slate-500/30",
  not_out:  "bg-orange-500/10 text-orange-400 ring-orange-400/30",
};

const EMPTY_FORM: FormState = {
  name:        "",
  shiur:       "",
  goal:        "500",
  status:      "not_out",
  nedarimName: "",
  donorNumber: "",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function progressPct(raised: number, goal: number): string {
  if (goal <= 0) return "0";
  return ((raised / goal) * 100).toFixed(0);
}

// ─── Import / Export helpers ───────────────────────────────────────────────────

function exportBoysCsv(boys: BoyDoc[]) {
  const BOM = "\uFEFF";
  const headers = ["שם", "שיעור", "יעד גיוס", 'סה"כ נתרם', "סטטוס", "שם נדרים", "מספר מתרים"];
  const rows = boys.map((b) => [
    b.name, b.shiur, b.goal, b.totalRaised,
    STATUS_LABELS[b.status] ?? b.status,
    b.nedarimName ?? "", b.donorNumber ?? "",
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "boys.csv"; a.click();
  URL.revokeObjectURL(url);
}

async function parseBoyRows(file: File) {
  const buf  = await file.arrayBuffer();
  const wb   = XLSX.read(buf);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
  return rows.map((r) => ({
    name:        String(r["שם"]          ?? r["name"]        ?? "").trim(),
    shiur:       String(r["שיעור"]       ?? r["shiur"]       ?? "").trim(),
    goal:        parseInt(String(r["יעד גיוס"] ?? r["goal"] ?? "500"), 10) || 500,
    totalRaised: 0,
    status:      "not_out" as const,
    nedarimName: String(r["שם נדרים"]    ?? r["nedarimName"] ?? "").trim(),
    donorNumber: String(r["מספר מתרים"]  ?? r["donorNumber"] ?? "").trim(),
  })).filter((r) => r.name);
}

// ─── Shared field styles (match TransactionsPage exactly) ──────────────────────

const fieldCls =
  "w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-100 " +
  "placeholder-slate-500 focus:border-cyan-500 focus:outline-none " +
  "focus:ring-1 focus:ring-cyan-500 bg-slate-800/80";

const labelCls = "text-xs font-medium text-slate-400";

// ─── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls =
    STATUS_BADGE_CLS[status as StatusKey] ??
    "bg-slate-700/50 text-slate-400 ring-slate-500/30";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ─── Add / Edit modal ──────────────────────────────────────────────────────────

interface ModalProps {
  mode: "add" | "edit";
  boy: BoyDoc | null;       // null when mode === "add"
  onClose: () => void;
  onSaved: (msg: string) => void;
}

function BoyModal({ mode, boy, onClose, onSaved }: ModalProps) {
  const [form, setForm] = useState<FormState>(
    boy
      ? { name: boy.name, shiur: boy.shiur, goal: String(boy.goal), status: boy.status, nedarimName: boy.nedarimName ?? "", donorNumber: boy.donorNumber ?? "" }
      : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const nameRef             = useRef<HTMLInputElement>(null);

  // Focus name field on open
  useEffect(() => { nameRef.current?.focus(); }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function field<K extends keyof FormState>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const name  = form.name.trim();
    const shiur = form.shiur.trim();
    const goal  = parseInt(form.goal, 10);

    if (!name)                     { setError("יש להזין שם");              return; }
    if (!shiur)                    { setError("יש להזין שיעור");           return; }
    if (isNaN(goal) || goal <= 0)  { setError("יש להזין יעד גיוס תקין");  return; }

    setSaving(true);
    try {
      if (mode === "add") {
        await addDoc(collection(clientDb, "boys"), {
          name,
          shiur,
          goal,
          totalRaised: 0,
          status: form.status,
          nedarimName: form.nedarimName.trim(),
          donorNumber: form.donorNumber.trim(),
        });
        onSaved(`${name} נוסף בהצלחה`);
      } else {
        // totalRaised is never touched here — it is managed by the Cloud Function
        await updateDoc(doc(clientDb, "boys", boy!.id), {
          name,
          shiur,
          goal,
          status: form.status,
          nedarimName: form.nedarimName.trim(),
          donorNumber: form.donorNumber.trim(),
        });
        onSaved(`${name} עודכן בהצלחה`);
      }
      onClose();
    } catch (err) {
      console.error("[BoyModal] save error:", err);
      setError("שגיאה בשמירה. נסה שוב.");
    } finally {
      setSaving(false);
    }
  }

  return (
    // Backdrop — click-outside closes the modal
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700/50 shadow-2xl shadow-black/60">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/60 px-6 py-4">
          <h2 className="text-base font-semibold text-white">
            {mode === "add" ? "הוספת מתרים חדש" : `עריכת ${boy!.name}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
            aria-label="סגור"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-4 px-6 py-5">

            {/* Name */}
            <div className="flex flex-col gap-1">
              <label htmlFor="boy-name" className={labelCls}>
                שם <span className="text-pink-500">*</span>
              </label>
              <input
                ref={nameRef}
                id="boy-name"
                type="text"
                placeholder="ישראל ישראלי"
                value={form.name}
                onChange={field("name")}
                className={fieldCls}
              />
            </div>

            {/* Shiur */}
            <div className="flex flex-col gap-1">
              <label htmlFor="boy-shiur" className={labelCls}>
                שיעור <span className="text-pink-500">*</span>
              </label>
              <select
                id="boy-shiur"
                value={form.shiur}
                onChange={field("shiur")}
                className={fieldCls}
              >
                <option value="">בחר שיעור...</option>
                <option value="שיעור א'">שיעור א'</option>
                <option value="שיעור ב'">שיעור ב'</option>
                <option value="שיעור ג'">שיעור ג'</option>
                <option value="קיבוץ נמוך">קיבוץ נמוך</option>
                <option value="קיבוץ גבוה">קיבוץ גבוה</option>
                <option value="תרומה כללית">תרומה כללית</option>
              </select>
            </div>

            {/* Goal */}
            <div className="flex flex-col gap-1">
              <label htmlFor="boy-goal" className={labelCls}>
                יעד גיוס (₪) <span className="text-pink-500">*</span>
              </label>
              <input
                id="boy-goal"
                type="number"
                min="1"
                step="1"
                dir="ltr"
                placeholder="500"
                value={form.goal}
                onChange={field("goal")}
                className={fieldCls}
              />
            </div>

            {/* Status */}
            <div className="flex flex-col gap-1">
              <label htmlFor="boy-status" className={labelCls}>סטטוס</label>
              <select
                id="boy-status"
                value={form.status}
                onChange={field("status")}
                className={fieldCls}
              >
                <option value="not_out">לא יצא</option>
                <option value="in_field">בשטח</option>
                <option value="finished">סיים</option>
              </select>
            </div>

            {/* ── Nedarim Plus Integration ─────────────────────────────── */}
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-4">
              <div className="flex items-center gap-2">
                <svg className="h-3.5 w-3.5 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                <span className="text-xs font-semibold text-amber-400 tracking-wide">קישור נדרים פלוס</span>
              </div>

              {/* Nedarim Name */}
              <div className="flex flex-col gap-1">
                <label htmlFor="boy-nedarim" className={labelCls}>
                  שם נדרים
                  <span className="mr-1.5 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">חשוב לשיוך</span>
                </label>
                <input
                  id="boy-nedarim"
                  type="text"
                  placeholder="השם המדויק כפי שמופיע בנדרים"
                  value={form.nedarimName}
                  onChange={field("nedarimName")}
                  className={fieldCls}
                />
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  שם נדרים — השם המדויק כפי שמופיע בקופת נדרים. משמש לשיוך אוטומטי של עסקאות.
                </p>
              </div>

              {/* Donor Number / MatrimId */}
              <div className="flex flex-col gap-1">
                <label htmlFor="boy-donor-num" className={labelCls}>
                  מספר מתרים (MatrimId)
                  <span className="mr-1.5 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">מומלץ</span>
                </label>
                <input
                  id="boy-donor-num"
                  type="text"
                  dir="ltr"
                  placeholder="לדוגמה: 12345"
                  value={form.donorNumber}
                  onChange={field("donorNumber")}
                  className={fieldCls}
                />
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  מספר מתרים — מזהה המתרים הרשמי מנדרים (MatrimId). כשקיים, מבטיח שיוך מהיר ומדויק ב-100% ללא תלות בשם.
                </p>
              </div>
            </div>

            {/* totalRaised — read-only, edit mode only */}
            {mode === "edit" && boy && (
              <div className="flex flex-col gap-1">
                <label className={labelCls}>
                  סה&quot;כ נתרם
                  <span className="mr-1.5 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-normal text-slate-400">
                    קריאה בלבד
                  </span>
                </label>
                <div
                  className="w-full cursor-not-allowed rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2 text-sm text-slate-400"
                  aria-readonly="true"
                >
                  {formatCurrency(boy.totalRaised)}
                  <span className="mr-2 text-xs text-slate-500">
                    ({progressPct(boy.totalRaised, boy.goal)}% מהיעד)
                  </span>
                </div>
              </div>
            )}

          </div>

          {/* Validation error */}
          {error && (
            <div className="mx-6 mb-2 rounded-lg bg-red-950/50 border border-red-500/30 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-slate-700/60 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-600 bg-transparent px-4 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={saving}
              className="
                rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm
                transition-colors hover:bg-cyan-400
                disabled:cursor-not-allowed disabled:opacity-50
                focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-1 focus:ring-offset-slate-900
              "
            >
              {saving ? "שומר..." : mode === "add" ? "הוסף" : "שמור שינויים"}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}

// ─── Boy Analytics Modal ──────────────────────────────────────────────────────

interface BoyTxRow { amount: number; date: Timestamp; status: string; }
type ChartGran = "hours" | "days";

function BoyAnalyticsModal({ boy, onClose }: { boy: BoyDoc; onClose: () => void }) {
  const [gran, setGran] = useState<ChartGran>("hours");
  const [txs, setTxs]  = useState<BoyTxRow[]>([]);

  useEffect(() => {
    return onSnapshot(
      query(collection(clientDb, "transactions"), where("targetId", "==", boy.id)),
      (snap) => setTxs(snap.docs.map((d) => d.data() as BoyTxRow)),
    );
  }, [boy.id]);

  // Close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const active = useMemo(() => txs.filter((t) => t.status !== "cancelled"), [txs]);

  const chartData = useMemo(() => {
    if (gran === "hours") {
      const today = new Date().toDateString();
      const buckets: Record<number, number> = {};
      active.forEach((t) => {
        const d = t.date.toDate();
        if (d.toDateString() !== today) return;
        buckets[d.getHours()] = (buckets[d.getHours()] ?? 0) + t.amount;
      });
      return Array.from({ length: 24 }, (_, h) => ({
        label: `${String(h).padStart(2, "0")}:00`,
        amount: buckets[h] ?? 0,
      }));
    } else {
      const dayMap: Record<string, { sort: number; amount: number }> = {};
      active.forEach((t) => {
        const d    = t.date.toDate();
        const key  = d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
        const sort = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
        if (!dayMap[key]) dayMap[key] = { sort, amount: 0 };
        dayMap[key].amount += t.amount;
      });
      return Object.entries(dayMap)
        .sort(([, a], [, b]) => a.sort - b.sort)
        .slice(-14)
        .map(([label, { amount }]) => ({ label, amount }));
    }
  }, [active, gran]);

  const totalActive = useMemo(() => active.reduce((s, t) => s + t.amount, 0), [active]);
  const txCount     = active.length;
  const hasData     = chartData.some((d) => d.amount > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl rounded-2xl border border-lime-500/20 bg-slate-900 shadow-[0_0_80px_rgba(163,230,53,0.08)] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-base font-black text-white">ניתוח ביצועים — {boy.name}</h2>
            <div className="h-0.5 w-10 mt-1.5 rounded-full bg-gradient-to-l from-lime-400 to-emerald-400" />
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

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'סה"כ גויס',   value: `₪${totalActive.toLocaleString("he-IL")}` },
              { label: "עסקאות",       value: String(txCount) },
              { label: "ממוצע לעסקה", value: txCount > 0 ? `₪${Math.round(totalActive / txCount).toLocaleString("he-IL")}` : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl bg-slate-800/70 border border-slate-700/60 p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-lime-400/70">{label}</p>
                <p className="mt-0.5 text-xl font-black text-white">{value}</p>
              </div>
            ))}
          </div>

          {/* Granularity toggle */}
          <div className="flex items-center gap-2">
            {(["hours", "days"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGran(g)}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                  gran === g
                    ? "bg-lime-500/20 text-lime-300 ring-1 ring-lime-500/40"
                    : "bg-slate-800 border border-slate-700 text-slate-500 hover:text-slate-300"
                }`}
              >
                {g === "hours" ? "לפי שעות" : "לפי ימים"}
              </button>
            ))}
            <span className="mr-auto text-xs text-slate-600">
              {gran === "hours" ? "היום (0–23:00)" : "עד 14 הימים האחרונים"}
            </span>
          </div>

          {/* Bar chart */}
          <div className="rounded-xl bg-slate-950 border border-slate-800 px-2 py-4">
            {!hasData ? (
              <div className="flex h-[200px] items-center justify-center">
                <p className="text-sm text-slate-600">
                  {gran === "hours" ? "אין עסקאות היום עדיין" : "אין נתוני ימים קודמים"}
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="limeBarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#a3e635" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#4ade80" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(71,85,105,0.25)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#475569", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval={gran === "hours" ? 3 : 0}
                  />
                  <YAxis
                    tick={{ fill: "#475569", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `₪${v}`}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid rgba(163,230,53,0.3)",
                      borderRadius: 10,
                      fontSize: 12,
                      boxShadow: "0 0 16px rgba(163,230,53,0.1)",
                    }}
                    labelStyle={{ color: "#64748b", marginBottom: 4 }}
                    itemStyle={{ color: "#a3e635" }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any) => [`₪${Number(value).toLocaleString("he-IL")}`, "גויס"]}
                    cursor={{ fill: "rgba(163,230,53,0.05)" }}
                  />
                  <Bar dataKey="amount" fill="url(#limeBarGrad)" radius={[4, 4, 0, 0]} maxBarSize={42} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 px-6 py-16 text-center">
      <svg
        className="mx-auto h-10 w-10 text-slate-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
        />
      </svg>
      <p className="mt-3 text-sm font-medium text-slate-400">אין מתרימים במערכת עדיין</p>
      <p className="mt-1 text-xs text-slate-500">לחץ על "הוסף מתרים" כדי להתחיל</p>
      <button
        type="button"
        onClick={onAdd}
        className="
          mt-4 inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2
          text-sm font-semibold text-slate-950 shadow-sm transition-colors hover:bg-cyan-400
        "
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        הוסף מתרים
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function BoysPage() {
  const [boys, setBoys]     = useState<BoyDoc[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal: null = closed; { mode, boy } = open
  const [modal, setModal] = useState<{ mode: "add" | "edit"; boy: BoyDoc | null } | null>(null);

  // Inline delete confirmation — tracks which row is awaiting confirmation
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId]           = useState<string | null>(null);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Import state
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  // Analytics modal
  const [analyticsTarget, setAnalyticsTarget] = useState<BoyDoc | null>(null);

  // Nedarim sync
  const [syncing, setSyncing]   = useState(false);

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccessMsg(null), 3500);
  }

  useEffect(() => {
    return () => { if (successTimer.current) clearTimeout(successTimer.current); };
  }, []);

  // ── Real-time Firestore listener ────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(clientDb, "boys"), orderBy("name", "asc")),
      (snap) => {
        setBoys(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BoyDoc)));
        setLoading(false);
      },
      (err) => {
        console.error("[BoysPage] snapshot error:", err);
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete(boy: BoyDoc) {
    setDeletingId(boy.id);
    try {
      await deleteDoc(doc(clientDb, "boys", boy.id));
      showSuccess(`${boy.name} נמחק בהצלחה`);
    } catch (err) {
      console.error("[BoysPage] delete error:", err);
    } finally {
      setDeletingId(null);
      setPendingDeleteId(null);
    }
  }

  function openAdd() { setModal({ mode: "add", boy: null }); }
  function openEdit(boy: BoyDoc) { setModal({ mode: "edit", boy }); }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const rows = await parseBoyRows(file);
      if (!rows.length) { setImporting(false); showSuccess("לא נמצאו שורות תקינות בקובץ"); return; }
      const CHUNK = 499;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const batch = writeBatch(clientDb);
        rows.slice(i, i + CHUNK).forEach((row) => {
          batch.set(doc(collection(clientDb, "boys")), row);
        });
        await batch.commit();
      }
      showSuccess(`יובאו ${rows.length} מתרימים בהצלחה`);
    } catch (err) {
      console.error("[BoysPage] import error:", err);
      showSuccess("שגיאה בייבוא — בדוק את פורמט הקובץ");
    } finally {
      setImporting(false);
    }
  }

  // ── Nedarim sync ────────────────────────────────────────────────────────────
  async function handleNedarimSync() {
    setSyncing(true);
    try {
      const fns  = getFunctions(clientApp);
      const call = httpsCallable<Record<string, never>, {
        ok: boolean;
        total?: number;
        updated?: number;
        created?: number;
        skipped?: number;
        rawResponse?: string;
        msg?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sample?: any[];
      }>(fns, "syncNedarimBoys");

      const result = await call({});
      const d = result.data;

      if (!d.ok) {
        // API returned unexpected payload — show raw to help diagnose
        const detail = d.msg ?? "שגיאה לא ידועה";
        const raw    = d.rawResponse ? `\n\nתשובת נדרים: ${d.rawResponse.slice(0, 200)}` : "";
        showSuccess(`שגיאה מנדרים: ${detail}${raw}`);
        return;
      }

      showSuccess(
        `סונכרן בהצלחה · ${d.total} מתרימים · עודכנו: ${d.updated} · נוצרו: ${d.created}`
      );
    } catch (err) {
      console.error("[BoysPage] syncNedarimBoys error:", err);
      const msg = err instanceof Error ? err.message : "שגיאה בסנכרון";
      showSuccess(`שגיאה: ${msg}`);
    } finally {
      setSyncing(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Page heading */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">ניהול מתרימים</h1>
          <p className="mt-1 text-sm text-slate-400">
            הוספה, עריכה ומחיקה של מתרימים ·{" "}
            <span className="font-medium text-cyan-400">{boys.length}</span> מתרימים במערכת
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Nedarim Sync */}
          <button
            type="button"
            onClick={() => void handleNedarimSync()}
            disabled={syncing}
            title="סנכרן רשימת מתרימים מנדרים פלוס"
            className="flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-transparent px-3 py-2.5 text-xs font-semibold text-violet-400 transition-colors hover:bg-violet-500/10 hover:border-violet-400/60 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {syncing ? (
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            )}
            {syncing ? "מסנכרן..." : "סנכרן מנדרים"}
          </button>

          {/* Export */}
          <button
            type="button"
            onClick={() => exportBoysCsv(boys)}
            disabled={boys.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-lime-500/40 bg-transparent px-3 py-2.5 text-xs font-semibold text-lime-400 transition-colors hover:bg-lime-500/10 hover:border-lime-400/60 disabled:opacity-40 disabled:cursor-not-allowed"
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
            className="flex items-center gap-1.5 rounded-lg border border-orange-500/40 bg-transparent px-3 py-2.5 text-xs font-semibold text-orange-400 transition-colors hover:bg-orange-500/10 hover:border-orange-400/60 disabled:opacity-40 disabled:cursor-not-allowed"
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
            onClick={openAdd}
            className="
              flex shrink-0 items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5
              text-sm font-semibold text-slate-950 shadow-sm transition-colors hover:bg-cyan-400
              focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-1 focus:ring-offset-slate-950
            "
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            הוסף מתרים
          </button>
        </div>
      </div>

      {/* Success toast */}
      {successMsg && (
        <div className="rounded-lg border border-lime-500/30 bg-lime-500/10 px-4 py-3 text-sm font-medium text-lime-400">
          ✓ {successMsg}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
        </div>

      /* Empty state */
      ) : boys.length === 0 ? (
        <EmptyState onAdd={openAdd} />

      /* Data table */
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900/50 shadow-sm shadow-black/30 backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800/50">
              <thead className="bg-slate-800/50">
                <tr>
                  {[
                    "שם תצוגה במערכת",
                    "שם נדרים",
                    "מספר מתרים",
                    "שיעור / קבוצה",
                    "יעד גיוס",
                    'סה"כ נתרם',
                    "פעולות",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {boys.map((boy) => {
                  const isConfirming = pendingDeleteId === boy.id;
                  const isDeleting   = deletingId === boy.id;
                  return (
                    <tr
                      key={boy.id}
                      className={`transition-colors ${
                        isConfirming
                          ? "bg-red-950/30"
                          : "bg-transparent hover:bg-slate-800/30"
                      }`}
                    >
                      {/* שם תצוגה במערכת — local name + status badge inline */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-semibold text-white leading-tight">
                            {boy.name}
                          </span>
                          <StatusBadge status={boy.status} />
                        </div>
                      </td>

                      {/* שם נדרים — warning icon when missing */}
                      <td className="px-4 py-3">
                        {boy.nedarimName ? (
                          <span className="text-sm text-slate-200">{boy.nedarimName}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                            </svg>
                            לא הוגדר
                          </span>
                        )}
                      </td>

                      {/* מספר מתרים — monospace ID badge */}
                      <td className="px-4 py-3">
                        {boy.donorNumber ? (
                          <span className="inline-flex items-center rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-xs font-medium text-cyan-400">
                            #{boy.donorNumber}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>

                      {/* שיעור / קבוצה */}
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {boy.shiur || <span className="text-slate-600">—</span>}
                      </td>

                      {/* יעד גיוס */}
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-300">
                        {formatCurrency(boy.goal)}
                      </td>

                      {/* סה"כ נתרם */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="text-sm font-medium text-white">
                          {formatCurrency(boy.totalRaised)}
                        </span>
                        <span className="mr-1.5 text-[11px] text-slate-500">
                          ({progressPct(boy.totalRaised, boy.goal)}%)
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        {isConfirming ? (
                          // Inline delete confirmation — stays on the same row
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-red-400 whitespace-nowrap">
                              האם למחוק?
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleDelete(boy)}
                              disabled={isDeleting}
                              className="
                                rounded-md bg-red-500 px-2.5 py-1 text-xs font-semibold text-white
                                transition-colors hover:bg-red-400 disabled:opacity-50
                              "
                            >
                              {isDeleting ? "מוחק..." : "כן, מחק"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDeleteId(null)}
                              className="
                                rounded-md border border-slate-600 bg-transparent px-2.5 py-1
                                text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800
                              "
                            >
                              ביטול
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {/* Analytics */}
                            <button
                              type="button"
                              onClick={() => setAnalyticsTarget(boy)}
                              className="
                                rounded-lg border border-lime-500/40 bg-transparent px-3 py-1.5
                                text-xs font-medium text-lime-400 transition-colors
                                hover:bg-lime-950/40 hover:border-lime-400/60
                                focus:outline-none focus:ring-2 focus:ring-lime-500 focus:ring-offset-1 focus:ring-offset-slate-950
                              "
                              title="ניתוח ביצועים"
                            >
                              📊
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(boy)}
                              className="
                                rounded-lg border border-slate-600 bg-transparent px-3 py-1.5
                                text-xs font-medium text-slate-400 transition-colors
                                hover:bg-slate-700 hover:text-white
                                focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-1 focus:ring-offset-slate-950
                              "
                            >
                              עריכה
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDeleteId(boy.id)}
                              className="
                                rounded-lg border border-red-500/40 bg-transparent px-3 py-1.5
                                text-xs font-medium text-red-400 transition-colors
                                hover:bg-red-950/40 hover:border-red-400/60
                                focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 focus:ring-offset-slate-950
                              "
                            >
                              מחיקה
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit / Add modal */}
      {modal && (
        <BoyModal
          mode={modal.mode}
          boy={modal.boy}
          onClose={() => setModal(null)}
          onSaved={showSuccess}
        />
      )}

      {/* Analytics modal */}
      {analyticsTarget && (
        <BoyAnalyticsModal
          boy={analyticsTarget}
          onClose={() => setAnalyticsTarget(null)}
        />
      )}

    </div>
  );
}
