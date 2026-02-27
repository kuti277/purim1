import { useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { clientDb } from "../lib/firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BoyOption {
  id: string;
  name: string;
}

export interface NedarimPaymentModalProps {
  open: boolean;
  onClose: () => void;
  boys: BoyOption[];
  /** Called after the Firestore write succeeds — use to show a global success toast */
  onSuccess?: (amount: number, boyName: string) => void;
}

interface NedarimMsg {
  Status?: string;
  Amount?: string | number;
  ClientName?: string;
  TransactionId?: string | number;
  // Hebrew keys used by some Nedarim environments
  תוצאה?: string;
  [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IFRAME_SRC =
  "https://www.matara.pro/nedarimplus/iframe/?Tokef=Hide&CVV=Hide";

function isNedarimSuccess(raw: unknown): raw is NedarimMsg {
  if (!raw || typeof raw !== "object") return false;
  const d = raw as NedarimMsg;
  return (
    d.Status === "Success" ||
    d.Status === "SUCCESS" ||
    d["תוצאה"] === "OK" ||
    d["תוצאה"] === "ok"
  );
}

// ─── Shared field styles (light theme, matches TransactionsPage) ───────────────

const fieldCls =
  "rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 " +
  "placeholder-gray-400 focus:border-indigo-500 focus:outline-none " +
  "focus:ring-1 focus:ring-indigo-500 bg-white w-full";
const labelCls = "block mb-1 text-xs font-medium text-gray-600";

// ─── Component ────────────────────────────────────────────────────────────────

export function NedarimPaymentModal({
  open,
  onClose,
  boys,
  onSuccess,
}: NedarimPaymentModalProps) {
  // ── Metadata form state ────────────────────────────────────────────────────
  const [amount, setAmount] = useState("");
  const [clientName, setClientName] = useState("");
  const [comment, setComment] = useState("");
  const [boyId, setBoyId] = useState("");

  // ── API credentials (loaded once per modal open) ───────────────────────────
  const [mosad, setMosad] = useState("");
  const [apiValid, setApiValid] = useState("");

  // ── UI state ───────────────────────────────────────────────────────────────
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successAmount, setSuccessAmount] = useState(0);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ── Load API credentials from Firestore whenever modal opens ──────────────
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getDoc(doc(clientDb, "settings", "apiKeys"))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const d = snap.data() as { mosadId?: string; apiKey?: string };
        if (d.mosadId) setMosad(d.mosadId);
        if (d.apiKey) setApiValid(d.apiKey);
      })
      .catch((err) => console.error("[NedarimModal] load creds:", err));
    return () => {
      cancelled = true;
    };
  }, [open]);

  // ── Listen for postMessage responses from the Nedarim iframe ──────────────
  useEffect(() => {
    if (!open) return;

    function handleMessage(event: MessageEvent) {
      // Accept only from the Nedarim domain
      if (!event.origin.includes("matara.pro")) return;

      let data: unknown = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }

      if (!isNedarimSuccess(data)) return;

      // ── Success path ──────────────────────────────────────────────────────
      const msg = data as NedarimMsg;
      const paidAmount = parseFloat(String(msg.Amount ?? amount));
      const selectedBoy = boys.find((b) => b.id === boyId);
      const boyName = selectedBoy?.name ?? "כללי";

      // Use TransactionId from Nedarim as the Firestore document ID so that
      // a background CRON sync fetching the same transaction later will
      // setDoc({merge:true}) onto the same document instead of duplicating it.
      const txId = String(msg.TransactionId ?? `nd_${Date.now()}`);

      setDoc(doc(clientDb, "transactions", txId), {
        type: "credit",
        source: "nedarim_plus",
        nedarimTransactionId: txId,
        amount: paidAmount,
        targetId: boyId || "general",
        targetType: boyId ? "boy" : "general",
        targetName: boyName,
        dedication: comment.trim(),
        donorName: clientName.trim(),
        date: serverTimestamp(),
        status: "completed",
        splitDetails: [],
      }, { merge: true })
        .then(() => {
          setSuccess(true);
          setSuccessAmount(paidAmount);
          setPaying(false);
          onSuccess?.(paidAmount, boyName);
        })
        .catch((err) => {
          console.error("[NedarimModal] Firestore write error:", err);
          setError("התשלום בוצע אך שמירת הנתונים נכשלה — פנה למנהל המערכת");
          setPaying(false);
        });
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [open, amount, boyId, clientName, comment, boys, onSuccess]);

  // ── Reset state when modal closes ─────────────────────────────────────────
  function handleClose() {
    setAmount("");
    setClientName("");
    setComment("");
    setBoyId("");
    setError(null);
    setSuccess(false);
    setPaying(false);
    onClose();
  }

  // ── Send payment instruction to iframe ────────────────────────────────────
  function handlePay() {
    setError(null);

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("יש להזין סכום תקין");
      return;
    }
    if (!clientName.trim()) {
      setError("יש להזין שם תורם");
      return;
    }
    if (!mosad || !apiValid) {
      setError("פרטי ה-API חסרים — הגדר אותם תחת מרכז סנכרון");
      return;
    }

    setPaying(true);

    const payload = {
      Action: "לשלם",
      Mosad: mosad,
      ApiValid: apiValid,
      Amount: String(parsedAmount),
      ClientName: clientName.trim(),
      PaymentType: "Ragil",
      Param1: boyId || "",
      Param2: comment.trim(),
    };

    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify(payload),
      "https://www.matara.pro"
    );
  }

  if (!open) return null;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      dir="rtl"
    >
      {/* Modal panel */}
      <div className="relative flex w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50">
              {/* Shield-lock icon */}
              <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">תשלום מאובטח — נדרים פלוס</h2>
              <p className="text-xs text-gray-400">
                פרטי הכרטיס מוזנים ישירות לשרת נדרים — לא עוברים דרך המערכת שלנו
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={paying}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors disabled:opacity-40"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Success overlay ── */}
        {success && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-white">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg className="h-9 w-9 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-gray-900">התשלום אושר!</p>
              <p className="mt-1 text-sm text-gray-500">
                סכום של{" "}
                <span className="font-bold text-gray-800">
                  ₪{successAmount.toLocaleString("he-IL")}
                </span>{" "}
                נשמר בהיסטוריית העסקאות
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="mt-2 rounded-xl bg-indigo-600 px-8 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-500 transition-colors"
            >
              סגור
            </button>
          </div>
        )}

        {/* ── Body: two columns ── */}
        <div className="flex flex-col gap-0 sm:flex-row overflow-hidden">

          {/* Section A — Metadata form (right in RTL) */}
          <div className="flex flex-col gap-4 border-b border-gray-100 p-6 sm:w-72 sm:shrink-0 sm:border-b-0 sm:border-l">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              פרטי התרומה
            </p>

            {/* Amount */}
            <div>
              <label htmlFor="nd-amount" className={labelCls}>
                סכום (₪) <span className="text-red-400">*</span>
              </label>
              <input
                id="nd-amount"
                type="number"
                min="1"
                step="1"
                dir="ltr"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={fieldCls}
                disabled={paying}
              />
            </div>

            {/* Client name */}
            <div>
              <label htmlFor="nd-client" className={labelCls}>
                שם תורם <span className="text-red-400">*</span>
              </label>
              <input
                id="nd-client"
                type="text"
                placeholder="ישראל ישראלי"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className={fieldCls}
                disabled={paying}
              />
            </div>

            {/* Boy / Matrim target */}
            <div>
              <label htmlFor="nd-boy" className={labelCls}>
                שייך לגבאי (Param1)
              </label>
              <select
                id="nd-boy"
                value={boyId}
                onChange={(e) => setBoyId(e.target.value)}
                className={fieldCls}
                disabled={paying}
              >
                <option value="">— כללי —</option>
                {boys.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Comment */}
            <div>
              <label htmlFor="nd-comment" className={labelCls}>
                הקדשה / הערות (Param2)
              </label>
              <input
                id="nd-comment"
                type="text"
                placeholder="לרפואת..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className={fieldCls}
                disabled={paying}
              />
            </div>

            {/* PCI notice */}
            <div className="mt-auto rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                </svg>
                <p className="text-[10px] leading-relaxed text-indigo-600">
                  פרטי כרטיס האשראי מוזנים ישירות לממשק המאובטח של נדרים פלוס בלבד — PCI DSS Level 1
                </p>
              </div>
            </div>
          </div>

          {/* Section B — Nedarim iframe (left in RTL) */}
          <div className="relative flex flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                הזנת פרטי כרטיס מאובטחת
              </p>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                <span className="text-[10px] text-gray-400">מוצפן SSL</span>
              </div>
            </div>
            <iframe
              ref={iframeRef}
              src={IFRAME_SRC}
              title="נדרים פלוס — הזנת כרטיס אשראי מאובטחת"
              className="h-96 w-full flex-1 border-0"
              sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
            />
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
          {/* Error */}
          <div className="flex-1 ml-4">
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={paying}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={handlePay}
              disabled={paying || success}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-500 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {paying ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  מעבד תשלום...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 21Z" />
                  </svg>
                  בצע תשלום
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
