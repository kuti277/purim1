import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { clientApp, clientDb } from "../lib/firebase";
import { NedarimPaymentModal } from "../components/NedarimPaymentModal";

// ─── Local types ──────────────────────────────────────────────────────────────

interface TxDoc {
  id: string;
  type: "credit" | "cash";
  amount: number;
  targetId: string;
  targetType: "folder" | "boy";
  targetName: string;
  dedication: string;
  date: Timestamp | null;
  // completed → normal; request_cancel → awaiting backend reversal; cancelled → fully reversed
  status: "completed" | "request_cancel" | "cancelled";
}

interface BoyDoc {
  id: string;
  name: string;
  status: string;
  folderId: string;
  totalRaised: number;
  nedarimName?: string;
  donorNumber?: string;
  matrimId?: string;
}

interface FolderDoc {
  id: string;
  status: "new" | "released" | "finished";
  phoneNumber: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(ts: Timestamp | null): string {
  if (!ts) return "—";
  return ts.toDate().toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Shared field styles ──────────────────────────────────────────────────────

const fieldCls =
  "rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 " +
  "placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 " +
  "bg-white";

const labelCls = "text-xs font-medium text-gray-600";

// ─── Donation form ────────────────────────────────────────────────────────────

interface DonationFormProps {
  boys: BoyDoc[];
  folders: FolderDoc[];
  onSaved: () => void;
}

function DonationForm({ boys, folders, onSaved }: DonationFormProps) {
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState<"cash" | "credit">("cash");
  // Encoded as "folder:<id>" or "boy:<id>" to distinguish in one <select>
  const [targetValue, setTargetValue] = useState("");
  const [dedication, setDedication] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only show non-finished folders in the dropdown
  const activeFolders = folders.filter((f) => f.status !== "finished");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("יש להזין סכום תקין");
      return;
    }
    if (!targetValue) {
      setError("יש לבחור יעד לתרומה");
      return;
    }

    setSubmitting(true);
    try {
      const [targetType, targetId] = targetValue.split(":") as [
        "folder" | "boy",
        string,
      ];

      // Resolve display name from in-memory state — no extra Firestore query needed.
      // The Cloud Function will independently verify the target and perform the split.
      const targetName =
        targetType === "folder"
          ? `קלסר ${targetId}`
          : (boys.find((b) => b.id === targetId)?.name ?? targetId);

      // Write a single pending_transactions document.
      // The Cloud Function picks this up, performs the split, updates boys' totalRaised,
      // and writes the final record to the transactions collection.
      await addDoc(collection(clientDb, "pending_transactions"), {
        amount: parsedAmount,
        type: paymentType,
        targetId,
        targetType,
        targetName,
        dedication: dedication.trim(),
        date: serverTimestamp(),
        status: "pending",
      });

      // Reset form
      setAmount("");
      setPaymentType("cash");
      setTargetValue("");
      setDedication("");
      onSaved();
    } catch (err) {
      console.error("[DonationForm] submit error:", err);
      setError("שגיאה בשמירת התרומה. נסה שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
      <h2 className="text-base font-semibold text-gray-800 mb-5">
        הזנת תרומה ידנית
      </h2>

      <form onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Amount */}
          <div className="flex flex-col gap-1">
            <label htmlFor="tx-amount" className={labelCls}>
              סכום (₪)
            </label>
            <input
              id="tx-amount"
              type="number"
              min="1"
              step="1"
              dir="ltr"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={fieldCls}
            />
          </div>

          {/* Payment type */}
          <div className="flex flex-col gap-1">
            <label htmlFor="tx-type" className={labelCls}>
              אמצעי תשלום
            </label>
            <select
              id="tx-type"
              value={paymentType}
              onChange={(e) =>
                setPaymentType(e.target.value as "cash" | "credit")
              }
              className={fieldCls}
            >
              <option value="cash">מזומן</option>
              <option value="credit">אשראי</option>
            </select>
          </div>

          {/* Target */}
          <div className="flex flex-col gap-1">
            <label htmlFor="tx-target" className={labelCls}>
              יעד התרומה
            </label>
            <select
              id="tx-target"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className={fieldCls}
            >
              <option value="">בחר יעד...</option>
              {activeFolders.length > 0 && (
                <optgroup label="קלסרים">
                  {activeFolders.map((f) => (
                    <option key={f.id} value={`folder:${f.id}`}>
                      קלסר {f.id}
                    </option>
                  ))}
                </optgroup>
              )}
              {boys.length > 0 && (
                <optgroup label="ילדים">
                  {boys.map((b) => (
                    <option key={b.id} value={`boy:${b.id}`}>
                      {b.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Dedication */}
          <div className="flex flex-col gap-1">
            <label htmlFor="tx-dedication" className={labelCls}>
              הקדשה / הערות
            </label>
            <input
              id="tx-dedication"
              type="text"
              placeholder="לרפואת..."
              value={dedication}
              onChange={(e) => setDedication(e.target.value)}
              className={fieldCls}
            />
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="
              rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white
              shadow-sm transition-colors hover:bg-indigo-500
              disabled:cursor-not-allowed disabled:opacity-50
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1
            "
          >
            {submitting ? "שומר..." : "שמור תרומה"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Transaction history table ────────────────────────────────────────────────

interface HistoryTableProps {
  transactions: TxDoc[];
  cancellingId: string | null;
  onCancel: (tx: TxDoc) => Promise<void>;
}

function StatusBadge({ status }: { status: TxDoc["status"] }) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
        הושלם
      </span>
    );
  }
  if (status === "request_cancel") {
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700 ring-1 ring-inset ring-yellow-600/20">
        ממתין לביטול
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
      בוטל
    </span>
  );
}

function rowClass(status: TxDoc["status"]) {
  if (status === "cancelled") return "bg-gray-50 opacity-60";
  if (status === "request_cancel") return "bg-yellow-50/40";
  return "bg-white hover:bg-gray-50/50";
}

function TransactionHistoryTable({
  transactions,
  cancellingId,
  onCancel,
}: HistoryTableProps) {
  if (transactions.length === 0) {
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
            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"
          />
        </svg>
        <p className="mt-3 text-sm font-medium text-gray-500">אין עסקאות עדיין</p>
        <p className="mt-1 text-xs text-gray-400">
          תרומות שיאושרו על ידי השרת יופיעו כאן בסדר כרונולוגי הפוך
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {[
                "תאריך",
                "יעד",
                "סכום",
                "אמצעי תשלום",
                "הקדשה",
                "סטטוס",
                "פעולה",
              ].map((h) => (
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
            {transactions.map((tx) => (
              <tr key={tx.id} className={rowClass(tx.status)}>
                {/* Date */}
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                  {formatDate(tx.date)}
                </td>

                {/* Target */}
                <td className="px-4 py-3 text-sm font-medium text-gray-800">
                  {tx.targetName}
                  {tx.targetType === "folder" && (
                    <span className="mr-1.5 text-xs font-normal text-gray-400">
                      (קלסר)
                    </span>
                  )}
                </td>

                {/* Amount */}
                <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-gray-800">
                  {formatCurrency(tx.amount)}
                </td>

                {/* Type */}
                <td className="px-4 py-3 text-sm text-gray-600">
                  {tx.type === "credit" ? "אשראי" : "מזומן"}
                </td>

                {/* Dedication */}
                <td className="max-w-[10rem] truncate px-4 py-3 text-sm text-gray-500">
                  {tx.dedication || "—"}
                </td>

                {/* Status badge */}
                <td className="px-4 py-3">
                  <StatusBadge status={tx.status} />
                </td>

                {/* Cancel action — only available on completed transactions */}
                <td className="px-4 py-3">
                  {tx.status === "completed" && (
                    <button
                      type="button"
                      onClick={() => onCancel(tx)}
                      disabled={cancellingId === tx.id}
                      className="
                        rounded-lg border border-red-200 bg-white px-2.5 py-1.5
                        text-xs font-medium text-red-600
                        hover:bg-red-50 transition-colors
                        disabled:cursor-not-allowed disabled:opacity-50
                        focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1
                      "
                    >
                      {cancellingId === tx.id ? "שולח..." : "ביטול עסקה"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Manual Nedarim Update ────────────────────────────────────────────────────

interface ManualNedarimUpdateProps {
  boys: BoyDoc[];
  onSuccess: (msg: string) => void;
}

function ManualNedarimUpdate({ boys, onSuccess }: ManualNedarimUpdateProps) {
  const [selectedBoyId, setSelectedBoyId] = useState("");
  const [amount, setAmount]               = useState("");
  const [submitting, setSubmitting]       = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  const pushFn = httpsCallable(getFunctions(clientApp), "pushOfflineDonationToNedarim");

  async function submit(direction: 1 | -1) {
    setError(null);
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("יש להזין סכום חיובי תקין");
      return;
    }
    const boy = boys.find((b) => b.id === selectedBoyId);
    if (!boy) {
      setError("יש לבחור ילד מהרשימה");
      return;
    }
    if (!boy.matrimId) {
      setError(`לילד "${boy.name}" לא הוגדר MatrimId — עדכן אותו תחילה בניהול ילדים`);
      return;
    }

    setSubmitting(true);
    try {
      const result = await pushFn({
        matrimId:   boy.matrimId,
        clientName: boy.nedarimName ?? boy.name,
        amount:     parsedAmount * direction,
      });
      const data = result.data as Record<string, unknown>;
      // Nedarim returns Status:"Success" on success
      if (data?.Status === "Error" || data?.Status === "error") {
        throw new Error(String(data?.Description ?? data?.Message ?? "שגיאה מנדרים"));
      }
      const label = direction === 1 ? "זיכוי" : "חיוב";
      onSuccess(`${label} של ₪${parsedAmount.toLocaleString("he-IL")} עבור ${boy.name} בוצע בהצלחה`);
      setAmount("");
      setSelectedBoyId("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
      <h2 className="text-base font-semibold text-gray-800 mb-5">עדכון נדרים ידני</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Boy selector */}
        <div className="flex flex-col gap-1">
          <label htmlFor="mn-boy" className={labelCls}>בחר ילד</label>
          <select
            id="mn-boy"
            value={selectedBoyId}
            onChange={(e) => setSelectedBoyId(e.target.value)}
            className={fieldCls}
            disabled={submitting}
          >
            <option value="">בחר ילד...</option>
            {boys.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.nedarimName && b.nedarimName !== b.name ? ` (${b.nedarimName})` : ""}
                {!b.matrimId ? " ⚠️" : ""}
              </option>
            ))}
          </select>
          {selectedBoyId && !boys.find((b) => b.id === selectedBoyId)?.matrimId && (
            <p className="text-[11px] text-amber-600">חסר MatrimId — נדרים לא יוכל לשייך את הסכום</p>
          )}
        </div>

        {/* Amount */}
        <div className="flex flex-col gap-1">
          <label htmlFor="mn-amount" className={labelCls}>סכום (₪)</label>
          <input
            id="mn-amount"
            type="number"
            min="1"
            step="1"
            dir="ltr"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={fieldCls}
            disabled={submitting}
          />
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1">
          <span className={labelCls}>פעולה</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => submit(1)}
              disabled={submitting}
              className="
                flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white
                hover:bg-emerald-500 transition-colors
                disabled:cursor-not-allowed disabled:opacity-50
                focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1
              "
            >
              {submitting ? "..." : "הוסף (+)"}
            </button>
            <button
              type="button"
              onClick={() => submit(-1)}
              disabled={submitting}
              className="
                flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white
                hover:bg-red-500 transition-colors
                disabled:cursor-not-allowed disabled:opacity-50
                focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1
              "
            >
              {submitting ? "..." : "הפחת (-)"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<TxDoc[]>([]);
  const [boys, setBoys] = useState<BoyDoc[]>([]);
  const [folders, setFolders] = useState<FolderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [nedarimOpen, setNedarimOpen] = useState(false);

  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccessMsg(null), 3500);
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  // ── Firestore: confirmed transactions (newest first) ────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(clientDb, "transactions"), orderBy("date", "desc")),
      (snap) => {
        setTransactions(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<TxDoc, "id">),
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error("[TransactionsPage] transactions error:", err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  // ── Firestore: boys (for target dropdown) ───────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      collection(clientDb, "boys"),
      (snap) => {
        setBoys(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<BoyDoc, "id">),
          }))
        );
      },
      (err) => console.error("[TransactionsPage] boys error:", err)
    );
    return unsub;
  }, []);

  // ── Firestore: folders (for target dropdown) ────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      collection(clientDb, "folders"),
      (snap) => {
        setFolders(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<FolderDoc, "id">),
          }))
        );
      },
      (err) => console.error("[TransactionsPage] folders error:", err)
    );
    return unsub;
  }, []);

  // ── Cancel handler ──────────────────────────────────────────────────────────
  // Sets status to 'request_cancel'. The Cloud Function detects this change,
  // performs the reversal math, updates boys' totalRaised, and flips the
  // status to 'cancelled'.
  async function handleCancel(tx: TxDoc) {
    setCancellingId(tx.id);
    try {
      await updateDoc(doc(clientDb, "transactions", tx.id), {
        status: "request_cancel",
      });
      showSuccess("בקשת הביטול נשלחה — השרת יעבד את ההיפוך בקרוב");
    } catch (err) {
      console.error("[TransactionsPage] cancel error:", err);
    } finally {
      setCancellingId(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Nedarim payment modal */}
      <NedarimPaymentModal
        open={nedarimOpen}
        onClose={() => setNedarimOpen(false)}
        boys={boys.map((b) => ({
          id:          b.id,
          name:        b.name,
          nedarimName: b.nedarimName,
          donorNumber: b.donorNumber,
        }))}
        onSuccess={(amount, boyName) =>
          showSuccess(
            `תשלום של ₪${amount.toLocaleString("he-IL")} עבור ${boyName} בוצע בהצלחה`
          )
        }
      />

      {/* Page heading */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">תרומות ועסקאות</h1>
          <p className="mt-1 text-sm text-gray-500">
            הזנת תרומות ידנית וצפייה בהיסטוריית עסקאות בזמן אמת
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNedarimOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 21Z" />
          </svg>
          תשלום Nedarim Plus
        </button>
      </div>

      {/* Success toast */}
      {successMsg && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          {successMsg}
        </div>
      )}

      {/* Donation form */}
      <DonationForm
        boys={boys}
        folders={folders}
        onSaved={() => showSuccess("התרומה התקבלה לעיבוד — תופיע בטבלה לאחר אישור השרת")}
      />

      {/* Manual Nedarim Update */}
      <ManualNedarimUpdate
        boys={boys}
        onSuccess={showSuccess}
      />

      {/* Transaction history */}
      <div>
        <h2 className="mb-3 text-base font-semibold text-gray-800">
          היסטוריית עסקאות
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          </div>
        ) : (
          <TransactionHistoryTable
            transactions={transactions}
            cancellingId={cancellingId}
            onCancel={handleCancel}
          />
        )}
      </div>
    </div>
  );
}
