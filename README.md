# Recepita

Recepita is a portfolio project for solo business owners and freelancers to manage expenses and sales in one place. It combines manual entry, receipt OCR, dashboard analytics, CSV export, and account/profile management in a Next.js application.

## Features

- Expense registration and receipt list management
- Sales and invoice registration
- Dashboard with monthly summary, trends, and category breakdown
- Receipt and invoice OCR with Azure Document Intelligence
- Optional AI-based expense category suggestion with OpenAI
- Email verification and account settings
- CSV export of expenses

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

## Suggested Portfolio Talking Points

- Full-stack CRUD application with authenticated user flows
- External API integration for OCR and email delivery
- Data modeling and migrations with Prisma
- Dashboard design for operational visibility
- Practical UX for freelancers managing receipts and invoices

## Security Note

This public version excludes private environment files, generated assets, archives, and credential files. If you previously used real API keys or service-account credentials in local files, rotate them before publishing.
