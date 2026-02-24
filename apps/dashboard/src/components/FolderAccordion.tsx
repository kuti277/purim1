import { useSip } from "../hooks/useSip";

// ─── Local domain types ───────────────────────────────────────────────────────

export interface Folder {
  id: string;
  status: "new" | "released" | "finished";
  phoneNumber: string;
}

export interface Boy {
  id: string;
  name: string;
  shiur: string;
  status: "in_field" | "finished" | "not_out";
  folderId: string;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FolderStatusIcon({ status }: { status: Folder["status"] }) {
  if (status === "finished") {
    return <span title="הסתיים" aria-label="הסתיים">✅</span>;
  }
  if (status === "released") {
    return (
      <span className="relative flex h-3 w-3" title="בשטח" aria-label="בשטח">
        <span className="h-3 w-3 rounded-full bg-yellow-400 block" />
      </span>
    );
  }
  // new
  return <span title="חדש" aria-label="חדש">📁</span>;
}

function BoyStatusBadge({ status }: { status: Boy["status"] }) {
  if (status === "in_field") {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
        בשטח
      </span>
    );
  }
  if (status === "finished") {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
        סיים
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 ring-1 ring-inset ring-gray-500/10">
      לא יצא
    </span>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface FolderAccordionProps {
  folder: Folder;
  boys: Boy[];
  isExpanded: boolean;
  onToggle: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FolderAccordion({ folder, boys, isExpanded, onToggle }: FolderAccordionProps) {
  const sipCtx = useSip();

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header row */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-right hover:bg-gray-50 transition-colors"
      >
        {/* Status icon */}
        <span className="flex items-center justify-center w-6 shrink-0">
          <FolderStatusIcon status={folder.status} />
        </span>

        {/* Folder ID */}
        <span className="flex-1 text-sm font-semibold text-gray-800">
          קלסר {folder.id}
        </span>

        {/* Phone number */}
        <span
          dir="ltr"
          className="text-sm text-gray-500 font-mono tabular-nums"
        >
          {folder.phoneNumber}
        </span>

        {/* Boy count pill */}
        <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-700/10">
          {boys.length} ילדים
        </span>

        {/* Chevron */}
        <svg
          className={`h-4 w-4 text-gray-400 shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded: boy list */}
      {isExpanded && (
        <div className="border-t border-gray-100">
          {boys.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-400 text-center">אין ילדים בקלסר זה</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {boys.map((boy) => (
                <li
                  key={boy.id}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  {/* Name */}
                  <span className="flex-1 text-sm font-medium text-gray-800">
                    {boy.name}
                  </span>

                  {/* Shiur */}
                  <span className="text-xs text-gray-500">{boy.shiur}</span>

                  {/* Status badge */}
                  <BoyStatusBadge status={boy.status} />

                  {/* Speed dial */}
                  <button
                    type="button"
                    onClick={() => sipCtx.call(folder.phoneNumber, boy.name)}
                    disabled={!sipCtx.isRegistered}
                    title={sipCtx.isRegistered ? `חייג ל-${boy.name}` : "יש להתחבר ל-SIP תחילה"}
                    className="
                      inline-flex items-center gap-1.5 rounded-lg
                      bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white
                      shadow-sm transition-colors hover:bg-indigo-500
                      disabled:cursor-not-allowed disabled:opacity-40
                      focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1
                    "
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
                      />
                    </svg>
                    חייג
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
