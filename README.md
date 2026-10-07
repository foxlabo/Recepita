# Recepita

[![CI](https://github.com/foxlabo/Recepita/actions/workflows/ci.yml/badge.svg)](https://github.com/foxlabo/Recepita/actions/workflows/ci.yml)

Recepita is a portfolio project for solo business owners and freelancers to manage expenses and sales in one place. It combines manual entry, receipt OCR, dashboard analytics, CSV export, and account/profile management in a Next.js application.

## Features

- Expense registration: manual entry, or bulk import from receipt images/PDFs (OCR) and CSV into drafts, then confirm
- Expense list with inline editing of amounts and line items, filtering and CSV export
- Sales registration
- Dashboard with monthly totals, month-over-month change, a 12-month trend and a category breakdown (all in JST)
- Receipt OCR with Azure Document Intelligence, with optional AI category suggestion (OpenAI)
- Sign-up with e-mail verification, e-mail / password change, sign-out of all devices, account deletion
- Light / dark theme

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Prisma 7 (`@prisma/adapter-pg`)
- PostgreSQL
- Azure Document Intelligence
- Azure Communication Services
- OpenAI API
- Biome, Vitest, Playwright + axe-core (quality checks and tests)

## Local Setup

### 1. Requirements

- Node.js 22.x
- npm
- PostgreSQL

### 2. Install dependencies

```bash
npm install
```

### 3. Create environment file

Copy `.env.example` to `.env` and fill in the values you need.

```bash
copy .env.example .env
```

At minimum, set:

- `DATABASE_URL`
- `JWT_SECRET`
- `APP_URL`

### 4. Apply Prisma migrations

```bash
npx prisma generate
npx prisma migrate deploy
```

If you prefer a local development flow, you can also use:

```bash
npx prisma migrate dev
```

### 5. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Checks and Tests

| Command | What it runs |
| --- | --- |
| `npm run lint` | Biome: formatting check + lint (`npm run format` rewrites the formatting) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (Vitest), no database needed |
| `npm run test:integration` | Integration tests (Vitest) against PostgreSQL |
| `npm run build && npm run test:e2e` | E2E tests (Playwright, Chromium) against `next start -p 4450`, incl. axe accessibility checks |

Integration and E2E tests use `TEST_DATABASE_URL` (falling back to `DATABASE_URL`). The database name must contain `test`, e.g. `postgresql://user:pass@localhost:5432/recepita_test`; migrations are applied automatically and the tests only delete data they created. Before the first E2E run, install the browser with `npx playwright install chromium`.

GitHub Actions (`.github/workflows/ci.yml`) runs all of the above on pushes and pull requests to `main`.

## Environment Variables

### Required

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: session JWT signing secret (HS256, use 32+ random characters)
- `APP_URL`: public base URL used to build links in e-mails (must be set in production)
- `AZURE_COMMUNICATION_CONNECTION_STRING`, `AZURE_COMMUNICATION_SENDER`: e-mail delivery (required in production)

### Optional

- `OCR_PROVIDER=azure`, `AZURE_DOCUMENT_INTELLIGENCE_*`: OCR integration
- `OPENAI_API_KEY`, `OPENAI_OCR_CATEGORY_MODEL`: AI category suggestion
- `SHOW_DEV_VERIFICATION_LINK=1`: development only; also return the verification link in API responses

## Local Demo Notes

Without Azure Communication Services mail settings, development builds (`npm run dev`) print verification and e-mail-change messages, including their links, to the server console instead of sending them, so sign-up can be completed locally. Set `SHOW_DEV_VERIFICATION_LINK=1` to also show the link on the sign-up screen. Production builds require ACS.

Without Azure OCR settings, the app still runs, but the OCR endpoint returns a configuration error until:

- `OCR_PROVIDER=azure`
- `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`
- `AZURE_DOCUMENT_INTELLIGENCE_KEY`

Without an OpenAI API key, OCR still works, but AI-based category suggestion is skipped.

## Architecture

```
app/            Next.js App Router pages and API route handlers
  (app)/        signed-in screens (dashboard, expenses, receipts, invoices, settings)
  api/          JSON APIs, all wrapped with withAuth() unless public
lib/            shared server/client modules
  auth-server.ts, session-token.ts   sessions (jose JWT + revocation)
  http.ts       error -> HTTP status mapping (400 / 401 / 404 / 409 / 429)
  rate-limit.ts DB-backed fixed-window rate limiter
  dates.ts      JST date helpers (the app's date convention is documented here)
  items.ts      expense line-item parsing
  ocr/          Azure Document Intelligence client and result normalization
  mail.ts       e-mail via Azure Communication Services
proxy.ts        session check, 401 for APIs / redirect for pages, CSRF origin check
prisma/         schema and migrations
tests/          unit/, integration/ (PostgreSQL), e2e/ (Playwright + axe)
```

## Security

- **Sessions**: HS256 JWTs (`jose`) in an HttpOnly, SameSite=Lax cookie. Each token carries the user's `sessionVersion`; changing the password or e-mail, deleting the account or "sign out of all devices" increments it, which revokes every existing session.
- **Authorization**: every API handler resolves the user from the session and scopes all queries to that user.
- **Verification tokens**: random 256-bit tokens, stored only as SHA-256 hashes, typed per purpose, single-use and expiring.
- **Abuse protection**: rate limits on login, sign-up, e-mail resend, account changes and OCR; uniform responses so e-mail addresses can't be enumerated; constant-time-ish login for unknown users.
- **Uploads**: OCR accepts images/PDF up to 10 MB; provider errors are never passed to the client.
- **Web**: Origin check for state-changing API requests, open-redirect-safe `?next=`, security headers (nosniff, frame denial, referrer and permissions policy, HSTS in production), CSV formula-injection escaping.

## Deployment

A container setup for Azure (standalone Next.js output, non-root user, separate migration step) is in [`recepita_azure_container_deploy/`](recepita_azure_container_deploy/README_DEPLOY.md).

## License

Source code is published as a portfolio sample. No real credentials are included; never commit `.env` files.
