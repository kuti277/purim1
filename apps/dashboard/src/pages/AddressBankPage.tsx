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

interface AddressEntry {
  id: string;
  firstName: string;
  lastName: string;
  city: string;
  street: string;
  buildingNum: string;
  region: string;
  phone: string;
  cellphone: string;
  relation: string;
  notes: string;
  createdAt?: Timestamp;
}

type AddrDraft = Omit<AddressEntry, "id" | "createdAt">;

const ADDR_EMPTY: AddrDraft = {
  firstName: "", lastName: "", city: "", street: "",
  buildingNum: "", region: "", phone: "", cellphone: "",
  relation: "", notes: "",
};

// ─── Import / Export helpers ───────────────────────────────────────────────────

function exportAddrCsv(entries: AddressEntry[]) {
  const BOM = "\uFEFF";
  const headers = ["שם פרטי", "שם משפחה", "עיר", "רחוב", "מס׳ בניין", "אזור", "טלפון", "נייד", "קשר", "הערות"];
  const rows = entries.map((e) => [
    e.firstName, e.lastName, e.city, e.street,
    e.buildingNum, e.region, e.phone, e.cellphone,
    e.relation, e.notes,
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "address-bank.csv"; a.click();
  URL.revokeObjectURL(url);
}

async function parseAddrRows(file: File): Promise<AddrDraft[]> {
  const buf  = await file.arrayBuffer();
  const wb   = XLSX.read(buf);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
  return rows
    .map((r) => ({
      firstName:   String(r["שם פרטי"]    ?? r["firstName"]   ?? "").trim(),
      lastName:    String(r["שם משפחה"]   ?? r["lastName"]    ?? "").trim(),
      city:        String(r["עיר"]         ?? r["city"]        ?? "").trim(),
      street:      String(r["רחוב"]        ?? r["street"]      ?? "").trim(),
      buildingNum: String(r["מס׳ בניין"]  ?? r["buildingNum"] ?? "").trim(),
      region:      String(r["אזור"]        ?? r["region"]      ?? "").trim(),
      phone:       String(r["טלפון"]       ?? r["phone"]       ?? "").trim(),
      cellphone:   String(r["נייד"]        ?? r["cellphone"]   ?? "").trim(),
      relation:    String(r["קשר"]         ?? r["relation"]    ?? "").trim(),
      notes:       String(r["הערות"]       ?? r["notes"]       ?? "").trim(),
    }))
    .filter((r) => r.firstName || r.lastName);
}

// ─── Shared style constants ─────────────────────────────────────────────────────

const INP =
  "w-full rounded-lg bg-slate-800 border border-slate-700 text-white " +
  "placeholder-slate-500 px-3 py-2 text-sm transition-colors " +
  "focus:border-cyan-500/70 focus:outline-none focus:ring-1 focus:ring-cyan-500/25";

const LBL = "block mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500";

// ─── Add-address modal ─────────────────────────────────────────────────────────

function AddressModal({
  onSave,
  onClose,
  saving,
}: {
  onSave: (data: AddrDraft) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<AddrDraft>({ ...ADDR_EMPTY });
  const set = (k: keyof AddrDraft, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-slate-700/60 bg-slate-900 shadow-[0_0_80px_rgba(147,51,234,0.12)] overflow-y-auto max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-black text-white">הוסף כתובת למאגר</h2>
            <div className="h-0.5 w-10 rounded-full bg-gradient-to-l from-purple-500 to-pink-400 mt-1.5" />
          </div>
          <button
            type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">

          {/* Region */}
          <div>
            <label className={LBL}>אזור</label>
            <input type="text" placeholder="אזור..." value={form.region}
              onChange={(e) => set("region", e.target.value)} className={INP} />
          </div>

          {/* First + Last */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LBL}>שם פרטי</label>
              <input type="text" placeholder="שם פרטי..." value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)} className={INP} />
            </div>
            <div>
              <label className={LBL}>שם משפחה</label>
              <input type="text" placeholder="שם משפחה..." value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)} className={INP} />
            </div>
          </div>

          {/* City + Street + Building */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={LBL}>עיר</label>
              <input type="text" placeholder="עיר..." value={form.city}
                onChange={(e) => set("city", e.target.value)} className={INP} />
            </div>
            <div>
              <label className={LBL}>רחוב</label>
              <input type="text" placeholder="רחוב..." value={form.street}
                onChange={(e) => set("street", e.target.value)} className={INP} />
            </div>
            <div>
              <label className={LBL}>מס׳ בניין</label>
              <input type="text" placeholder="מס׳..." value={form.buildingNum}
                onChange={(e) => set("buildingNum", e.target.value)} className={INP} />
            </div>
          </div>

          {/* Phone + Cellphone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LBL}>טלפון</label>
              <input type="tel" dir="ltr" placeholder="טלפון..." value={form.phone}
                onChange={(e) => set("phone", e.target.value)} className={INP} />
            </div>
            <div>
              <label className={LBL}>נייד</label>
              <input type="tel" dir="ltr" placeholder="נייד..." value={form.cellphone}
                onChange={(e) => set("cellphone", e.target.value)} className={INP} />
            </div>
          </div>

          {/* Relation */}
          <div>
            <label className={LBL}>קשר</label>
            <input type="text" placeholder="קשר (תורם קיים, חדש, וכד׳)..." value={form.relation}
              onChange={(e) => set("relation", e.target.value)} className={INP} />
          </div>

          {/* Notes */}
          <div>
            <label className={LBL}>הערות</label>
            <textarea rows={2} placeholder="הערות..." value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              className={INP + " resize-none"} />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
              ביטול
            </button>
            <button
              type="button"
              disabled={saving || (!form.firstName && !form.lastName)}
              onClick={() => onSave(form)}
              className="rounded-xl bg-purple-600 px-5 py-2 text-sm font-black text-white shadow-[0_0_16px_rgba(147,51,234,0.4)] hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {saving ? "שומר..." : "הוסף למאגר"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Create-Binder Wizard (3-step) ─────────────────────────────────────────────

function CreateBinderWizard({
  sourceEntry,
  allEntries,
  onClose,
}: {
  sourceEntry: AddressEntry;
  allEntries: AddressEntry[];
  onClose: () => void;
}) {
  type WizStep = 1 | 2 | 3;
  const [step, setStep]                     = useState<WizStep>(1);
  const [binderNumber, setBinderNumber]     = useState("");
  const [saving, setSaving]                 = useState(false);
  const [createdBinderId, setCreatedId]     = useState<string | null>(null);
  const [selectedIds, setSelectedIds]       = useState<Set<string>>(new Set([sourceEntry.id]));
  const [assignSaving, setAssignSaving]     = useState(false);
  const [addrSearch, setAddrSearch]         = useState("");

  // filtered entries for step 3 address picker
  const visibleEntries = useMemo(() => {
    if (!addrSearch.trim()) return allEntries;
    const q = addrSearch.toLowerCase();
    return allEntries.filter((e) =>
      [e.firstName, e.lastName, e.city, e.street, e.region]
        .some((f) => (f ?? "").toLowerCase().includes(q)),
    );
  }, [allEntries, addrSearch]);

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleConfirm() {
    if (!binderNumber.trim()) return;
    setSaving(true);
    try {
      const ref = await addDoc(collection(clientDb, "binders"), {
        binderNumber:    binderNumber.trim(),
        region:          sourceEntry.region,
        firstName:       sourceEntry.firstName,
        lastName:        sourceEntry.lastName,
        street:          sourceEntry.street,
        buildingNum:     sourceEntry.buildingNum,
        phone:           sourceEntry.phone,
        cellphone:       sourceEntry.cellphone,
        city:            sourceEntry.city,
        relation:        sourceEntry.relation,
        notes:           sourceEntry.notes,
        status:          "not_collected",
        createdAt:       serverTimestamp(),
        statusUpdatedAt: serverTimestamp(),
      });
      setCreatedId(ref.id);
      setStep(2);
    } finally {
      setSaving(false);
    }
  }

  async function handleAssign() {
    if (!createdBinderId) return;
    setAssignSaving(true);
    try {
      await updateDoc(doc(clientDb, "binders", createdBinderId), {
        assignedAddresses: [...selectedIds],
      });
      onClose();
    } finally {
      setAssignSaving(false);
    }
  }

  const STEP_LABELS: Record<WizStep, string> = { 1: "מספר קלסר", 2: "פעולה", 3: "שיוך כתובות" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-700/60 bg-slate-900 shadow-[0_0_80px_rgba(6,182,212,0.12)] overflow-hidden">

        {/* Accent stripe */}
        <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-cyan-500 to-blue-500" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-black text-white">צור קלסר</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {[sourceEntry.firstName, sourceEntry.lastName].filter(Boolean).join(" ") || "כתובת"} · שלב {step}/3 — {STEP_LABELS[step]}
            </p>
          </div>

          {/* Step pip indicators */}
          <div className="flex items-center gap-1.5 mx-4">
            {([1, 2, 3] as WizStep[]).map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all ${
                  s === step ? "w-6 bg-cyan-400" : s < step ? "w-3 bg-cyan-700" : "w-3 bg-slate-700"
                }`}
              />
            ))}
          </div>

          <button
            type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Step 1: Binder number ──────────────────────────────────────────── */}
        {step === 1 && (
          <div className="p-6 space-y-5">
            <div>
              <label className={LBL}>מספר קלסר</label>
              <input
                type="text"
                autoFocus
                placeholder="הזן מספר קלסר..."
                value={binderNumber}
                onChange={(e) => setBinderNumber(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleConfirm(); }}
                className={INP + " text-lg font-bold tracking-widest text-center"}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
                ביטול
              </button>
              <button
                type="button"
                disabled={saving || !binderNumber.trim()}
                onClick={() => void handleConfirm()}
                className="flex items-center gap-2 rounded-xl bg-cyan-600 px-6 py-2 text-sm font-black text-white shadow-[0_0_16px_rgba(6,182,212,0.35)] hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {saving ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    יוצר...
                  </>
                ) : "אישור"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Choose next action ─────────────────────────────────────── */}
        {step === 2 && (
          <div className="p-6 space-y-4">
            <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-300">
              ✓ קלסר מספר <span className="font-black text-cyan-200">{binderNumber}</span> נוצר בהצלחה
            </div>
            <p className="text-sm text-slate-400">מה תרצה לעשות עכשיו?</p>
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => { setBinderNumber(""); setCreatedId(null); setSelectedIds(new Set()); setStep(1); }}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-bold text-white hover:bg-slate-700 transition-colors"
              >
                <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                צור עוד קלסרים
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-cyan-600 to-blue-600 px-4 py-3 text-sm font-black text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:from-cyan-500 hover:to-blue-500 transition-all"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                </svg>
                שייך לקלסר זה כתובות
              </button>
            </div>
            <div className="flex justify-start pt-1">
              <button type="button" onClick={onClose}
                className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
                סגור
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Multi-select address picker ───────────────────────────── */}
        {step === 3 && (
          <div className="p-6 space-y-4">

            {/* Search */}
            <div className="relative">
              <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                autoFocus
                placeholder="סנן כתובות..."
                value={addrSearch}
                onChange={(e) => setAddrSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 pr-9 pl-3 text-sm text-white placeholder-slate-500 focus:border-cyan-500/70 focus:outline-none focus:ring-1 focus:ring-cyan-500/25"
              />
            </div>

            {/* Selection summary */}
            <div className="text-xs text-slate-500">
              <span className="font-bold text-cyan-400">{selectedIds.size}</span> כתובות נבחרו
            </div>

            {/* List */}
            <div className="max-h-64 overflow-y-auto space-y-1 rounded-xl border border-slate-800 bg-slate-950/50 p-2">
              {visibleEntries.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-600">לא נמצאו כתובות</p>
              ) : visibleEntries.map((e) => {
                const checked = selectedIds.has(e.id);
                return (
                  <label
                    key={e.id}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                      checked ? "bg-cyan-500/10 ring-1 ring-cyan-500/30" : "hover:bg-slate-800/60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleId(e.id)}
                      className="h-4 w-4 shrink-0 accent-cyan-500"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">
                        {[e.firstName, e.lastName].filter(Boolean).join(" ") || "—"}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {[e.city, e.street, e.buildingNum].filter(Boolean).join(" ") || "—"}
                      </p>
                    </div>
                    {e.region && (
                      <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400 ring-1 ring-slate-700">
                        {e.region}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setStep(2)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
                חזור
              </button>
              <button
                type="button"
                disabled={assignSaving || selectedIds.size === 0}
                onClick={() => void handleAssign()}
                className="flex items-center gap-2 rounded-xl bg-cyan-600 px-6 py-2 text-sm font-black text-white shadow-[0_0_16px_rgba(6,182,212,0.35)] hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {assignSaving ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    שומר...
                  </>
                ) : `שמור (${selectedIds.size})`}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function AddressBankPage() {
  const [entries, setEntries]           = useState<AddressEntry[]>([]);
  const [loading, setLoading]           = useState(true);
  const [searchQ, setSearchQ]           = useState("");
  const [cityFilter, setCityFilter]     = useState("");
  const [addOpen, setAddOpen]           = useState(false);
  const [addrSaving, setAddrSaving]     = useState(false);
  const [wizardEntry, setWizardEntry]   = useState<AddressEntry | null>(null);
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [importing, setImporting]       = useState(false);
  const importRef                       = useRef<HTMLInputElement>(null);

  // ── Firestore listener ────────────────────────────────────────────────────────
  useEffect(() => {
    return onSnapshot(
      query(collection(clientDb, "addressBank"), orderBy("createdAt", "desc")),
      (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AddressEntry)));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, []);

  // ── Derived data ──────────────────────────────────────────────────────────────
  const cities = useMemo(
    () => [...new Set(entries.map((e) => e.city).filter(Boolean))].sort(),
    [entries],
  );

  const filtered = useMemo(() => {
    let res = entries;
    if (cityFilter) res = res.filter((e) => e.city === cityFilter);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      res = res.filter((e) =>
        [e.firstName, e.lastName, e.city, e.street, e.buildingNum,
          e.region, e.phone, e.cellphone, e.relation, e.notes]
          .some((f) => (f ?? "").toLowerCase().includes(q)),
      );
    }
    return res;
  }, [entries, searchQ, cityFilter]);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  async function handleAdd(data: AddrDraft) {
    setAddrSaving(true);
    try {
      await addDoc(collection(clientDb, "addressBank"), {
        ...data,
        createdAt: serverTimestamp(),
      });
      setAddOpen(false);
    } finally {
      setAddrSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("מחק כתובת זו מהמאגר?")) return;
    setDeletingId(id);
    try {
      await deleteDoc(doc(clientDb, "addressBank", id));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const rows = await parseAddrRows(file);
      if (!rows.length) { setImporting(false); return; }
      const CHUNK = 499;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const batch = writeBatch(clientDb);
        rows.slice(i, i + CHUNK).forEach((row) => {
          batch.set(doc(collection(clientDb, "addressBank")), {
            ...row,
            createdAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
    } catch (err) {
      console.error("[AddressBankPage] import error:", err);
    } finally {
      setImporting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-6xl" dir="rtl">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">מאגר כתובות</h1>
          <p className="mt-1 text-sm text-slate-500">
            אזור ביניים לכתובות לפני הפיכתן לקלסרים פעילים
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Export */}
          <button
            type="button"
            onClick={() => exportAddrCsv(entries)}
            disabled={entries.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-lime-500/40 bg-transparent px-3 py-2.5 text-xs font-semibold text-lime-400 transition-colors hover:bg-lime-500/10 hover:border-lime-400/60 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            ייצוא נתונים
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
            {importing ? "מייבא..." : "ייבוא מאקסל/CSV"}
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
            className="flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-black text-white shadow-[0_0_16px_rgba(147,51,234,0.4)] hover:bg-purple-500 transition-all"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            הוסף כתובת
          </button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap gap-3 items-center">

        {/* Full-text search */}
        <div className="relative flex-1 min-w-[220px]">
          <svg
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="חיפוש לפי שם, רחוב, עיר, קשר..."
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2.5 pr-9 pl-4 text-sm text-white placeholder-slate-500 focus:border-purple-500/70 focus:outline-none focus:ring-1 focus:ring-purple-500/25"
          />
        </div>

        {/* City filter */}
        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white [color-scheme:dark] focus:border-purple-500/70 focus:outline-none min-w-[150px]"
        >
          <option value="">כל הערים</option>
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Clear filters */}
        {(searchQ || cityFilter) && (
          <button
            type="button"
            onClick={() => { setSearchQ(""); setCityFilter(""); }}
            className="rounded-xl border border-slate-700 px-3 py-2.5 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            נקה סינון
          </button>
        )}

        {/* Count pill */}
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2.5 text-sm text-slate-500">
          <span className="font-black text-purple-400 tabular-nums">{filtered.length}</span>
          <span>/ {entries.length} כתובות</span>
        </div>
      </div>

      {/* ── Data table ── */}
      <div className="relative rounded-2xl border border-slate-700/60 bg-slate-900/60 overflow-hidden shadow-[0_0_40px_rgba(147,51,234,0.06)]">
        {/* Top accent stripe */}
        <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-purple-500 to-pink-400" />

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-purple-500" />
          </div>

        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-5xl mb-3">🏠</p>
            <p className="text-sm font-semibold text-slate-400">
              {entries.length === 0
                ? "המאגר ריק — הוסף כתובות ראשונות"
                : "לא נמצאו תוצאות לחיפוש"}
            </p>
            {entries.length === 0 && (
              <button
                type="button" onClick={() => setAddOpen(true)}
                className="mt-4 rounded-xl bg-purple-600/80 px-5 py-2 text-sm font-bold text-white hover:bg-purple-600 transition-colors"
              >
                הוסף כתובת ראשונה
              </button>
            )}
          </div>

        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {[
                    "שם מלא", "עיר", "רחוב ומס׳", "אזור",
                    "טלפון", "נייד", "קשר", "הערות", "פעולות",
                  ].map((h) => (
                    <th key={h} className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                  >
                    {/* Full name */}
                    <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">
                      {[entry.firstName, entry.lastName].filter(Boolean).join(" ") || "—"}
                    </td>

                    {/* City */}
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                      {entry.city || <span className="text-slate-600">—</span>}
                    </td>

                    {/* Street + building */}
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                      {[entry.street, entry.buildingNum].filter(Boolean).join(" ") || <span className="text-slate-600">—</span>}
                    </td>

                    {/* Region */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {entry.region
                        ? <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400 ring-1 ring-slate-700">{entry.region}</span>
                        : <span className="text-slate-600">—</span>}
                    </td>

                    {/* Phone */}
                    <td className="px-4 py-3 tabular-nums text-slate-400 whitespace-nowrap" dir="ltr">
                      {entry.phone || <span className="text-slate-600">—</span>}
                    </td>

                    {/* Cellphone */}
                    <td className="px-4 py-3 tabular-nums text-slate-400 whitespace-nowrap" dir="ltr">
                      {entry.cellphone || <span className="text-slate-600">—</span>}
                    </td>

                    {/* Relation */}
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {entry.relation || <span className="text-slate-600">—</span>}
                    </td>

                    {/* Notes */}
                    <td className="px-4 py-3 max-w-[180px]">
                      <p className="truncate text-slate-500">{entry.notes || "—"}</p>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">

                        {/* Create binder button */}
                        <button
                          type="button"
                          onClick={() => setWizardEntry(entry)}
                          className="
                            flex items-center gap-1.5 rounded-lg
                            bg-cyan-500/10 px-3 py-1.5
                            text-xs font-bold text-cyan-400
                            ring-1 ring-cyan-500/30
                            hover:bg-cyan-500/20 hover:ring-cyan-500/60
                            transition-all whitespace-nowrap
                          "
                          title="צור קלסר מכתובת זו"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round"
                              d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                          </svg>
                          צור קלסר
                        </button>

                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={() => void handleDelete(entry.id)}
                          disabled={deletingId === entry.id}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-40"
                          title="מחק כתובת"
                        >
                          {deletingId === entry.id
                            ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-500/30 border-t-red-500" />
                            : (
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round"
                                  d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            )
                          }
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {addOpen && (
        <AddressModal
          onSave={(d) => void handleAdd(d)}
          onClose={() => setAddOpen(false)}
          saving={addrSaving}
        />
      )}

      {wizardEntry && (
        <CreateBinderWizard
          sourceEntry={wizardEntry}
          allEntries={entries}
          onClose={() => setWizardEntry(null)}
        />
      )}
    </div>
  );
}
