# Purim1

A full-stack monorepo application built with modern web technologies, managed via **pnpm workspaces** and orchestrated with **Turborepo**.

---

## Architecture Overview

This project follows a **monorepo** structure, housing all applications and shared packages under a single repository. This approach enables:

- **Shared code** — common types, utilities, and UI components are written once and consumed everywhere.
- **Atomic changes** — a single commit can span the frontend, backend, and shared libraries.
- **Unified tooling** — one linter config, one formatter, one CI pipeline.
- **Turborepo caching** — build and lint tasks are cached locally (and optionally remotely), so only changed packages are rebuilt.

```
purim1/                          ← monorepo root
├── apps/                        ← deployable frontend applications
│   ├── showcase/                ← @purim/showcase — component gallery (port 5173)
│   ├── dashboard/               ← @purim/dashboard — coordinator/volunteer UI (port 5174)
│   └── ivr-admin/               ← @purim/ivr-admin — IVR administration panel (port 5175)
├── functions/                   ← @purim/functions — Firebase Cloud Functions backend
│   └── src/index.ts
├── packages/                    ← shared internal packages
│   ├── types/                   ← @purim/types — canonical Firestore schema interfaces
│   ├── firebase-config/         ← @purim/firebase-config — client SDK singleton init
│   ├── utils/                   ← @purim/utils — shared utility functions
│   └── ui/                      ← @purim/ui — shared React component library
├── .github/
│   └── workflows/
│       ├── ci.yml               ← lint + typecheck + build on every PR
│       └── deploy.yml           ← production deploy to Firebase on merge to master
├── firebase.json                ← Firebase hosting, functions & emulator config
├── firestore.rules              ← Firestore security rules (deny-all scaffold)
├── firestore.indexes.json       ← Firestore composite index definitions
├── storage.rules                ← Firebase Storage security rules (deny-all scaffold)
├── package.json                 ← root workspace manifest
├── pnpm-workspace.yaml          ← pnpm workspace definition
├── turbo.json                   ← Turborepo pipeline configuration
└── .gitignore
```

### Key Technologies

| Layer | Technology |
|---|---|
| Frontend apps | Vite 5 + React 18 + TypeScript 5 |
| Styling | Tailwind CSS 3 |
| Routing | React Router v6 |
| Backend | Firebase Cloud Functions v2 (Node 20) |
| Database / Auth | Firebase (Firestore, Auth, Storage) |
| SIP / WebRTC | JsSIP 3.x (in-browser SIP dialer) |
| Monorepo tooling | pnpm workspaces + Turborepo |
| Language | TypeScript (everywhere) |
| CI/CD | GitHub Actions → Firebase Hosting + Functions |

---

## Prerequisites

Ensure the following are installed on your machine before proceeding:

| Tool | Version | Install |
|---|---|---|
| **Node.js** | >= 20.x (LTS) | [nodejs.org](https://nodejs.org) |
| **pnpm** | >= 9.x | `npm install -g pnpm` |
| **Git** | any recent | [git-scm.com](https://git-scm.com) |

> **Note:** This project uses `pnpm` exclusively. Do **not** use `npm install` or `yarn` — doing so will generate incorrect lock files and break the workspace links.

---

## Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/kuti277/purim1
cd purim1
```

### 2. Install dependencies

```bash
pnpm install
```

This installs all dependencies for every workspace package in one shot.

### 3. Configure environment variables

Each app requires a `.env.local` file (never committed). Copy the example files:

```bash
cp apps/dashboard/.env.example apps/dashboard/.env.local
cp apps/ivr-admin/.env.example apps/ivr-admin/.env.local
```

Then fill in your Firebase project credentials in each `.env.local`:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

# Set to "true" to connect to local Firebase emulators instead of production
VITE_USE_FIREBASE_EMULATOR=true
```

### 4. Run the development servers

```bash
pnpm dev
```

Turborepo starts all `dev` tasks across `apps/*` in parallel. Each app runs on its own port:

| App | URL |
|---|---|
| `showcase` | http://localhost:5173 |
| `dashboard` | http://localhost:5174 |
| `ivr-admin` | http://localhost:5175 |

---

## Common Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all apps and packages (with caching) |
| `pnpm lint` | Typecheck all packages |
| `pnpm clean` | Remove all build artifacts and `node_modules` |

To run a command scoped to a single app or package:

```bash
pnpm --filter @purim/dashboard dev
pnpm --filter @purim/showcase dev
pnpm --filter @purim/types lint
```

---

## Applications (`apps/`)

All three apps are **Vite 5 + React 18 + TypeScript 5** single-page applications styled with **Tailwind CSS 3**. They share internal packages via `workspace:*` references and run on dedicated ports to avoid conflicts during concurrent development.

---

### `@purim/dashboard`
**Path:** `apps/dashboard` | **Port:** 5174

The main operational interface used by coordinators during the campaign. Fully implemented with Firebase Auth, protected routing, and a Hebrew RTL layout.

#### Route Map

| Route | Page | Description |
|---|---|---|
| `/login` | `LoginPage` | Public — email/password sign-in, redirects if already authenticated |
| `/` | `DashboardHomePage` | Protected — landing page after login |
| `/field` | `FoldersPage` | Field & folders management with in-browser SIP dialer |
| `/transactions` | `TransactionsPage` | Manual donation entry and transaction history |

#### Authentication (`src/contexts/AuthContext.tsx`)

- Firebase Auth via `onAuthStateChanged`
- On sign-in, cross-references the Firebase UID against the `users` Firestore collection to hydrate the full `User` record (including `role`, `workerId`, etc.)
- Auth state exposed via `useAuth()` hook throughout the app
- `ProtectedRoute` component redirects unauthenticated users to `/login`

#### Dashboard Layout (`src/layouts/DashboardLayout.tsx`)

- RTL (`dir="rtl"`) full-page shell
- Fixed top header with brand, user pill (name + role in Hebrew), and sign-out button
- Fixed right sidebar with active-state navigation links
- Main content area with `<Outlet />` for nested routes

#### Field & Folders Management (`/field`)

Real-time view of all folders and boys in the field, with a full in-browser SIP dialer.

**Firestore collections used:** `folders`, `boys`

| Component | Description |
|---|---|
| `SipSettingsCard` | Collapsible card for entering WSS URL, SIP user, and SIP password. Status badge shows disconnected / connected / registered state. |
| `FolderAccordion` | Accordion row per folder — shows folder status, phone number, boy count, and an expandable list of boys with their shiur and field status. |
| `CallOverlay` | Fixed bottom-left overlay, visible during an active call. Shows boy name, phone number, call status, mute toggle, and hang-up button. |
| `SipProvider` / `SipContext` | JsSIP `UA` lifecycle scoped to this page only. Handles outgoing speed-dial calls and auto-answers incoming calls. WebSocket closes automatically when navigating away. |

**SIP details:**
- Library: JsSIP 3.x
- Server: `wss://sip.yemot.co.il/ws` (Yemot HaMashiach)
- Outgoing calls: dial `sip:<folder.phoneNumber>@sip.yemot.co.il`
- Incoming calls: auto-answered, remote audio routed to a hidden `<audio>` element
- Mute/unmute via `session.mute()` / `session.unmute()`

**Folder types (local to `FolderAccordion.tsx`):**

```ts
interface Folder { id: string; status: 'new'|'released'|'finished'; phoneNumber: string; }
interface Boy    { id: string; name: string; shiur: string; status: 'in_field'|'finished'|'not_out'; folderId: string; }
```

#### Transactions & Manual Donations (`/transactions`)

Manual donation entry form with real-time transaction history.

**Firestore collections used:** `transactions`, `boys`, `folders`

**Donation form fields:**

| Field | Details |
|---|---|
| Amount (₪) | Integer NIS amount |
| Payment method | Dropdown: מזומן (cash) / אשראי (credit) |
| Target | Grouped dropdown — active folders and individual boys |
| Dedication | Free-text הקדשה / notes field |
| Credit card fields | Shown when "אשראי" selected: card number, expiry, CVV, ID, cardholder name (simulated — no external API) |

**Folder donation split logic:**

When a folder is selected as the target, the form fetches all boys in that folder with `status === 'in_field'` at submission time and splits the amount equally. The split uses integer (agora-level) arithmetic to avoid floating-point drift — any remainder is assigned to the first boy. The exact per-boy amounts are stored in `splitDetails[]` on the transaction document.

**Transaction document shape:**

```ts
{
  type: 'credit' | 'cash',
  amount: number,           // NIS
  targetId: string,
  targetType: 'folder' | 'boy',
  targetName: string,       // denormalized for display
  dedication: string,
  date: Timestamp,
  status: 'completed' | 'cancelled',
  splitDetails: Array<{ boyId: string; amount: number }>
}
```

All writes (transaction creation + `totalRaised` increments on boys) are executed in a single `writeBatch` for atomicity.

**Cancellation:**

Clicking "ביטול עסקה" sets `status → 'cancelled'` and decrements each boy's `totalRaised` by exactly the amount stored in `splitDetails` — using the stored values rather than recalculating, so reversals are always precise even if boys' statuses changed since the donation.

**Workspace dependencies:** `@purim/types`, `@purim/utils`, `@purim/ui`, `@purim/firebase-config`, `jssip`

---

### `@purim/showcase`
**Path:** `apps/showcase` | **Port:** 5173

The **live campaign broadcast screen** — a full-screen, RTL, real-time TV display shown on a projector or large monitor during the Purim campaign. Connects directly to Firestore (unauthenticated, public read) and updates live as donations arrive.

#### Layout (3-column grid)

| Column | Components |
|---|---|
| Right | `ShiurPanel` — class leaderboard sorted by real transaction totals |
| Centre | `TransactionsPanel` — vertical marquee of the last 10 donations |
| Left | `AnnouncementsPanel` (top) + `InFieldPanel` — live marquee of boys currently in the field (bottom) |

**Header row (full-width, 3 slots):**

| Slot | Component | Description |
|---|---|---|
| Left | `CampaignNameCard` | Logo + campaign name + live indicator |
| Centre | `DailyStarCard` + `LegendCard` | Top daily fundraiser with photo, confetti GIF, bomb GIF on large donations (>50 ₪), progress bar in zone colour |
| Right | `CampaignTotalCard` | Global campaign total vs. goal, thick progress bar |

**Footer:** `Ticker` — horizontal news-ticker marquee with admin message + top-3 boys + recent transactions.

#### Key design features

- **Colour zone system** — every name, bar, and ring is coloured by fundraising percentage:
  - 🔴 Red: 0–25% · 🟡 Yellow: 25–50% · 🟠 Orange: 50–90% · 🟢 Green: ≥90%
- **Single source of truth** — all totals derived from the `transactions` collection via `useAllTransactions()` hook + `useMemo`. The stale `boys.totalRaised` denormalized field is never used for display. `sortedBoys` is re-computed client-side from transaction sums.
- **GIF overlays** — `donation.gif` (5 s, full-screen) + `coins.gif` (5 s, per shiur row) + `bomb.gif` (30 s, over daily star) + `target90.gif` (inline badge, ≥90% goal)
- **Audio** — background music (remote URL from Firestore), slogan jingle (`/assets/slogan.mp3`, ducks BG to 20%), applause on each new donation (`/assets/applause.mp3`)
- **Popup overlay** — `ShowcasePopupOverlay` listens to `settings/showcase_popup` in real time; supports text / image / text-on-image modes with CSS animations and progress bar
- **Admin controls** (from Dashboard → Alerts page): push popup, set display mode/duration, upload images to Firebase Storage gallery, pick random image, toggle infinite mode

**Firestore collections read (all public):** `boys`, `transactions`, `settings/{global,ticker,showcase_popup,showcase_gallery}`, (unauthenticated access)

**Public assets expected at `apps/showcase/public/assets/`:**

| File | Purpose |
|---|---|
| `logo.png` | Campaign name card logo |
| `leizan.png` | Daily star profile picture |
| `slogan.mp3` | Campaign jingle (looped when `playSlogan=true`) |
| `applause.mp3` | Plays on every new incoming donation |
| `donation.gif` | 5 s full-screen overlay on any new transaction |
| `coins.gif` | 5 s overlay over a shiur row on new transaction |
| `bomb.gif` | 30 s overlay on daily star card for donations > 50 ₪ |
| `target90.gif` | Inline 24×24 badge on transaction rows when boy ≥ 90% goal |
| `confetti.gif` | Permanent background on daily star card and leading shiur row |

**Workspace dependencies:** `@purim/firebase-config`

---

### `@purim/ivr-admin`
**Path:** `apps/ivr-admin` | **Port:** 5175

Administration panel for the IVR (Interactive Voice Response) phone system. Used by admins to configure call flows, review call logs, manage recordings, and set routing rules.

**Workspace dependencies:** `@purim/types`, `@purim/utils`, `@purim/ui`, `@purim/firebase-config`

---

## Shared Packages (`packages/`)

All packages live under `packages/` and are consumed via the `@purim/` npm scope using `workspace:*` references — pnpm resolves them locally with zero publish step needed.

---

### `@purim/types`
**Path:** `packages/types`

The single source of truth for every TypeScript interface and string-literal type in the platform. Contains the complete Firestore data model:

| Interface / Type | Description |
|---|---|
| `FirestoreTimestamp` | Framework-agnostic Timestamp shape (seconds + nanoseconds) |
| `CurrencyCode` | ISO 4217 codes: `"ILS" \| "USD" \| "EUR"` |
| `UserRole` | `admin \| coordinator \| volunteer \| recipient` |
| `WorkerRole` | `Exclude<UserRole, "admin">` — roles valid for field workers |
| `DeliveryStatus` | Address delivery lifecycle: `pending → dispatched → delivered / failed / skipped` |
| `DispatchStatus` | Dispatch run lifecycle: `pending → in_progress → completed / cancelled` |
| `TransactionType` | `donation \| expense \| refund \| transfer` |
| `TransactionStatus` | `pending \| completed \| failed \| reversed` |
| `SplitStatus` | `open \| settled \| cancelled` |
| `CallStatus` | `answered \| missed \| voicemail \| busy \| no_answer` |
| `AnnouncementAudience` | Target group for announcements |
| `FeedItemType` | Discriminant tag for all activity feed events |
| **`Address`** | Physical delivery address with geo-coordinates and delivery state |
| **`User`** | Platform user — role, group, `workerId: number`, `ivrPinHash: string` |
| **`Group`** | Volunteer group with coordinator, members list, and binder assignment |
| **`Binder`** | Ordered collection of addresses assigned to a group for one campaign |
| **`Dispatch`** | A volunteer's delivery run covering a subset of binder addresses |
| **`Transaction`** | Financial record in minor currency units (agorot / cents) |
| **`SplitParticipant`** | One participant's share within a Split |
| **`Split`** | Cost-split record dividing a transaction among multiple participants |
| **`Call`** | Logged phone call between two users, optionally linked to an address/dispatch |
| **`CampaignSettings`** | Per-year global campaign configuration (dates, goals, limits) |
| **`Announcement`** | Platform-wide announcement with audience targeting and expiry |
| **`FeedItemPayload`** | Discriminated union of all typed event payloads |
| **`FeedItem`** | Activity feed entry with actor, payload, and campaign context |

**Cloud Function callable interfaces** (also exported from this package):

| Interface | Description |
|---|---|
| `CreateWorkerPayload` / `CreateWorkerResult` | Create a single field worker |
| `UpdateWorkerPayload` | Update worker fields |
| `DeleteWorkerPayload` | Delete a worker by ID |
| `BulkCreateWorkersPayload` / `BulkCreateResult` | Bulk import workers from CSV |
| `CsvWorkerRow` | Shape of a single row in the CSV import format |

No external dependencies — pure TypeScript.

---

### `@purim/firebase-config`
**Path:** `packages/firebase-config`

Initialises the Firebase **client** SDK in one place so every browser app imports a pre-configured singleton rather than duplicating initialisation logic.

**Exports:**

| Export | Type | Description |
|---|---|---|
| `clientApp` | `FirebaseApp` | HMR-safe singleton (guards against double-init in Vite dev) |
| `clientAuth` | `Auth` | Firebase Auth instance |
| `clientDb` | `Firestore` | Firestore instance |
| `clientStorage` | `FirebaseStorage` | Storage instance |

When `VITE_USE_FIREBASE_EMULATOR=true`, all three services connect to the local emulator ports automatically. A `window.__PURIM_EMULATORS_CONNECTED__` flag prevents re-connecting during Vite HMR reloads.

---

### `@purim/utils`
**Path:** `packages/utils`

Pure utility functions shared across apps and functions. Planned exports include currency formatting, Firestore timestamp helpers, date localisation, array grouping, and delivery-progress calculations.

---

### `@purim/ui`
**Path:** `packages/ui`

Shared React component library mapping directly onto the platform's domain (e.g. a `<StatusBadge>` that understands `DeliveryStatus`).

---

## Firebase (`functions/` + root config files)

### `@purim/functions`
**Path:** `functions/`

Firebase Cloud Functions v2 backend, compiled from TypeScript to CommonJS for the Node 20 runtime. The build output lands in `functions/lib/` (gitignored).

| File | Purpose |
|---|---|
| `functions/src/index.ts` | Entry point — exports all functions |
| `functions/src/lib/admin.ts` | Admin SDK singleton — `initializeApp()` guard + exports `db` |
| `functions/src/financial/processTransactions.ts` | Donation processing and cancellation triggers |
| `functions/src/ivr/yemotWebhooks.ts` | Yemot HaMashiach IVR HTTP endpoints |
| `functions/tsconfig.json` | CommonJS + Node 20 target; `outDir: lib` |
| `firebase.json` | Hosting (3 sites), Functions source, Emulator ports |
| `firestore.rules` | Security rules — public read on `boys`, `transactions`, `settings`; authenticated write |
| `firestore.indexes.json` | Composite index definitions |
| `storage.rules` | Firebase Storage security rules |

> **Deployment note:** `@purim/types` is intentionally **not** listed as a dependency of `functions/`. All types needed by Cloud Functions are defined locally inside each source file. This is required because Google Cloud Build receives only the standalone `functions/` directory and cannot resolve `workspace:*` monorepo references.

### Cloud Function Triggers

#### `processPendingTransaction`
**Trigger:** `onDocumentCreated("pending_transactions/{docId}")`

Fires when the client-side donation form writes a document to `pending_transactions`. The function:

1. Reads the pending document (`amount`, `type`, `targetId`, `targetType`, `targetName`, `dedication`, `date`).
2. **Resolves the split:**
   - `targetType === 'folder'` — queries `boys` where `folderId == targetId` and `status == 'in_field'`. If the folder has no active boys the pending document is updated to `status: 'failed'` and the function exits. Otherwise the amount is split evenly using agora-level integer arithmetic (multiply by 100 → divide → remainder to first boy → divide by 100), guaranteeing the sum of all shares equals the original amount exactly.
   - `targetType === 'boy'` — single-entry split: full amount to that one boy.
3. **Commits an atomic `db.batch()`:**
   - `batch.set` — creates the confirmed document in `transactions` with `status: 'completed'` and the full `splitDetails` array.
   - `batch.update` (×N) — increments each affected boy's `totalRaised` by their exact share using `FieldValue.increment`.
   - `batch.delete` — removes the processed `pending_transactions` document.

The confirmed transaction document reuses the pending document's ID, making the entire operation **idempotent** on retry.

#### `processTransactionCancellation`
**Trigger:** `onDocumentUpdated("transactions/{txId}")`

Fires on any update to a `transactions` document. Only acts when `before.status === 'completed'` and `after.status === 'request_cancel'` — the signal set by the client when a coordinator clicks "ביטול עסקה".

1. Reads `splitDetails` from the updated document.
2. **Commits an atomic `db.batch()`:**
   - `batch.update` (×N) — decrements each boy's `totalRaised` by the exact amount stored in `splitDetails` (not recalculated — uses stored values so reversals are always mathematically identical to the original split).
   - `batch.update` — flips `status` to `'cancelled'`.

All financial logic (split math, `totalRaised` updates) runs exclusively in these Cloud Functions. The client writes only intent documents (`pending_transactions`) and status signals (`request_cancel`) — it never performs arithmetic or touches `boys` documents directly.

#### `yemotGeneral`
**Trigger:** `onRequest` (HTTP GET/POST) — `cors: true`

Called by the Yemot HaMashiach PBX to read out the global campaign status over the phone. Reads `settings/global.globalGoal`, sums all non-cancelled transactions, and returns a Yemot `id_list_message` TTS response with goal, raised, remaining, donor count, and percentage.

#### `yemotPersonal` (two-step DTMF flow)
**Trigger:** `onRequest` (HTTP GET/POST) — `cors: true`

**Step A — no `WorkerId` present:** Returns a `read=` command prompting the caller to dial their donor number (max 10 digits, 1 min, 7 s timeout, 14 retries).

```
read=t-WorkerId=tts,שלום מתרים נא להקיש מספר מתרים וסולמית,no,10,1,7,14,none
```

**Step B — `WorkerId` received:** Queries `boys` where `donorNumber == WorkerId`. Returns a personalised TTS message with name, shiur, collected amount, goal, and remaining. Checks `t-WorkerId`, `WorkerId`, and `tts` keys in both query-string and POST body to handle PBX firmware variations.

#### `healthCheck`
**Trigger:** `onRequest` (HTTP GET)

Returns `{ status: "ok", timestamp: "<ISO string>" }`. Used to confirm the Functions runtime is alive after a deploy.

### Firebase Emulator Suite

Run the full Firebase stack locally without touching production:

```bash
# Build functions first
pnpm --filter @purim/functions build

# Then start all emulators
firebase emulators:start
```

| Emulator | Port | URL |
|---|---|---|
| Emulator UI | 4000 | http://localhost:4000 |
| Auth | 9099 | — |
| Firestore | 8080 | — |
| Functions | 5001 | — |
| Hosting | 5000 | http://localhost:5000 |
| Storage | 9199 | — |

Set `VITE_USE_FIREBASE_EMULATOR=true` in your `.env.local` files to point the browser apps at these local ports.

### Firebase Hosting targets

Each app maps to a named hosting target defined in `firebase.json`. All SPAs use a `**` → `/index.html` rewrite so client-side routing works correctly.

| Target | Dist folder | Site |
|---|---|---|
| `showcase` | `apps/showcase/dist` | showcase.kuti-purim.web.app |
| `dashboard` | `apps/dashboard/dist` | dashboard.kuti-purim.web.app |
| `ivr-admin` | `apps/ivr-admin/dist` | ivr-admin.kuti-purim.web.app |

### Live Firebase Project

| Field | Value |
|---|---|
| **Project ID** | `kuti-purim` |
| **Auth domain** | `kuti-purim.firebaseapp.com` |
| **Storage bucket** | `kuti-purim.firebasestorage.app` |
| **Functions region** | `us-central1` (default) |
| **Functions runtime** | Node 20 |

Production credentials are stored in `apps/showcase/.env.local` and `apps/dashboard/.env.local` (not committed). Set `VITE_USE_FIREBASE_EMULATOR=false` to use the live project.

---

## CI/CD (`.github/workflows/`)

### `ci.yml` — runs on every push and pull request to `master`

1. **Lint & Typecheck** — `pnpm lint` across all workspaces via Turborepo.
2. **Build** — `pnpm build`; uploads compiled artifacts for inspection.

### `deploy.yml` — runs on merge to `master` (or manual trigger)

1. **Build** — full production build.
2. **Deploy Hosting** — pushes all three `dist/` folders to Firebase Hosting.
3. **Deploy Functions** — runs `firebase deploy --only functions`.

**Required GitHub Secrets** (set in repo → Settings → Secrets → Actions):

| Secret | Description |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | JSON key of a Firebase service account with deploy rights |
| `FIREBASE_PROJECT_ID` | The Firebase project ID (e.g. `purim1-prod`) |

---

## Firestore Data Model (Summary)

| Collection | Key fields | Notes |
|---|---|---|
| `users` | `uid`, `email`, `displayName`, `role`, `workerId`, `ivrPinHash`, `isActive` | Document ID = Firebase Auth UID. First login auto-creates an `admin` document if none exists. |
| `folders` | `status`, `phoneNumber` | `status`: `new \| released \| finished` |
| `boys` | `name`, `shiur`, `status`, `folderId`, `totalRaised`, `goal`, `donorNumber` | `status`: `in_field \| finished \| not_out`. `totalRaised` is a denormalized field incremented by Cloud Functions — **never used as the display source of truth** (Showcase reads directly from `transactions`). |
| `transactions` | `type`, `amount`, `targetId`, `targetType`, `targetName`, `dedication`, `date`, `status`, `splitDetails[]` | `status`: `completed \| cancelled \| request_cancel`. `splitDetails` stores exact per-boy shares for atomic reversal. |
| `pending_transactions` | `amount`, `type`, `targetId`, `targetType`, `targetName`, `dedication`, `date`, `status` | Written by Dashboard donation form; consumed and deleted by `processPendingTransaction`. Public `create` access. |
| `settings/global` | `campaignName`, `globalGoal`, `announcements[]`, `audioUrl`, `audioVolume`, `audioPlaying`, `playSlogan` | Singleton doc. Public read. |
| `settings/ticker` | `message`, `showTransactions` | Controls the Showcase footer ticker. Public read. |
| `settings/showcase_popup` | `isActive`, `mode`, `text`, `imageUrl`, `duration`, `infinite`, `pushKey`, `updatedAt` | Controls the full-screen overlay on the Showcase. Public read. |
| `settings/showcase_gallery` | `urls[]` | Up to 10 recently uploaded image URLs for the popup gallery. Public read. |
| `system_alerts` | (document per alert) | Authenticated read/write only. |

Monetary amounts are stored in **NIS** in the `transactions` collection. All writes that span multiple documents (e.g. donation + boy `totalRaised` updates) use Firestore `writeBatch` for atomicity.

---

## Deployment Status

| Component | Status | Notes |
|---|---|---|
| Firebase project `kuti-purim` | ✅ Live | Auth, Firestore, Storage, Functions all active |
| Cloud Functions | ✅ Deployed | `processPendingTransaction`, `processTransactionCancellation`, `yemotGeneral`, `yemotPersonal`, `healthCheck` |
| Yemot HaMashiach IVR | ✅ Configured | Two-step DTMF flow for personal status; general campaign status endpoint |
| Firestore security rules | ✅ Deployed | Public read on showcase collections; authenticated write |
| Dashboard frontend | ⏳ Pending | Not yet deployed — needs Vercel (or Firebase Hosting) setup |
| Showcase frontend | ⏳ Pending | Not yet deployed — needs Vercel (or Firebase Hosting) setup |

---

## Pending Work

### Infrastructure

#### Frontend Deployment — Vercel
The frontend apps (`dashboard`, `showcase`) are not yet deployed to a public URL. Recommended approach:

1. Import the monorepo into [vercel.com](https://vercel.com).
2. Configure each app as a separate Vercel project pointing to its `apps/<name>` subdirectory.
3. Set build command: `pnpm --filter @purim/<name> build`
4. Set output directory: `apps/<name>/dist`
5. Add all `VITE_FIREBASE_*` environment variables in the Vercel dashboard.

---

### Backend (Cloud Functions)

#### Nedarim Plus — Incoming Donation Webhook
**Not yet built.** When a donor completes a payment on the Nedarim Plus platform, Nedarim sends an HTTP POST to a webhook URL. This function must:

1. Parse the POST body — extract `Amount`, `Comments` or `TashlumDesc` (for the הקדשה/dedication), and the worker identifier.
2. Verify a shared secret / token to reject spoofed requests.
3. Resolve the target boy from the worker identifier.
4. Write a `pending_transactions` document (or directly to `transactions`) using the same split logic as `processPendingTransaction`.
5. Increment the relevant boys' `totalRaised` atomically.

**Key fields expected from Nedarim Plus POST:**

| Nedarim Field | Maps to |
|---|---|
| `Amount` | `transaction.amount` |
| `Comments` / `TashlumDesc` | `transaction.dedication` (הקדשה) |
| Worker ID field (TBD) | `boys.donorNumber` lookup |

#### Nedarim Plus — Cancellation / Reversal API
**Not yet built.** When a coordinator cancels a Nedarim-originated transaction, the system must:

1. Detect that the transaction originated from Nedarim (e.g. `transaction.source === 'nedarim'`).
2. Iterate over `splitDetails` to know each worker's exact share.
3. For each worker in the split, call the Nedarim Plus API with a **negative amount** equal to their share, referencing the original transaction ID — so each worker's Nedarim record is balanced correctly.
4. Only after all API calls succeed, flip `transaction.status` to `'cancelled'` and decrement `boys.totalRaised`.

---

## Contributing

1. Create a feature branch from `master`.
2. Make your changes.
3. Open a Pull Request with a clear description.

---

## License

Private — All rights reserved.
