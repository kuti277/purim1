import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { clientDb } from "../lib/firebase";

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

            {/* Nedarim Name */}
            <div className="flex flex-col gap-1">
              <label htmlFor="boy-nedarim" className={labelCls}>שם נדרים</label>
              <input
                id="boy-nedarim"
                type="text"
                placeholder="שם כפי שמופיע בנדרים"
                value={form.nedarimName}
                onChange={field("nedarimName")}
                className={fieldCls}
              />
            </div>

            {/* Donor Number */}
            <div className="flex flex-col gap-1">
              <label htmlFor="boy-donor-num" className={labelCls}>מספר מתרים</label>
              <input
                id="boy-donor-num"
                type="text"
                placeholder="מספר מתרים במערכת"
                value={form.donorNumber}
                onChange={field("donorNumber")}
                className={fieldCls}
              />
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
                  {["שם", "שיעור", "יעד גיוס", 'סה"כ נתרם', "סטטוס", "פעולות"].map((h) => (
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
                      {/* Name */}
                      <td className="px-4 py-3 text-sm font-semibold text-white">
                        {boy.name}
                      </td>

                      {/* Shiur */}
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {boy.shiur}
                      </td>

                      {/* Goal */}
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-300">
                        {formatCurrency(boy.goal)}
                      </td>

                      {/* Total raised — visually distinguished as read-only data */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="text-sm font-medium text-white">
                          {formatCurrency(boy.totalRaised)}
                        </span>
                        <span className="mr-1.5 text-[11px] text-slate-500">
                          ({progressPct(boy.totalRaised, boy.goal)}%)
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge status={boy.status} />
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

      {/* Modal — rendered in a portal-like position via fixed positioning */}
      {modal && (
        <BoyModal
          mode={modal.mode}
          boy={modal.boy}
          onClose={() => setModal(null)}
          onSaved={showSuccess}
        />
      )}

    </div>
  );
}
