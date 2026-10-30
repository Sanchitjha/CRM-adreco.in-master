# Deploying Adreco CRM on AWS

Nothing is provisioned yet. This is the runbook for when you are ready. Everything below was checked against the
code in this repository; the parts that could **not** be run on the development machine (no Docker, no AWS
account) are listed in [What has and hasn't been verified](#what-has-and-hasnt-been-verified).

## 1. Choose a shape

Both shapes run the **same Docker image**, so you can start small and move up without changing the app.

| | **A. Starter: one server** | **B. High availability** |
|---|---|---|
| App | 1 EC2 instance (`t4g.small`) running the container, with Caddy for automatic HTTPS | 2+ EC2 instances in an Auto Scaling Group behind an Application Load Balancer, across 2 Availability Zones |
| Database | RDS PostgreSQL 16, `db.t4g.micro`, single-AZ | Same; switch on **Multi-AZ** to survive a database outage (about doubles the database cost) |
| Survives | Nothing: if the instance dies the CRM is down until it is replaced (RDS data is safe) | An instance crash, a bad deploy to one instance, an Availability Zone outage |
| Rough cost* | about US$30–40 / month | about US$70–100 / month (more with Multi-AZ) |
| Use it for | A pilot, a demo, or a first small client | A client who needs "never down" |

\*Estimates for the Mumbai region (`ap-south-1`) from published on-demand prices; confirm in the AWS pricing
calculator before committing.

```
              Route 53 (crm.adreco.in)
                        |
        A: Caddy on the server      B: Application Load Balancer (2 AZs, ACM certificate)
                        |                          /                      \
                  Docker: app            EC2 instance A            EC2 instance B
                        \                          \                      /
                         +------------------->  RDS PostgreSQL  <---------+
                                                      |
                                          S3 (documents, private)
```

## 2. What you need before starting

- An AWS account with billing enabled, and a budget alert (AWS Budgets) so a mistake can't run up a bill.
- The domain (`adreco.in`) and the ability to add DNS records, ideally in Route 53.
- A verified sender in **Amazon SES** for the follow-up digest emails. New SES accounts start in a *sandbox* that
  can only email verified addresses; request production access before relying on the digest.
- Optional, only for the features that use them: a Google Gemini API key (AI advice), WhatsApp Cloud API
  credentials, Zoho credentials. The CRM works without any of them; click-to-chat WhatsApp needs no keys.

## 3. One-time setup

1. **Network.** The default VPC is fine to start. Put RDS in subnets without a public route.
   Security groups: load balancer (or the server) accepts 80/443 from anywhere; the app accepts 3000 from the
   load balancer only (shape B); **RDS accepts 5432 from the app's security group only**.
2. **RDS.** PostgreSQL 16, `db.t4g.micro`, 20 GB, automated backups kept 7–14 days, deletion protection on,
   storage encryption on. Build the connection string as
   `postgresql://USER:PASSWORD@HOST:5432/adreco_crm?sslmode=require&connection_limit=5`
   (`connection_limit` keeps several app instances inside a small database's connection limit).
   If the app reports a certificate error connecting to RDS, add `&sslaccept=accept_invalid_certs` (still
   encrypted, but the certificate is not verified) or install the RDS CA bundle in the image.
3. **S3.** One private bucket: block all public access, versioning on, default encryption on. Attach a minimal
   policy to the instance role (not static keys):
   ```json
   { "Version": "2012-10-17", "Statement": [
     { "Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject"], "Resource": "arn:aws:s3:::YOUR-BUCKET/*" } ] }
   ```
   Documents are uploaded **directly from the browser** with a short-lived signed URL, so the bucket also needs a
   CORS rule for the CRM's address:
   ```json
   [ { "AllowedOrigins": ["https://crm.adreco.in"], "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["*"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3000 } ]
   ```
4. **Secrets.** Keep the production values (section 4) in AWS Systems Manager Parameter Store as SecureString
   and write them to `/etc/adreco-crm/.env` on the server (`chmod 600`). Never put them in the image or the repo.
5. **ECR.** Create a repository named `adreco-crm` for the images.
6. **Email.** Verify the sender domain in SES and create SMTP credentials (`SMTP_HOST` is
   `email-smtp.ap-south-1.amazonaws.com`, port 587).
7. **HTTPS.** Shape A: Caddy gets a certificate automatically once the DNS record points at the server.
   Shape B: request an ACM certificate for `crm.adreco.in`, add an HTTPS listener (443) to the load balancer and
   redirect 80 to 443. Target group: HTTP, port 3000, health check `GET /api/health`, healthy threshold 2,
   unhealthy threshold 2, interval 15 s.
8. **DNS.** An A/alias record for `crm.adreco.in` to the server's Elastic IP (A) or the load balancer (B).

## 4. Production environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | RDS connection string from step 3.2 |
| `AUTH_SECRET` | yes | 32 random bytes: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Changing it signs everyone out. |
| `AUTH_URL` | yes | `https://crm.adreco.in` |
| `AWS_REGION`, `S3_BUCKET_NAME` | for documents | Leave `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` empty and use the instance role |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | for the digest | SES SMTP values |
| `CRON_SECRET` | for the digest | Long random string the scheduler sends as header `x-cron-secret` |
| `ZOHO_WEBHOOK_SECRET` | only if Zoho sends leads in | The inbound webhook **refuses all calls until this is set**; Zoho must send it as header `x-zoho-secret` |
| `GEMINI_API_KEY` | optional | AI advice and drafted messages; deal scores work without it |
| `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | optional | WhatsApp Cloud API sending |
| `ZOHO_*`, `NEXT_PUBLIC_ZOHO_*` | optional | Zoho sync and chat widget. `NEXT_PUBLIC_*` values are baked in at build time. |

The image already sets `TZ=Asia/Kolkata` (dates, "due today" and greetings follow Indian time),
`HOSTNAME=0.0.0.0` and `PORT=3000`. `.env.example` lists every key.

## 5. First deployment

Build and push (from any machine with Docker, or let CI do it):

```bash
docker build -t adreco-crm .
docker build --target migrator -t adreco-crm-migrator .
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.ap-south-1.amazonaws.com
docker tag adreco-crm:latest          <account>.dkr.ecr.ap-south-1.amazonaws.com/adreco-crm:latest
docker tag adreco-crm-migrator:latest <account>.dkr.ecr.ap-south-1.amazonaws.com/adreco-crm:migrator
docker push <account>.dkr.ecr.ap-south-1.amazonaws.com/adreco-crm:latest
docker push <account>.dkr.ecr.ap-south-1.amazonaws.com/adreco-crm:migrator
```

On the server (it can reach RDS), with `/etc/adreco-crm/.env` in place:

```bash
# 1. Create the tables. Run this before every release that changes the database, never from the app containers.
docker run --rm --env-file /etc/adreco-crm/.env <ecr>/adreco-crm:migrator

# 2. First time only: create the administrator. They must choose a new password at their first sign-in.
docker run --rm --env-file /etc/adreco-crm/.env -e SEED_MODE=production \
  -e SEED_ADMIN_EMAIL=you@adreco.in -e SEED_ADMIN_PASSWORD='a-long-one-time-password-1' \
  <ecr>/adreco-crm:migrator npm run db:seed

# 3. Start the app.
docker run -d --name crm --restart unless-stopped -p 3000:3000 --env-file /etc/adreco-crm/.env <ecr>/adreco-crm:latest
curl -fsS http://127.0.0.1:3000/api/health      # {"status":"ok"}
```

Shape A: instead of step 3, copy `deploy/docker-compose.single-server.yml` and `deploy/Caddyfile` to the server,
set `APP_IMAGE`, and run `docker compose -f docker-compose.single-server.yml up -d`.

Then sign in at `https://crm.adreco.in`, set your own password, and create the real users under **Users**
(each gets a temporary password and must change it at first sign-in). Do **not** run the plain `npm run db:seed`
against production: without `SEED_MODE=production` it creates six demo accounts that share a known password. (If
`NODE_ENV=production` is set, the script switches to the safe administrator-only mode on its own, and stops if you
haven't supplied `SEED_ADMIN_PASSWORD`.)

**Schedule the daily digest** (08:00 India time = 02:30 UTC). Shape A: a cron entry on the server
`30 2 * * * curl -fsS -X POST https://crm.adreco.in/api/cron/digest -H "x-cron-secret: $CRON_SECRET"`.
Shape B: an EventBridge rule on `cron(30 2 * * ? *)` with an **API destination** (POST to that URL, connection
header `x-cron-secret`). Don't use a cron on each instance: every instance would send the emails.

**Zoho leads webhook** (only if used): set `ZOHO_WEBHOOK_SECRET`, then point Zoho at
`POST https://crm.adreco.in/api/integrations/zoho/webhook` sending header `x-zoho-secret`. Repeat sends of the
same phone or email are acknowledged without creating a second lead.

## 6. Shipping updates

1. Merge to `main`. CI (`.github/workflows/ci.yml`) typechecks, lints, runs the tests, builds, then builds the
   Docker image, applies the migrations to a scratch database and smoke-tests the running container.
2. Build and push the new images (section 5).
3. Run the migrator once. Keep migrations **additive** (new tables/columns) so the old version keeps working
   while the new one rolls out.
4. Shape A: `docker compose pull && docker compose up -d`. Shape B: an Auto Scaling *instance refresh*, one
   instance at a time; the load balancer's health check keeps traffic away from an instance until it is healthy.

## 7. Backups and recovery

- RDS takes daily snapshots and keeps transaction logs, so you can restore to any minute inside the retention
  period. **Do a test restore once** before relying on it.
- S3 versioning keeps previous versions of uploaded documents.
- The containers hold no data; replacing one loses nothing.
- For a portable copy: `pg_dump "$DATABASE_URL" | gzip > adreco-$(date +%F).sql.gz`.

## 8. Security checklist

Already enforced by the application:

- Sign-in locks an account after 5 failed tries in 15 minutes (and a network address after 20).
- Deactivating a user or changing their role takes effect within about a minute.
- Accounts created or reset by an administrator must choose their own password at first sign-in; passwords need
  8+ characters with a letter and a number.
- Role-based access on every module; sales reps only see their own leads and what hangs off them.
- Security headers on every response (no framing, no content sniffing, HSTS), no `X-Powered-By`.
- Login redirects only go to paths inside the app; CSV exports neutralise spreadsheet formulas.
- Lead imports and exports, password changes, user changes and record changes are written to the activity log,
  and each user's last sign-in time is recorded.

For you to do in AWS: RDS in private subnets reachable only from the app; S3 private with encryption; HTTPS only;
instance role instead of static keys; IMDSv2 required; secrets in Parameter Store; CloudWatch alarms on load
balancer 5xx, unhealthy hosts, RDS CPU and free storage; an uptime check on `/api/health` (UptimeRobot or a
Route 53 health check); a budget alert.

Known gaps to plan for: no two-factor sign-in or single sign-on yet; password resets are done by an
administrator (no emailed reset link); `npm audit` still reports three high advisories in the Prisma 6
**command-line tooling** (build and migration time only, not the running app) which clear only by moving to
Prisma 7, a separate migration.

## What has and hasn't been verified

Verified on the development machine against a real PostgreSQL database: typecheck, lint, 121 unit tests, a
production build, the exact standalone server the image runs (health check, security headers, static files,
sign-in redirects behind a load balancer's Host header), and every page and feature in a browser.

**Not verified, because it needs Docker or an AWS account:** building the image (CI does this on its first run),
running it as the non-root user, the `migrator` image, ECR/EC2/ALB/ASG, RDS TLS settings, S3 uploads (the CORS rule
and signed URLs), SES delivery, and live calls to Gemini, WhatsApp and Zoho. The first deployment is where these
get proven, so plan to watch it and expect small fixes.
