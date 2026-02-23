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
│   ├── firebase-config/         ← @purim/firebase-config — client + admin SDK init
│   ├── utils/                   ← @purim/utils — shared utility functions
│   └── ui/                      ← @purim/ui — shared React component library
├── .github/
│   └── workflows/
│       ├── ci.yml               ← lint + typecheck + build on every PR
│       └── deploy.yml           ← production deploy to Firebase on merge to main
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
| Frontend apps | Vite + React 18 + TypeScript |
| Backend | Firebase Cloud Functions v2 (Node 20) |
| Database / Auth | Firebase (Firestore, Auth, Storage) |
| Monorepo tooling | pnpm workspaces + Turborepo |
| Language | TypeScript |
| Styling | Tailwind CSS (to be added) |
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
git clone <repository-url>
cd purim1
```

### 2. Install dependencies

```bash
pnpm install
```

This installs all dependencies for every workspace package in one shot.

### 3. Configure environment variables

Each app has its own `.env.local` file (never committed). Copy the example files once they
are created:

```bash
cp apps/dashboard/.env.example apps/dashboard/.env.local
cp apps/ivr-admin/.env.example apps/ivr-admin/.env.local
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
| `pnpm lint` | Lint all packages |
| `pnpm clean` | Remove all build artifacts and `node_modules` |
| `pnpm format` | Auto-format all files with Prettier |

To run a command scoped to a single app or package:

```bash
pnpm --filter showcase dev
pnpm --filter dashboard dev
pnpm --filter ivr-admin dev
pnpm --filter @purim/types lint
```

---

## Applications (`apps/`)

All three apps are **Vite + React 18 + TypeScript** single-page applications. They share
internal packages via `workspace:*` references and run on dedicated ports to avoid
conflicts during concurrent development.

### `@purim/showcase`
**Path:** `apps/showcase` | **Port:** 5173

An interactive component gallery for the `@purim/ui` design system. Used during
development to render and test UI primitives in isolation — similar to Storybook but
lighter weight. Has no Firebase dependency.

**Workspace dependencies:** `@purim/types`, `@purim/utils`, `@purim/ui`

---

### `@purim/dashboard`
**Path:** `apps/dashboard` | **Port:** 5174

The main operational interface used by coordinators and volunteers during the campaign.
Features will include: binder management, dispatch tracking, volunteer assignment,
delivery progress maps, and the activity feed.

**Workspace dependencies:** `@purim/types`, `@purim/utils`, `@purim/ui`, `@purim/firebase-config`

---

### `@purim/ivr-admin`
**Path:** `apps/ivr-admin` | **Port:** 5175

Administration panel for the IVR (Interactive Voice Response) phone system. Used by
admins to configure call flows, review call logs, manage recordings, and set routing rules.

**Workspace dependencies:** `@purim/types`, `@purim/utils`, `@purim/ui`, `@purim/firebase-config`

---

## Shared Packages (`packages/`)

All packages live under `packages/` and are consumed via the `@purim/` npm scope using
`workspace:*` references — pnpm resolves them locally with zero publish step needed.

### `@purim/types`
**Path:** `packages/types`

The single source of truth for every TypeScript interface and string-literal type in the
platform. Contains the complete Firestore data model:

| Interface / Type | Description |
|---|---|
| `FirestoreTimestamp` | Framework-agnostic Timestamp shape (seconds + nanoseconds) |
| `CurrencyCode` | ISO 4217 codes: `"ILS" \| "USD" \| "EUR"` |
| `UserRole` | `admin \| coordinator \| volunteer \| recipient` |
| `DeliveryStatus` | Address delivery lifecycle: `pending → dispatched → delivered / failed / skipped` |
| `DispatchStatus` | Dispatch run lifecycle: `pending → in_progress → completed / cancelled` |
| `TransactionType` | `donation \| expense \| refund \| transfer` |
| `TransactionStatus` | `pending \| completed \| failed \| reversed` |
| `SplitStatus` | `open \| settled \| cancelled` |
| `CallStatus` | `answered \| missed \| voicemail \| busy \| no_answer` |
| `AnnouncementAudience` | Target group for announcements |
| `FeedItemType` | Discriminant tag for all activity feed events |
| **`Address`** | Physical delivery address with geo-coordinates and delivery state |
| **`User`** | Platform user with role, group membership, and per-campaign history |
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

No external dependencies — pure TypeScript.

---

### `@purim/firebase-config`
**Path:** `packages/firebase-config`

Initialises the Firebase client and admin SDKs in one place so every app
(`web`, `functions`) imports a pre-configured instance rather than duplicating
initialisation logic. Will export `db`, `auth`, and `storage` helpers for both
browser and server environments.

---

### `@purim/utils`
**Path:** `packages/utils`

Pure utility functions shared across `web` and `functions`. Planned exports include
currency formatting, Firestore timestamp helpers, date localisation, array grouping,
and delivery-progress calculations.

---

### `@purim/ui`
**Path:** `packages/ui`

A headless-friendly React component library that maps directly onto the platform's
domain (e.g. a `<StatusBadge>` that understands `DeliveryStatus`). Consumed only
by `apps/web`.

---

## Firebase (`functions/` + root config files)

### `@purim/functions`
**Path:** `functions/`

Firebase Cloud Functions v2 backend, compiled from TypeScript to CommonJS for the
Node 20 runtime. The build output lands in `functions/lib/` (gitignored).

| File | Purpose |
|---|---|
| `functions/src/index.ts` | Entry point — exports all callable/HTTP functions |
| `functions/tsconfig.json` | CommonJS + Node 20 target; `outDir: lib` |
| `firebase.json` | Hosting (3 sites), Functions source, Emulator ports |
| `firestore.rules` | Security rules — **deny-all** until Phase 2 auth layer |
| `firestore.indexes.json` | Composite index definitions (empty scaffold) |
| `storage.rules` | Storage security rules — **deny-all** until Phase 2 |

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

### Firebase Hosting targets

Each app maps to a named hosting target defined in `firebase.json`. When deployed,
all SPAs use a `**` → `/index.html` rewrite so client-side routing works correctly.

| Target | Dist folder | Site |
|---|---|---|
| `showcase` | `apps/showcase/dist` | showcase.\<project\>.web.app |
| `dashboard` | `apps/dashboard/dist` | dashboard.\<project\>.web.app |
| `ivr-admin` | `apps/ivr-admin/dist` | ivr-admin.\<project\>.web.app |

---

## CI/CD (`.github/workflows/`)

### `ci.yml` — runs on every push and pull request to `main` / `develop`

1. **Lint & Typecheck** — `pnpm lint` across all workspaces via Turborepo.
2. **Build** — `pnpm build`; uploads compiled artifacts for inspection.

### `deploy.yml` — runs on merge to `main` (or manual trigger)

1. **Build** — full production build.
2. **Deploy Hosting** — pushes all three `dist/` folders to Firebase Hosting
   (activate by adding `FIREBASE_SERVICE_ACCOUNT` + `FIREBASE_PROJECT_ID` secrets).
3. **Deploy Functions** — runs `firebase deploy --only functions`
   (same secrets required).

**Required GitHub Secrets** (set in repo → Settings → Secrets → Actions):

| Secret | Description |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | JSON key of a Firebase service account with deploy rights |
| `FIREBASE_PROJECT_ID` | The Firebase project ID (e.g. `purim1-prod`) |

---

## Contributing

1. Create a feature branch from `main`.
2. Make your changes — they will be linted on commit via Husky (configured later).
3. Open a Pull Request with a clear description.

---

## License

Private — All rights reserved.
