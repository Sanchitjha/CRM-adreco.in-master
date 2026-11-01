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
   This creates one demo login per role (`admin@adreco.in`, `sales@adreco.in`, `design@adreco.in`,
   `accounts@adreco.in`, `installation@adreco.in`, `service@adreco.in`), all sharing one well-known
   demo password (see `prisma/seed.ts`). They are for local development only: seeding with
   `SEED_MODE=production` (or `NODE_ENV=production`) creates a single administrator instead, using a
   password you supply — see [DEPLOYMENT.md](./DEPLOYMENT.md).
5. Run the app:
   ```bash
   npm run dev
   ```
   Visit http://localhost:3000/login.

No Docker? Point `DATABASE_URL` in `.env` at any PostgreSQL 14+ instance instead (local install, or a
free-tier hosted one) and skip `npm run db:up`. The database must use UTF-8: the Windows installer's
default is not, and a database like that cannot save ₹, emoji or Hindi text (the Zoho Chat and WhatsApp
messages fail). Create it with `CREATE DATABASE adreco_crm ENCODING 'UTF8' TEMPLATE template0;`.

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
email digest route), and the customer-lifecycle modules — **Site Surveys**, **Quotations**,
**Sales orders** (convert an accepted quote, dispatch with serial numbers), **Installations**
(job checklist and customer sign-off), **Commissioning** (pass/fail checks that start the warranty),
**Products** and **Serial numbers** (a catalog and a per-machine trail), **Service tickets** (SLA,
technician view, spare parts that deduct stock), **Warranty** (expiry tracking and claims),
**AMC contracts** (scheduled visits and 60/30/7-day renewals), **Dealers** (targets, stock, sourced
leads) and **Settings** (company profile, SLAs and the editable pick-lists).

Who sees what is defined in one place, `MODULE_ACCESS` in `src/lib/rbac.ts`. Sales reps only see
records for leads assigned to them.

Day-to-day tools: a **global search** across customers, quotations, orders, serial numbers, tickets,
products and dealers (it only returns what the signed-in role may open); **lead import and export**
from Excel or CSV, with a check-before-import step and duplicate detection by phone or email (the
importer reads a sales team's own prospect sheet: rows without a serial number become extra contacts
of the prospect above, a role in brackets after a name is kept, two people typed into one cell become two
contacts, and the remarks, next follow-up date
and quote notes become the lead's first follow-up); **people on a project** (owner, site in-charge,
contractor… each with a role, phone and WhatsApp link) alongside project stage, referral and
competitor fields; a **duplicate
warning** when a lead is created twice; and a printable, branded **quotation** (Print / Save as PDF)
with the amount in words.

Accounts and security: failed sign-ins lock an account (and a network address) for 15 minutes;
deactivating a user or changing their role takes effect within about a minute, not when their login
expires; accounts created or reset by an administrator must choose their own password at first
sign-in (users change it themselves under their name menu → Change password); the public Zoho
webhook refuses every call until `ZOHO_WEBHOOK_SECRET` is set.

> The lifecycle modules are in the `lifecycle_modules` migration, which also loads the default
> pick-lists, SLA targets and company profile. Apply it with `npx prisma migrate dev` (local) or
> `npm run db:migrate:deploy` (deployed).

## Deployment (AWS)

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full runbook: a single-server starter setup and a
high-availability one (containers on ECS Fargate behind an Application Load Balancer, RDS PostgreSQL, S3 for
documents), the environment variables, first-deploy steps and a security checklist. The `Dockerfile`
builds the production image (and a one-off `migrator` image for database changes), and
`.github/workflows/ci.yml` runs the checks and a container smoke test on every push. Nothing is
provisioned yet — this repo is ready for it when you are. `deploy/aws/adreco-crm-ha.yaml` is the
CloudFormation template for the high-availability setup, and `.github/workflows/deploy.yml` is the
manual "Deploy to AWS" workflow (build, migrate, roll out).
