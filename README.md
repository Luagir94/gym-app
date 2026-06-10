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
cp .env.example .env
# Edit .env and fill in your values:
# - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (from Google Cloud Console)
# - BETTER_AUTH_SECRET (random string, >= 32 chars)
```

### 3. Start the database

```bash
docker compose up -d
# Starts PostgreSQL 16 on port 5432
# Creates both gym_dev and gym_test databases
```

### 4. Run database migrations (Phase 3)

```bash
cd apps/backend
npx prisma migrate dev
```

### 5. Seed demo data (Phase 3)

```bash
cd apps/backend
npm run seed
```

### 6. Start development servers

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

# Backend e2e tests (requires Docker Compose running)
cd apps/backend && npm run test:e2e
```

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
