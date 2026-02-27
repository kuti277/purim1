import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { clientDb } from "../lib/firebase";
import { SipProvider } from "../contexts/SipContext";
import { SipSettingsCard } from "../components/SipSettingsCard";
import { CallOverlay } from "../components/CallOverlay";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface BinderDoc {
  id: string;
  firstName: string;
  lastName: string;
  region?: string;
  city?: string;
  street?: string;
  buildingNum?: string;
  phone?: string;
  cellphone?: string;
  status: "collected" | "collecting" | "not_collected";
}

interface BoyDoc {
  id: string;
  name: string;
  shiur: string;
  status: "in_field" | "finished" | "not_out";
  folderId?: string;
  totalRaised: number;
  goal: number;
}

// ─── Style constants ───────────────────────────────────────────────────────────

const BINDER_STATUS: Record<string, { label: string; dot: string; text: string }> = {
  collected:     { label: "נאסף",    dot: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]",  text: "text-emerald-400" },
  collecting:    { label: "באיסוף",  dot: "bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.8)]",   text: "text-orange-400"  },
  not_collected: { label: "לא נאסף", dot: "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]",       text: "text-red-400"     },
};

const BOY_STATUS: Record<string, { label: string; cls: string }> = {
  in_field: { label: "בשטח",   cls: "bg-lime-500/10 text-lime-400 ring-1 ring-lime-400/30"      },
  finished: { label: "סיים",   cls: "bg-slate-700/50 text-slate-400 ring-1 ring-slate-500/30"   },
  not_out:  { label: "לא יצא", cls: "bg-orange-500/10 text-orange-400 ring-1 ring-orange-400/30" },
};

const SEL_CLS =
  "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 " +
  "text-sm text-slate-100 [color-scheme:dark] " +
  "focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500";

// ─── Inner page (must be inside SipProvider) ──────────────────────────────────

function FieldPageContent() {
  const [binders, setBinders]           = useState<BinderDoc[]>([]);
  const [boys, setBoys]                 = useState<BoyDoc[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selected, setSelected]         = useState<BinderDoc | null>(null);
  const [binderSearch, setBinderSearch] = useState("");
  const [addBoyId, setAddBoyId]         = useState("");
  const [shiftPhone, setShiftPhone]     = useState("");
  const [noPhone, setNoPhone]           = useState(false);
  const [releasing, setReleasing]       = useState(false);

  // ── Firestore listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    let done = 0;
    const finish = () => { if (++done === 2) setLoading(false); };

    const u1 = onSnapshot(
      query(collection(clientDb, "binders"), orderBy("createdAt", "desc")),
      (snap) => {
        setBinders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BinderDoc)));
        finish();
      },
      finish,
    );
    const u2 = onSnapshot(
      query(collection(clientDb, "boys"), orderBy("name", "asc")),
      (snap) => {
        setBoys(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BoyDoc)));
        finish();
      },
      finish,
    );
    return () => { u1(); u2(); };
  }, []);

  // Keep `selected` in sync when Firestore updates the binder doc
  useEffect(() => {
    if (!selected) return;
    const fresh = binders.find((b) => b.id === selected.id);
    if (fresh) setSelected(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binders]);

  // ── Derived lists ────────────────────────────────────────────────────────────

  const filteredBinders = useMemo(() => {
    const q = binderSearch.toLowerCase().trim();
    if (!q) return binders;
    return binders.filter((b) =>
      [b.firstName, b.lastName, b.region ?? "", b.city ?? ""]
        .some((f) => f.toLowerCase().includes(q)),
    );
  }, [binders, binderSearch]);

  const assignedBoys = useMemo(
    () => boys.filter((b) => b.folderId === selected?.id),
    [boys, selected],
  );

  // Only boys not yet assigned to any binder
  const availableBoys = useMemo(
    () => boys.filter((b) => !b.folderId),
    [boys],
  );

  const inFieldCount = assignedBoys.filter((b) => b.status === "in_field").length;
  const canRelease   = assignedBoys.length > 0;

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function addBoy() {
    if (!selected || !addBoyId) return;
    const phone = noPhone ? "" : shiftPhone.trim();
    try {
      await updateDoc(doc(clientDb, "boys", addBoyId), {
        folderId: selected.id,
        shiftPhone: phone,
      });
      setAddBoyId("");
      setShiftPhone("");
      setNoPhone(false);
    } catch (err) {
      console.error("[FoldersPage] addBoy error:", err);
    }
  }

  async function removeBoy(boyId: string) {
    const remaining = assignedBoys.filter((b) => b.id !== boyId);
    const batch = writeBatch(clientDb);
    batch.update(doc(clientDb, "boys", boyId), { folderId: "", status: "not_out" });
    if (remaining.length === 0 && selected) {
      batch.update(doc(clientDb, "binders", selected.id), {
        status: "not_collected",
        statusUpdatedAt: serverTimestamp(),
      });
    }
    try {
      await batch.commit();
    } catch (err) {
      console.error("[FoldersPage] removeBoy error:", err);
    }
  }

  async function releaseToField() {
    if (!selected || !canRelease) return;
    setReleasing(true);
    try {
      const batch = writeBatch(clientDb);
      assignedBoys.forEach((b) =>
        batch.update(doc(clientDb, "boys", b.id), {
          status: "in_field",
          folderId: selected.id,
        }),
      );
      batch.update(doc(clientDb, "binders", selected.id), {
        status: "collecting",
        statusUpdatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (err) {
      console.error("[FoldersPage] releaseToField error:", err);
    } finally {
      setReleasing(false);
    }
  }

  async function recallFromField() {
    if (!selected) return;
    const inField = assignedBoys.filter((b) => b.status === "in_field");
    if (!inField.length) return;
    const batch = writeBatch(clientDb);
    inField.forEach((b) =>
      batch.update(doc(clientDb, "boys", b.id), { status: "not_out" }),
    );
    try {
      await batch.commit();
    } catch (err) {
      console.error("[FoldersPage] recallFromField error:", err);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6" dir="rtl">

      {/* Page heading */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-white">שחרור לשטח</h1>
        <p className="mt-1 text-sm text-slate-500">
          הקצה מתרימים לקלסרים ושחרר לשטח בלחיצה אחת
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">

          {/* ── Left: Binder selector ─────────────────────────────────────── */}
          <div className="space-y-3">

            {/* Search */}
            <div className="relative">
              <svg
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="חיפוש קלסר..."
                value={binderSearch}
                onChange={(e) => setBinderSearch(e.target.value)}
                className="
                  w-full rounded-xl bg-slate-900 border border-slate-800
                  pr-10 pl-4 py-2.5 text-sm text-white placeholder-slate-500
                  focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/25
                  transition-colors
                "
              />
            </div>

            {/* Binder cards */}
            <div className="space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto no-scrollbar">
              {filteredBinders.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-600">
                  {binderSearch ? "לא נמצאו קלסרים התואמים את החיפוש" : "אין קלסרים עדיין"}
                </p>
              ) : (
                filteredBinders.map((binder) => {
                  const bs         = BINDER_STATUS[binder.status] ?? BINDER_STATUS.not_collected;
                  const assigned   = boys.filter((b) => b.folderId === binder.id).length;
                  const isSelected = selected?.id === binder.id;

                  return (
                    <button
                      key={binder.id}
                      type="button"
                      onClick={() => { setSelected(binder); setAddBoyId(""); setShiftPhone(""); setNoPhone(false); }}
                      className={`
                        w-full rounded-xl border px-4 py-3 text-right transition-all duration-150
                        ${isSelected
                          ? "border-cyan-500/50 bg-cyan-500/10 shadow-[0_0_16px_rgba(6,182,212,0.12)]"
                          : "border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-800/50"
                        }
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${bs.dot}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-white">
                            {binder.firstName} {binder.lastName}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {[binder.city, binder.street].filter(Boolean).join(", ") || "כתובת לא צוינה"}
                          </p>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          <span className={`text-[10px] font-bold ${bs.text}`}>{bs.label}</span>
                          {assigned > 0 && (
                            <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-400 ring-1 ring-cyan-500/30">
                              {assigned} מתרימים
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Right: Assignment panel ───────────────────────────────────── */}
          {selected ? (
            <div className="relative rounded-2xl overflow-hidden border border-slate-700/60 bg-slate-900/60 backdrop-blur-sm shadow-[0_0_40px_rgba(6,182,212,0.06)]">
              {/* Accent stripe */}
              <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-cyan-500 to-sky-400" />

              <div className="px-6 pt-6 pb-6 space-y-5">

                {/* Binder header */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-black text-white">
                      {selected.firstName} {selected.lastName}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      {selected.city && <span>📍 {selected.city}</span>}
                      {selected.street && (
                        <span>{selected.street} {selected.buildingNum}</span>
                      )}
                      {(selected.cellphone || selected.phone) && (
                        <span dir="ltr">📞 {selected.cellphone || selected.phone}</span>
                      )}
                      {selected.region && <span>אזור: {selected.region}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {inFieldCount > 0 && (
                      <span className="flex items-center gap-1.5 rounded-full bg-lime-500/10 px-3 py-1 text-xs font-bold text-lime-400 ring-1 ring-lime-500/30">
                        <span className="h-1.5 w-1.5 rounded-full bg-lime-400 animate-pulse" />
                        {inFieldCount} בשטח
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-white transition-colors"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="h-px bg-slate-800" />

                {/* Assigned boys list */}
                <div>
                  <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    מתרימים משויכים ({assignedBoys.length})
                  </p>

                  {assignedBoys.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-700 py-8 text-center">
                      <p className="text-sm text-slate-600">אין מתרימים משויכים עדיין</p>
                      <p className="mt-1 text-xs text-slate-700">
                        בחר מתרים מהרשימה למטה והוסף בלחיצה על +
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {assignedBoys.map((boy) => {
                        const bs = BOY_STATUS[boy.status] ?? BOY_STATUS.not_out;
                        const p  = boy.goal > 0 ? Math.round((boy.totalRaised / boy.goal) * 100) : 0;
                        return (
                          <div
                            key={boy.id}
                            className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-800/40 px-4 py-2.5"
                          >
                            <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${bs.cls}`}>
                              {bs.label}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-white">{boy.name}</p>
                              <p className="text-xs text-slate-500">
                                {boy.shiur} · ₪{boy.totalRaised.toLocaleString("he-IL")} ({p}%)
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void removeBoy(boy.id)}
                              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-600 hover:bg-red-500/15 hover:text-red-400 transition-colors"
                              title="הסר מהקלסר"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Add boy row */}
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    הוסף מתרים לקלסר
                  </p>
                  <div className="flex gap-2">
                    <select
                      value={addBoyId}
                      onChange={(e) => setAddBoyId(e.target.value)}
                      className={SEL_CLS + " flex-1"}
                    >
                      <option value="">בחר מתרים...</option>
                      {availableBoys.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} — {b.shiur}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void addBoy()}
                      disabled={!addBoyId}
                      className="
                        flex h-10 w-10 shrink-0 items-center justify-center
                        rounded-xl bg-cyan-500 text-slate-950 font-black
                        shadow-[0_0_16px_rgba(6,182,212,0.4)]
                        hover:bg-cyan-400
                        disabled:opacity-40 disabled:cursor-not-allowed
                        transition-all
                      "
                      title="הוסף מתרים"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                  {/* Shift phone input */}
                  {addBoyId && (
                    <div className="mt-2.5 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="tel"
                          dir="ltr"
                          placeholder="טלפון משמרת (לדוגמה: 050-0000000)"
                          value={shiftPhone}
                          disabled={noPhone}
                          onChange={(e) => setShiftPhone(e.target.value)}
                          className="
                            flex-1 rounded-lg border border-slate-700 bg-slate-800/80
                            px-3 py-2 text-sm text-slate-100 placeholder-slate-600
                            focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500
                            disabled:opacity-40 disabled:cursor-not-allowed
                          "
                        />
                        <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded accent-orange-400"
                            checked={noPhone}
                            onChange={(e) => { setNoPhone(e.target.checked); if (e.target.checked) setShiftPhone(""); }}
                          />
                          <span className="text-xs text-slate-400">אין טלפון</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {availableBoys.length === 0 && (
                    <p className="mt-1.5 text-xs text-slate-600">
                      כל המתרימים כבר משויכים לקלסרים
                    </p>
                  )}
                </div>

                <div className="h-px bg-slate-800" />

                {/* Action buttons */}
                <div className="flex items-center gap-3">

                  {/* Release to field */}
                  <button
                    type="button"
                    onClick={() => void releaseToField()}
                    disabled={!canRelease || releasing}
                    className="
                      group relative flex-1 overflow-hidden
                      flex items-center justify-center gap-2.5
                      rounded-xl px-5 py-3 text-sm font-black text-white
                      bg-gradient-to-r from-lime-500 to-emerald-500
                      shadow-[0_4px_20px_rgba(163,230,53,0.4)]
                      hover:from-lime-400 hover:to-emerald-400
                      hover:shadow-[0_6px_30px_rgba(163,230,53,0.6)]
                      disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
                      transition-all duration-200
                      focus:outline-none focus:ring-2 focus:ring-lime-500/60 focus:ring-offset-2 focus:ring-offset-slate-950
                    "
                  >
                    <span className="pointer-events-none absolute inset-0 translate-x-full group-hover:translate-x-[-200%] transition-transform duration-700 bg-gradient-to-l from-transparent via-white/20 to-transparent skew-x-12" />
                    {releasing ? (
                      <svg className="relative h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="relative h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                      </svg>
                    )}
                    <span className="relative">
                      {releasing ? "משחרר..." : `🚀 שחרר לשטח (${assignedBoys.length} מתרימים)`}
                    </span>
                  </button>

                  {/* Recall from field */}
                  {inFieldCount > 0 && (
                    <button
                      type="button"
                      onClick={() => void recallFromField()}
                      className="
                        rounded-xl border border-slate-700 bg-transparent
                        px-4 py-3 text-sm font-semibold text-slate-400
                        hover:bg-slate-800 hover:text-white
                        transition-colors
                        focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-1 focus:ring-offset-slate-950
                      "
                    >
                      החזר לבסיס ({inFieldCount})
                    </button>
                  )}
                </div>

              </div>
            </div>
          ) : (
            /* Empty-selection placeholder */
            <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-700 py-24">
              <div className="text-center">
                <svg
                  className="mx-auto h-12 w-12 text-slate-700"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <p className="mt-4 text-sm font-semibold text-slate-600">
                  בחר קלסר מהרשימה
                </p>
                <p className="mt-1 text-xs text-slate-700">
                  לאחר בחירה תוכל להקצות מתרימים ולשחרר לשטח
                </p>
              </div>
            </div>
          )}

        </div>
      )}

      {/* SIP / Dialing settings — secondary section */}
      <div className="border-t border-slate-800 pt-5">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-600">
          הגדרות חיוג SIP
        </p>
        <SipSettingsCard />
      </div>

      {/* Active call overlay */}
      <CallOverlay />

    </div>
  );
}

// ─── Exported page ─────────────────────────────────────────────────────────────

export function FoldersPage() {
  return (
    <SipProvider>
      <FieldPageContent />
    </SipProvider>
  );
}
