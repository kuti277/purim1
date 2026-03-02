import { useEffect, useRef, useState } from "react";
import {
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { clientDb } from "../lib/firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BoyOption {
  id: string;
  /** Display name shown in the dropdown */
  name: string;
  /**
   * "שם נדרים" — the external identifier registered with Nedarim Plus for
   * this collector. Sent as `Param1` in the postMessage payload so that the
   * Nedarim callback can attribute the donation precisely.
   * Falls back to `name` when absent.
   */
  nedarimName?: string;
  /**
   * Donor/collector number — same as `MatrimId` in the Nedarim API.
   * Sent as `MatrimId` in the postMessage so Nedarim can attribute the
   * payment to the correct collector record on their side.
   */
  donorNumber?: string;
}

export interface NedarimPaymentModalProps {
  open: boolean;
  onClose: () => void;
  boys: BoyOption[];
  /** Fired after the Firestore write succeeds — use to show a global toast */
  onSuccess?: (amount: number, boyName: string) => void;
}

// ─── Nedarim postMessage response ─────────────────────────────────────────────

interface NedarimMsg {
  Status?: string;
  Amount?: string | number;
  ClientName?: string;
  /** Unique transaction ID returned by Nedarim — used as Firestore doc ID */
  TransactionId?: string | number;
  /** Hebrew success key used in some Nedarim environments */
  תוצאה?: string;
  [key: string]: unknown;
}

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

// ─── Shared field styles — dark crypto theme ──────────────────────────────────

const INP =
  "w-full rounded-lg bg-slate-800 border border-slate-700 text-white " +
  "placeholder-slate-500 px-3 py-2.5 text-sm font-mono transition-colors " +
  "focus:border-cyan-500/70 focus:outline-none focus:ring-1 focus:ring-cyan-500/25 " +
  "disabled:opacity-40 disabled:cursor-not-allowed";

const LBL =
  "block mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500";

// ─── Component ────────────────────────────────────────────────────────────────

export function NedarimPaymentModal({
  open,
  onClose,
  boys,
  onSuccess,
}: NedarimPaymentModalProps) {
  // ── Form state ────────────────────────────────────────────────────────────
  const [amount, setAmount]         = useState("");
  const [clientName, setClientName] = useState("");
  const [comment, setComment]       = useState("");
  const [boyId, setBoyId]           = useState("");
  // Combobox search state (decoupled from boyId so typing doesn't clear selection)
  const [boySearch, setBoySearch]   = useState("");
  const [comboOpen, setComboOpen]   = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [paying, setPaying]             = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [success, setSuccess]           = useState(false);
  const [successAmount, setSuccessAmount] = useState(0);
  const [successBoyName, setSuccessBoyName] = useState("");

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Derive the currently-selected boy object for live Param1 preview
  const selectedBoy = boys.find((b) => b.id === boyId) ?? null;
  const resolvedParam1 = selectedBoy?.nedarimName?.trim() || selectedBoy?.name?.trim() || "";

  // Filtered list for the combobox (empty query → show all)
  const filteredBoys = boySearch.trim()
    ? boys.filter((b) =>
        b.name.toLowerCase().includes(boySearch.trim().toLowerCase()) ||
        (b.nedarimName ?? "").toLowerCase().includes(boySearch.trim().toLowerCase())
      )
    : boys;

  // ── Close combobox on outside click ──────────────────────────────────────
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setComboOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  // ── Receive postMessage from Nedarim iframe ────────────────────────────────
  useEffect(() => {
    if (!open) return;

    function handleMessage(event: MessageEvent) {
      if (!event.origin.includes("matara.pro")) return;

      let data: unknown = event.data;
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch { return; }
      }

      if (!isNedarimSuccess(data)) return;

      const msg        = data as NedarimMsg;
      const paidAmount = parseFloat(String(msg.Amount ?? amount));
      const boyName    = selectedBoy?.name ?? "כללי";

      // Use Nedarim's TransactionId as the Firestore document ID so that a
      // background CRON fetching the same transaction later will merge onto
      // the exact same document — never create a duplicate.
      const txId = String(msg.TransactionId ?? `nd_${Date.now()}`);

      setDoc(
        doc(clientDb, "transactions", txId),
        {
          type:                 "credit",
          source:               "nedarim_plus",
          nedarimTransactionId: txId,
          amount:               paidAmount,
          targetId:             boyId   || "general",
          targetType:           boyId   ? "boy" : "general",
          targetName:           boyName,
          // Attribution fields stored for cross-referencing with Nedarim records
          nedarimParam1:        resolvedParam1,
          donorNumber:          selectedBoy?.donorNumber ?? "",
          dedication:           comment.trim(),
          donorName:            clientName.trim(),
          date:                 serverTimestamp(),
          status:               "completed",
          splitDetails:         [],
        },
        { merge: true }
      )
        .then(() => {
          setSuccessAmount(paidAmount);
          setSuccessBoyName(boyName);
          setSuccess(true);
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
  // resolvedParam1 intentionally omitted — derived from boyId which IS in the deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, amount, boyId, clientName, comment, boys, onSuccess]);

  // ── Reset on close ────────────────────────────────────────────────────────
  function handleClose() {
    if (paying) return;
    setAmount(""); setClientName(""); setComment(""); setBoyId("");
    setBoySearch(""); setComboOpen(false);
    setError(null); setSuccess(false); setPaying(false);
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

    setPaying(true);

    // Comment is the field Nedarim stores in the `Comments` column of GetHistoryJson.
    // It must contain the fundraiser's nedarimName as a substring so the cron's
    // Comments.includes(nedarimName) match works. Any dedication the operator typed
    // is appended after the name — matching is a substring check so it still works.
    // This mirrors the campaign page format: "ע"י ליכט להצלחת חיה נשא בת רויזא".
    const fundraiserLabel = resolvedParam1 || selectedBoy?.name || "";
    const commentValue = [fundraiserLabel, comment.trim()].filter(Boolean).join(" ");
    const payload: Record<string, string> = {
      Action:      "לשלם",
      Amount:      String(parsedAmount),
      ClientName:  clientName.trim(),
      PaymentType: "Ragil",
      Param1:      fundraiserLabel,   // kept for forward-compat
      Comment:     commentValue,      // fundraiser name + dedication → stored as Comments
    };
    if (selectedBoy?.donorNumber) {
      payload["MatrimId"] = selectedBoy.donorNumber;
    }

    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify(payload),
      "https://www.matara.pro"
    );
  }

  if (!open) return null;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      dir="rtl"
    >
      <div className="relative flex w-full max-w-4xl flex-col rounded-2xl bg-slate-950 border border-slate-700/60 shadow-[0_0_60px_rgba(6,182,212,0.08)] overflow-hidden">

        {/* ── Accent bar ── */}
        <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-cyan-500 to-indigo-500" />

        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 pt-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/30">
              <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-black text-white">תשלום מאובטח — נדרים פלוס</h2>
              <p className="text-xs text-slate-500">
                פרטי הכרטיס מוזנים ישירות לשרת נדרים — לא עוברים דרך המערכת שלנו
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={paying}
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-800 hover:text-slate-400 transition-colors disabled:opacity-30"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Success overlay ── */}
        {success && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-slate-950/95 backdrop-blur-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-2 ring-emerald-500/40 shadow-[0_0_30px_rgba(52,211,153,0.25)]">
              <svg className="h-9 w-9 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-white">התשלום אושר!</p>
              <p className="mt-1.5 text-sm text-slate-400">
                סכום של{" "}
                <span className="font-bold text-emerald-400">
                  ₪{successAmount.toLocaleString("he-IL")}
                </span>
                {successBoyName !== "כללי" && (
                  <> עבור <span className="font-bold text-white">{successBoyName}</span></>
                )}
                {" "}נשמר בהיסטוריית העסקאות
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="mt-1 rounded-xl bg-emerald-600 px-8 py-2.5 text-sm font-black text-white shadow-[0_0_16px_rgba(52,211,153,0.3)] hover:bg-emerald-500 transition-all"
            >
              סגור
            </button>
          </div>
        )}

        {/* ── Body: two columns ── */}
        <div className="flex flex-col sm:flex-row overflow-hidden">

          {/* Section A — Metadata form */}
          <div className="flex flex-col gap-5 border-b border-slate-800 p-6 sm:w-72 sm:shrink-0 sm:border-b-0 sm:border-l sm:border-slate-800">
            <p className={LBL}>פרטי התרומה</p>

            {/* Amount */}
            <div>
              <label htmlFor="nd-amount" className={LBL}>
                סכום (₪) <span className="text-red-500">*</span>
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
                className={INP}
                disabled={paying}
              />
            </div>

            {/* Client name */}
            <div>
              <label htmlFor="nd-client" className={LBL}>
                שם תורם <span className="text-red-500">*</span>
              </label>
              <input
                id="nd-client"
                type="text"
                placeholder="ישראל ישראלי"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className={INP}
                disabled={paying}
              />
            </div>

            {/* Boy combobox — searchable */}
            <div ref={comboRef} className="relative">
              <label htmlFor="nd-boy-search" className={LBL}>
                בחר מתרים / יעד (הקלד לחיפוש)
              </label>
              <div className="relative">
                <input
                  id="nd-boy-search"
                  type="text"
                  autoComplete="off"
                  placeholder="הקלד שם לחיפוש..."
                  value={boySearch}
                  disabled={paying}
                  onFocus={() => setComboOpen(true)}
                  onChange={(e) => {
                    setBoySearch(e.target.value);
                    setBoyId("");          // clear selection while typing
                    setComboOpen(true);
                  }}
                  className={INP + (boyId ? " ring-1 ring-cyan-500/50 border-cyan-500/50" : "")}
                />
                {/* Clear button — shown when a boy is selected */}
                {boyId && !paying && (
                  <button
                    type="button"
                    onClick={() => { setBoyId(""); setBoySearch(""); setComboOpen(true); }}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    tabIndex={-1}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Dropdown list */}
              {comboOpen && !paying && (
                <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-2xl">
                  {/* "כללי" (clear) option */}
                  <li>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setBoyId(""); setBoySearch(""); setComboOpen(false); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 transition-colors"
                    >
                      <span className="text-slate-600">—</span> כללי
                    </button>
                  </li>

                  {filteredBoys.length === 0 ? (
                    <li className="px-3 py-3 text-center text-xs text-slate-600">
                      לא נמצאו תוצאות
                    </li>
                  ) : (
                    filteredBoys.map((b) => (
                      <li key={b.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setBoyId(b.id);
                            setBoySearch(b.name);
                            setComboOpen(false);
                          }}
                          className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-slate-800 ${
                            b.id === boyId
                              ? "bg-cyan-500/10 text-cyan-300"
                              : "text-white"
                          }`}
                        >
                          <span>{b.name}</span>
                          {b.nedarimName && b.nedarimName !== b.name && (
                            <span className="font-mono text-[10px] text-slate-500">
                              {b.nedarimName}
                            </span>
                          )}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}

              {/* Live Param1 preview */}
              {selectedBoy && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                  <span className="font-bold uppercase tracking-widest">Param1 →</span>
                  <span className={`font-mono ${resolvedParam1 ? "text-cyan-400" : "text-slate-600 italic"}`}>
                    {resolvedParam1 || "(לא הוגדר שם נדרים)"}
                  </span>
                </p>
              )}
            </div>

            {/* Comment / dedication */}
            <div>
              <label htmlFor="nd-comment" className={LBL}>
                הקדשה / הערות
              </label>
              <input
                id="nd-comment"
                type="text"
                placeholder="לרפואת..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className={INP}
                disabled={paying}
              />
              <p className="mt-1.5 text-[10px] text-slate-600">
                נשלח לנדרים כ-Comment
              </p>
            </div>

            {/* PCI notice */}
            <div className="mt-auto rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                </svg>
                <p className="text-[10px] leading-relaxed text-cyan-400/80">
                  פרטי כרטיס האשראי מוזנים ישירות לממשק נדרים פלוס — PCI DSS Level 1
                </p>
              </div>
            </div>
          </div>

          {/* Section B — Nedarim iframe */}
          <div className="relative flex flex-1 flex-col bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
              <p className={LBL + " mb-0"}>הזנת פרטי כרטיס מאובטחת</p>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]" />
                <span className="text-[10px] text-slate-500">SSL מוצפן</span>
              </div>
            </div>
            <iframe
              ref={iframeRef}
              src={(() => {
                // Confirmed from live API: Param1/Param2 are NEVER returned by
                // GetHistoryJson. The only field Nedarim reliably populates is
                // Comments. Pass nedarimName as Comments so the cron's
                // Comments.includes(nedarimName) match catches these payments.
                const base = "https://www.matara.pro/nedarimplus/iframe/";
                if (!selectedBoy) return base;
                const p = new URLSearchParams();
                const label = selectedBoy.nedarimName?.trim() || selectedBoy.name;
                p.set("Comments", label);
                p.set("Param1",   label);  // kept for forward-compat with any Nedarim config change
                return `${base}?${p.toString()}`;
              })()}
              title="נדרים פלוס — הזנת כרטיס אשראי מאובטחת"
              className="h-96 w-full flex-1 border-0"
              sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
            />
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4">
          <div className="flex-1 ml-4">
            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400">
                {error}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={paying}
              className="rounded-lg border border-slate-700 bg-transparent px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 transition-colors disabled:opacity-40"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={handlePay}
              disabled={paying || success}
              className="flex items-center gap-2 rounded-xl bg-cyan-600 px-6 py-2.5 text-sm font-black text-white shadow-[0_0_16px_rgba(6,182,212,0.3)] hover:bg-cyan-500 transition-all disabled:cursor-not-allowed disabled:opacity-40"
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
