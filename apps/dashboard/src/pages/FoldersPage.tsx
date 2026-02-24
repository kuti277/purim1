import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { clientDb } from "../lib/firebase";
import { SipProvider } from "../contexts/SipContext";
import { SipSettingsCard } from "../components/SipSettingsCard";
import { FolderAccordion, type Folder, type Boy } from "../components/FolderAccordion";
import { CallOverlay } from "../components/CallOverlay";

// ─── Inner page content (must be inside SipProvider) ─────────────────────────

function FoldersPageContent() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [boys, setBoys] = useState<Boy[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [loadingBoys, setLoadingBoys] = useState(true);
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);

  // ── Firestore: folders ──────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      collection(clientDb, "folders"),
      (snap) => {
        setFolders(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Folder, "id">) }))
        );
        setLoadingFolders(false);
      },
      (err) => {
        console.error("[FoldersPage] folders snapshot error:", err);
        setLoadingFolders(false);
      }
    );
    return unsub;
  }, []);

  // ── Firestore: boys ─────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      collection(clientDb, "boys"),
      (snap) => {
        setBoys(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Boy, "id">) }))
        );
        setLoadingBoys(false);
      },
      (err) => {
        console.error("[FoldersPage] boys snapshot error:", err);
        setLoadingBoys(false);
      }
    );
    return unsub;
  }, []);

  // ── Group boys by folderId ──────────────────────────────────────────────────
  const boysByFolder = new Map<string, Boy[]>();
  for (const boy of boys) {
    const list = boysByFolder.get(boy.folderId) ?? [];
    list.push(boy);
    boysByFolder.set(boy.folderId, list);
  }

  const isLoading = loadingFolders || loadingBoys;

  // ── Toggle accordion — single-open pattern ─────────────────────────────────
  function handleToggle(folderId: string) {
    setExpandedFolderId((prev) => (prev === folderId ? null : folderId));
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ניהול שטח וקלסרים</h1>
        <p className="mt-1 text-sm text-gray-500">
          מעקב אחר סטטוס קלסרים בשטח וחיוג ישיר דרך הדפדפן
        </p>
      </div>

      {/* SIP settings */}
      <SipSettingsCard />

      {/* Folder list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        </div>
      ) : folders.length === 0 ? (
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
              d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
            />
          </svg>
          <p className="mt-3 text-sm font-medium text-gray-500">אין קלסרים עדיין</p>
          <p className="mt-1 text-xs text-gray-400">
            קלסרים שיתווספו ל-Firestore יופיעו כאן בזמן אמת
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {folders.map((folder) => (
            <FolderAccordion
              key={folder.id}
              folder={folder}
              boys={boysByFolder.get(folder.id) ?? []}
              isExpanded={expandedFolderId === folder.id}
              onToggle={() => handleToggle(folder.id)}
            />
          ))}
        </div>
      )}

      {/* Active call overlay — self-hides when idle */}
      <CallOverlay />
    </div>
  );
}

// ─── Exported page — wraps content in SipProvider ────────────────────────────

export function FoldersPage() {
  return (
    <SipProvider>
      <FoldersPageContent />
    </SipProvider>
  );
}
