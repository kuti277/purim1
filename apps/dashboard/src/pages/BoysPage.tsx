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
}

type StatusKey = "in_field" | "finished" | "not_out";

interface FormState {
  name: string;
  shiur: string;
  goal: string;        // string for controlled input; parsed to number on save
  status: StatusKey;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  in_field: "בשטח",
  finished: "סיים",
  not_out:  "לא יצא",
};

// Full class strings so Tailwind never purges them.
const STATUS_BADGE_CLS: Record<StatusKey, string> = {
  in_field: "bg-green-50  text-green-700  ring-green-600/20",
  finished: "bg-gray-100  text-gray-600   ring-gray-500/20",
  not_out:  "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
};

const EMPTY_FORM: FormState = {
  name:   "",
  shiur:  "",
  goal:   "500",
  status: "not_out",
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
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 " +
  "placeholder-gray-400 focus:border-indigo-500 focus:outline-none " +
  "focus:ring-1 focus:ring-indigo-500 bg-white";

const labelCls = "text-xs font-medium text-gray-600";

// ─── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls =
    STATUS_BADGE_CLS[status as StatusKey] ??
    "bg-gray-100 text-gray-500 ring-gray-400/20";
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
      ? { name: boy.name, shiur: boy.shiur, goal: String(boy.goal), status: boy.status }
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
        });
        onSaved(`${name} נוסף בהצלחה`);
      } else {
        // totalRaised is never touched here — it is managed by the Cloud Function
        await updateDoc(doc(clientDb, "boys", boy!.id), {
          name,
          shiur,
          goal,
          status: form.status,
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-800">
            {mode === "add" ? "הוספת מתרים חדש" : `עריכת ${boy!.name}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
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
                שם <span className="text-red-500">*</span>
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
                שיעור <span className="text-red-500">*</span>
              </label>
              <input
                id="boy-shiur"
                type="text"
                placeholder="א, ב, ג..."
                value={form.shiur}
                onChange={field("shiur")}
                className={fieldCls}
              />
            </div>

            {/* Goal */}
            <div className="flex flex-col gap-1">
              <label htmlFor="boy-goal" className={labelCls}>
                יעד גיוס (₪) <span className="text-red-500">*</span>
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

            {/* totalRaised — read-only, edit mode only */}
            {mode === "edit" && boy && (
              <div className="flex flex-col gap-1">
                <label className={labelCls}>
                  סה&quot;כ נתרם
                  <span className="mr-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-normal text-gray-400">
                    קריאה בלבד
                  </span>
                </label>
                <div
                  className="w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
                  aria-readonly="true"
                >
                  {formatCurrency(boy.totalRaised)}
                  <span className="mr-2 text-xs text-gray-400">
                    ({progressPct(boy.totalRaised, boy.goal)}% מהיעד)
                  </span>
                </div>
              </div>
            )}

          </div>

          {/* Validation error */}
          {error && (
            <div className="mx-6 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={saving}
              className="
                rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm
                transition-colors hover:bg-indigo-500
                disabled:cursor-not-allowed disabled:opacity-50
                focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1
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
    <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
      <svg
        className="mx-auto h-10 w-10 text-gray-300"
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
      <p className="mt-3 text-sm font-medium text-gray-500">אין מתרימים במערכת עדיין</p>
      <p className="mt-1 text-xs text-gray-400">לחץ על "הוסף מתרים" כדי להתחיל</p>
      <button
        type="button"
        onClick={onAdd}
        className="
          mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2
          text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500
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
          <h1 className="text-2xl font-bold text-gray-900">ניהול מתרימים</h1>
          <p className="mt-1 text-sm text-gray-500">
            הוספה, עריכה ומחיקה של מתרימים ·{" "}
            <span className="font-medium text-gray-700">{boys.length}</span> מתרימים במערכת
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="
            flex shrink-0 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5
            text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1
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
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          ✓ {successMsg}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        </div>

      /* Empty state */
      ) : boys.length === 0 ? (
        <EmptyState onAdd={openAdd} />

      /* Data table */
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {["שם", "שיעור", "יעד גיוס", 'סה"כ נתרם', "סטטוס", "פעולות"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {boys.map((boy) => {
                  const isConfirming = pendingDeleteId === boy.id;
                  const isDeleting   = deletingId === boy.id;
                  return (
                    <tr
                      key={boy.id}
                      className={`transition-colors ${
                        isConfirming
                          ? "bg-red-50"
                          : "bg-white hover:bg-gray-50/50"
                      }`}
                    >
                      {/* Name */}
                      <td className="px-4 py-3 text-sm font-semibold text-gray-800">
                        {boy.name}
                      </td>

                      {/* Shiur */}
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {boy.shiur}
                      </td>

                      {/* Goal */}
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                        {formatCurrency(boy.goal)}
                      </td>

                      {/* Total raised — visually distinguished as read-only data */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="text-sm font-medium text-gray-800">
                          {formatCurrency(boy.totalRaised)}
                        </span>
                        <span className="mr-1.5 text-[11px] text-gray-400">
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
                            <span className="text-xs font-medium text-red-600 whitespace-nowrap">
                              האם למחוק?
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleDelete(boy)}
                              disabled={isDeleting}
                              className="
                                rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white
                                transition-colors hover:bg-red-500 disabled:opacity-50
                              "
                            >
                              {isDeleting ? "מוחק..." : "כן, מחק"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDeleteId(null)}
                              className="
                                rounded-md border border-gray-200 bg-white px-2.5 py-1
                                text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50
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
                                rounded-lg border border-gray-200 bg-white px-3 py-1.5
                                text-xs font-medium text-gray-600 transition-colors
                                hover:bg-gray-50 hover:text-gray-900
                                focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1
                              "
                            >
                              עריכה
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDeleteId(boy.id)}
                              className="
                                rounded-lg border border-red-200 bg-white px-3 py-1.5
                                text-xs font-medium text-red-600 transition-colors
                                hover:bg-red-50
                                focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1
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
