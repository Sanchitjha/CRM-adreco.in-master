# Adreco CRM

Internal sales CRM for Adreco Engineering Pvt Ltd — leads, follow-ups, the Sales → Design/Engineering →
Accounts → Installation → Service handoff pipeline, per-lead documents, tasks, and admin reporting.

Stack: Next.js (App Router, TypeScript) · PostgreSQL + Prisma · Auth.js (Credentials) · AWS S3 for
documents · Tailwind CSS.

## Local setup

You need a PostgreSQL instance to run this. Easiest path is Docker:

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) if you don't have it.
2. Copy the env file and fill in secrets as needed:
   ```bash
   cp .env.example .env
   ```
   A working `AUTH_SECRET` and `DATABASE_URL` are enough to run this locally — AWS/SMTP values aren't
   needed until later phases (documents, email digest).
3. Start Postgres:
   ```bash
   npm run db:up
   ```
4. Apply the schema and seed demo users:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
   This creates one login per role (`admin@adreco.in`, `sales@adreco.in`, `design@adreco.in`,
   `accounts@adreco.in`, `installation@adreco.in`, `service@adreco.in`), all with password
   `ChangeMe123!`. Change these before any real use.
5. Run the app:
   ```bash
   npm run dev
   ```
   Visit http://localhost:3000/login.

No Docker? Point `DATABASE_URL` in `.env` at any PostgreSQL 14+ instance instead (local install, or a
free-tier hosted one) and skip `npm run db:up`.

## Other useful commands

- `npm run db:studio` — Prisma Studio, a GUI to browse/edit the database.
- `npm run build` — production build.
- `npm run lint` — ESLint.
- `npm test` — unit tests (Vitest) for RBAC and validation logic that don't need a database. Full
  end-to-end tests (login, lead conversion → department handoff, RBAC boundaries against real data)
  are the next step once a database is available to run them against.

## Follow-up & task email digest

`POST /api/cron/digest` checks every active user for overdue/due-today follow-ups (sales reps) and
tasks (everyone), and emails a summary via SMTP. It's a plain route, not an in-process scheduler, so
it survives app restarts/deploys — trigger it once a day with an OS-level cron job on the server:

```bash
curl -X POST https://crm.adreco.in/api/cron/digest -H "x-cron-secret: $CRON_SECRET"
```

Requires `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD` and `CRON_SECRET` set in `.env`. If SMTP isn't
configured, the route just skips sending for each user rather than failing.

## Where things stand

See `prisma/schema.prisma` for the full data model and the project's build plan for the phase
breakdown. Built so far: Phase 1 (Foundation), Phase 2 (Sales core — leads, follow-ups, dashboard),
Phase 3 (Department workflow — conversion handoff, department queues, lead timeline), Phase 4
(Documents — S3 upload/download, per-stage required-document checklist), Phase 5 (Admin panel — user
management, task assignment, reporting), and Phase 6 (Notifications — due/overdue dashboard widgets,
email digest route), and the first lifecycle modules — **Site Surveys** (capture a lead's technical
requirement on-site) and **Quotations** (line-item proposals with discount, GST and charges, tied to
a lead and optionally a survey). Remaining: the rest of the roadmap modules (Sales Orders,
Installations, Serial Numbers, Warranty, AMC, Dealers) and Phase 7 (production readiness — Dockerfile,
tests, AWS deployment guide).

> The Site Surveys and Quotations modules add `SiteSurvey`, `Quotation` and `QuotationItem` models to
> `schema.prisma`. Apply them to your database with `npx prisma migrate dev` (local) or
> `npm run db:migrate:deploy` once a migration exists.

## Deployment (AWS)

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full architecture and setup steps: 2+ EC2 instances
behind an Application Load Balancer, RDS PostgreSQL, S3 for documents, health-check-based
auto-restart. The `Dockerfile` at the repo root builds a production-ready standalone image. Not yet
provisioned — this repo is ready for it when you are.
