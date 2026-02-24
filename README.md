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

An interactive component gallery for the `@purim/ui` design system. Used during development to render and test UI primitives in isolation. Has no Firebase dependency.

**Workspace dependencies:** `@purim/types`, `@purim/utils`, `@purim/ui`

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
| `functions/src/index.ts` | Entry point — exports all callable/HTTP functions |
| `functions/tsconfig.json` | CommonJS + Node 20 target; `outDir: lib` |
| `firebase.json` | Hosting (3 sites), Functions source, Emulator ports |
| `firestore.rules` | Security rules — **deny-all** scaffold |
| `firestore.indexes.json` | Composite index definitions (empty scaffold) |
| `storage.rules` | Storage security rules — **deny-all** scaffold |

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
| `showcase` | `apps/showcase/dist` | showcase.\<project\>.web.app |
| `dashboard` | `apps/dashboard/dist` | dashboard.\<project\>.web.app |
| `ivr-admin` | `apps/ivr-admin/dist` | ivr-admin.\<project\>.web.app |

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
| `users` | `uid`, `role`, `displayName`, `workerId`, `ivrPinHash` | Mirrors Firebase Auth UID as document ID |
| `folders` | `status`, `phoneNumber` | `status`: `new \| released \| finished` |
| `boys` | `name`, `shiur`, `status`, `folderId`, `totalRaised` | `status`: `in_field \| finished \| not_out` |
| `transactions` | `type`, `amount`, `targetId`, `targetType`, `targetName`, `dedication`, `date`, `status`, `splitDetails[]` | `status`: `completed \| cancelled` |

Monetary amounts are stored in **NIS** in the `transactions` collection. All writes that span multiple documents (e.g. donation + boy `totalRaised` updates) use Firestore `writeBatch` for atomicity.

---

## Contributing

1. Create a feature branch from `master`.
2. Make your changes.
3. Open a Pull Request with a clear description.

---

## License

Private — All rights reserved.
