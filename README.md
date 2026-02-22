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
├── apps/                        ← deployable applications
│   ├── web/                     ← Next.js frontend (to be created)
│   └── functions/               ← Firebase Cloud Functions backend (to be created)
├── packages/                    ← shared internal packages
│   ├── ui/                      ← shared React component library (to be created)
│   ├── config-typescript/       ← shared tsconfig bases (to be created)
│   └── config-eslint/           ← shared ESLint configs (to be created)
├── package.json                 ← root workspace manifest
├── pnpm-workspace.yaml          ← pnpm workspace definition
├── turbo.json                   ← Turborepo pipeline configuration
└── .gitignore
```

### Key Technologies

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) |
| Backend | Firebase Cloud Functions (Node.js) |
| Database / Auth | Firebase (Firestore, Auth, Storage) |
| Monorepo tooling | pnpm workspaces + Turborepo |
| Language | TypeScript |
| Styling | Tailwind CSS |

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

Each app has its own `.env.local` file (never committed). Copy the example files:

```bash
# (Once app directories exist)
cp apps/web/.env.example apps/web/.env.local
```

### 4. Run the development servers

```bash
pnpm dev
```

Turborepo will start all `dev` tasks across `apps/*` in parallel.

---

## Common Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all apps and packages (with caching) |
| `pnpm lint` | Lint all packages |
| `pnpm clean` | Remove all build artifacts and `node_modules` |
| `pnpm format` | Auto-format all files with Prettier |

To run a command scoped to a single package:

```bash
pnpm --filter web dev
pnpm --filter functions build
```

---

## Contributing

1. Create a feature branch from `main`.
2. Make your changes — they will be linted on commit via Husky (configured later).
3. Open a Pull Request with a clear description.

---

## License

Private — All rights reserved.
