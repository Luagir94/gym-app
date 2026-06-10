# Gym App

Multitenant gym management SaaS — monorepo scaffold.

## Architecture

- `apps/frontend` — Next.js App Router + Tailwind CSS
- `apps/backend` — NestJS API
- `packages/shared` — Zod schemas and TypeScript types shared between apps

Package manager: **Bun** (as package manager only; Node is the runtime)

## Prerequisites

- Node >= 20
- Bun >= 1.3
- Docker + Docker Compose

## Setup

### 1. Clone and install

```bash
git clone https://github.com/Luagir94/gym-app.git
cd gym-app
bun install
```

### 2. Configure environment variables

```bash
# macOS / Linux
cp .env.example .env

# Windows (Command Prompt)
copy .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env
```

### 3. Start the database

```bash
docker compose up -d
# Starts PostgreSQL 16 on port 5432
# Creates both gym_dev and gym_test databases
```

### 4. Run database migrations

```bash
cd apps/backend

# Run all pending migrations against gym_dev
npm run db:migrate:dev

# Or apply directly (CI/production)
npm run db:migrate:deploy
```

This applies the initial migration that creates all domain tables plus Better Auth tables
(users, sessions, accounts, verifications, jwks) and the pre_registrations table.

### 5. Start development servers

```bash
# Frontend (http://localhost:3000)
cd apps/frontend
npm run dev

# Backend (http://localhost:3001)
cd apps/backend
npm run start:dev
```

## Running Tests

```bash
# Run all workspace tests
bun run test

# Run tests for individual workspaces
cd packages/shared && npm test
cd apps/frontend && npm test
cd apps/backend && npm test

# Backend unit tests only
cd apps/backend && npm run test:unit

# Backend e2e / integration tests (requires docker compose up -d + migrations applied to gym_test)
# Set TEST_DATABASE_URL in .env to point to gym_test before running
cd apps/backend && npm run test:e2e
```

### Integration test status (PR3)

- Cross-tenant isolation tests (`test/tenant-isolation.e2e-spec.ts`) and members e2e tests
  (`test/members.e2e-spec.ts`) require a running PostgreSQL instance with migrations applied.
- Docker is required. Without Docker, these tests skip gracefully with a `[PENDING]` log message.
- To run them locally: `docker compose up -d && npm run db:migrate:dev` then set
  `TEST_DATABASE_URL=postgresql://gym:gym_password@localhost:5432/gym_test` in `.env`.

## Project Structure

```
gym-app/
├── package.json               # Bun workspaces root
├── docker-compose.yml         # PostgreSQL service
├── .env.example               # Environment variable template
├── apps/
│   ├── frontend/              # Next.js App Router
│   └── backend/               # NestJS API
└── packages/
    └── shared/                # Zod schemas + TypeScript types
```
