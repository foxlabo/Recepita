# Recepita

Recepita is a portfolio project for solo business owners and freelancers to manage expenses and sales in one place. It combines manual entry, receipt OCR, dashboard analytics, CSV export, and account/profile management in a Next.js application.

## Features

- Expense registration and receipt list management
- Sales and invoice registration
- Dashboard with monthly summary, trends, and category breakdown
- Receipt and invoice OCR with Azure Document Intelligence
- Optional AI-based expense category suggestion with OpenAI
- Email verification and account settings
- CSV export for expenses and invoices

## Tech Stack

- Next.js 14 (App Router)
- React 18
- TypeScript
- Prisma
- PostgreSQL
- Azure Document Intelligence
- Azure Communication Services
- OpenAI API

## Local Setup

### 1. Requirements

- Node.js 20.x
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
- `NEXTAUTH_URL`
- `NEXT_PUBLIC_APP_URL`
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

## Environment Variables

### Required for minimum local run

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: session signing secret
- `NEXTAUTH_URL`: base URL used in email links
- `NEXT_PUBLIC_APP_URL`: public app URL
- `APP_URL`: server-side base URL fallback

### Optional

- `STORAGE_LOCAL_DIR`, `UPLOAD_DIR`, `FILE_STORAGE_DIR`: local file storage paths
- `OCR_PROVIDER`, `AZURE_DOCUMENT_INTELLIGENCE_*`: OCR integration
- `OPENAI_API_KEY`, `OPENAI_OCR_CATEGORY_MODEL`: AI category suggestion
- `AZURE_COMMUNICATION_*`: email verification delivery
- `SMTP_*`: alternate mail transport settings used by part of the codebase

## Local Demo Notes

Without Azure Communication Services mail settings, sign-up will fail because verification mail delivery is required. For local evaluation, create a user manually or mark a local user as verified before logging in.

One simple option is Prisma Studio:

```bash
npx prisma studio
```

Then update the `User.isEmailVerified` field to `true` for your test account.

Without Azure OCR settings, the app still runs, but OCR upload endpoints will return a configuration error until:

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
