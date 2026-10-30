# Deploying Adreco CRM on AWS

Nothing is provisioned yet. High availability (shape B below) was chosen on 2026-10-30, and this guide, the
CloudFormation template and the deploy workflow are built for it. The Docker image build and smoke test already pass
on GitHub. The AWS template itself has only been checked offline; see
[What has and hasn't been verified](#what-has-and-hasnt-been-verified).

## 1. The two shapes

Both run the **same Docker image**, so you can start small and move up later without changing the app.

| | **A. Starter: one server** | **B. High availability (chosen)** |
|---|---|---|
| App | 1 EC2 instance running the container, with Caddy for automatic HTTPS | 2+ containers on **ECS Fargate** (no servers to patch) in two Availability Zones behind an Application Load Balancer |
| Database | RDS PostgreSQL 16, `db.t4g.micro` | Same, with an option to add a standby copy (**Multi-AZ**) |
| Survives | Nothing: if the server dies the CRM is down until it is replaced | A container crash, a bad release (it rolls back by itself), an Availability Zone outage; with Multi-AZ also a database failure |
| Rough cost* | about US$30–40 / month | about US$80–110 / month |
| Set up by | By hand (section 8) | One CloudFormation template plus a deploy workflow |

\*Estimates for the Mumbai region (`ap-south-1`) from published on-demand prices; confirm in the AWS pricing
calculator before committing. Shape B is Application Load Balancer about US$20–25, two small containers about
US$35–40, database about US$13–15 (about US$27–30 with Multi-AZ), and a few dollars for storage, logs and secrets.

```
                      Route 53 / your DNS  (crm.adreco.in)
                                  |
              Application Load Balancer  (HTTPS, 2 Availability Zones)
                          /                    \
              container (zone a)          container (zone b)      ECS Fargate, 2+ copies
                          \                    /
                          RDS PostgreSQL  (private, encrypted, daily backups)
                                  |
                      S3 bucket for documents (private)
```

## 2. Start these now: they take time

You can do all of these before anything is built.

1. **AWS account.** Create it with the company's billing details. Then, using the root login only for this:
   turn on multi-factor sign-in, create a normal administrator user for day-to-day work, and add a **budget
   alert** (Billing, Budgets) at about US$120 a month so a mistake can't run up a bill.
2. **Region.** Use **Asia Pacific (Mumbai) `ap-south-1`** for everything below, and keep the console on it.
3. **HTTPS certificate.** In *Certificate Manager* request a public certificate for `crm.adreco.in` with DNS
   validation. If your DNS is in Route 53, press *Create records in Route 53*; otherwise add the CNAME it shows at
   whoever hosts your DNS. Wait until it says **Issued**, then copy its ARN.
4. **Email sending.** In *Simple Email Service* verify your sender address or `adreco.in`, **request production
   access** (new accounts can only email verified addresses; approval takes about a day), and create SMTP credentials.

## 3. Create the stack

1. *CloudFormation*, Create stack, With new resources, **Upload a template file**:
   [`deploy/aws/adreco-crm-ha.yaml`](deploy/aws/adreco-crm-ha.yaml). Name it `adreco-crm`.
2. Fill in the parameters. The ones that matter:
   - `CertificateArn`: from step 2.3. `DomainName`: `crm.adreco.in`.
   - `HostedZoneId`: only if your DNS is in Route 53. Otherwise leave empty.
   - `VpcId`: the default VPC. `SubnetIds`: pick two or more in different zones (the default VPC's are public, as needed).
   - `DesiredCount`: leave at **0** for now.
   - `DbMultiAz`: `true` for production (a standby database, about US$13 more a month), `false` while testing.
   - `DbEngineVersion`: leave the default (PostgreSQL 16) unless CloudFormation says it is unavailable in your region;
     then pick another 16.x from the RDS *Create database* page.
   - `AlarmEmail`: who is told when the CRM turns unhealthy or the database runs low on space.
   - `CreateGitHubOidcProvider`: `true`, unless this AWS account already has a GitHub identity provider.
3. Tick *I acknowledge that CloudFormation might create IAM resources*, and create. It takes 15–25 minutes, mostly
   the database. Open the stack's **Outputs** tab.
4. **DNS.** With Route 53 the record is created for you. Otherwise add a CNAME for `crm` pointing at the
   `LoadBalancerDnsName` output.

The stack creates the network rules, the database (private, encrypted, backed up for 14 days, deletion-protected),
the document bucket, the image repository, the cluster, the load balancer, generated secrets (nobody types the
database password or the login-signing key), the daily-digest schedule, alarms, and a role that lets GitHub deploy
without stored passwords.

## 4. First deployment

1. In GitHub, *Settings, Secrets and variables, Actions, Variables*, add **`AWS_REGION`** and
   **`AWS_DEPLOY_ROLE_ARN`**, both from the stack's Outputs.
2. *Actions, Deploy to AWS, Run workflow* (on `main`). It builds the images, pushes them, applies the database
   migrations as a one-off task, and finishes. No containers run yet, which is expected.
3. **Create the first administrator.** In AWS *CloudShell* (the `>_` icon in the console), paste this after
   changing the two values:

   ```bash
   NETWORK=$(aws ecs describe-services --cluster adreco-crm --services adreco-crm --query 'services[0].networkConfiguration' --output json)
   aws ecs run-task --cluster adreco-crm --launch-type FARGATE --task-definition adreco-crm-migrate \
     --network-configuration "$NETWORK" \
     --overrides '{"containerOverrides":[{"name":"migrate","command":["npm","run","db:seed"],"environment":[{"name":"SEED_MODE","value":"production"},{"name":"SEED_ADMIN_EMAIL","value":"YOUR-EMAIL-HERE"},{"name":"SEED_ADMIN_PASSWORD","value":"YOUR-ONE-TIME-PASSWORD"}]}]}'
   ```

   Replace both placeholders: the password needs 12 or more characters with a letter and a number, and the seed
   refuses to run with the placeholder left in. It is one-time: the administrator must replace it at first
   sign-in. Never run the plain
   `npm run db:seed` against production: without `SEED_MODE=production` it creates six demo accounts that share a
   known password.
4. **Start the containers.** *CloudFormation*, the stack, Update, *Use existing template*, set **`DesiredCount` to 2**.
   When the update finishes, open `https://crm.adreco.in`, sign in, choose your own password, and create the real
   users under **Users** (each gets a temporary password and must change it at first sign-in).

## 5. Optional settings: email, AI, WhatsApp, Zoho

The CRM works without them (click-to-chat WhatsApp needs no keys). To switch some on, make a text file of
`NAME=value` lines (the names are in [`.env.example`](.env.example): `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`,
`SMTP_FROM`, `GEMINI_API_KEY`, `WHATSAPP_API_TOKEN`, `ZOHO_WEBHOOK_SECRET` and so on). Upload it to the documents bucket
(the `DocumentsBucketName` output) as `config/app.env`, then update the stack with `EnvFileKey` set to
`config/app.env`. After later edits to the file, run *Deploy to AWS* so new containers read it. The file lives in
a private bucket, and the running app cannot read it.

The Zoho leads webhook is `POST https://crm.adreco.in/api/integrations/zoho/webhook` with header `x-zoho-secret`.
It refuses every call until `ZOHO_WEBHOOK_SECRET` is set.

## 6. Everyday operations

- **Release a new version:** merge to `main`, then *Deploy to AWS*. New containers start and must pass their health
  check before the old ones stop. If a release fails to start, ECS **rolls back automatically**.
- **Roll back by hand:** update the stack with `ImageTag` set to an earlier commit ID (every image is tagged with its
  commit ID).
- **Logs:** CloudWatch, Log groups, `/adreco-crm` (`app` and `migrate` streams).
- **Change capacity:** update `DesiredCount` or `TaskSize`. Setting `DesiredCount` to 0 stops the containers, but the
  database and load balancer keep costing.
- **Daily digest:** a schedule calls the digest at 08:00 India time. It needs the email settings in section 5.
- **Backups:** RDS keeps daily snapshots and transaction logs for 14 days, so you can restore to any minute in that
  window. **Do one test restore** before relying on it. S3 versioning keeps earlier versions of documents. The
  containers hold no data. For a portable copy, `pg_dump` from a machine that can reach the database.
- **Deleting the stack** keeps the database snapshot, the document bucket and the image repository on purpose.

## 7. Environment variables

The stack supplies `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `CRON_SECRET`, `AWS_REGION` and `S3_BUCKET_NAME` itself.
Everything else comes from the optional file in section 5. The image already sets `TZ=Asia/Kolkata`,
`HOSTNAME=0.0.0.0` and `PORT=3000`. [`.env.example`](.env.example) lists every name.

## 8. Shape A: the starter single server

Not automated. Launch one EC2 instance (`t4g.small`, Amazon Linux 2023) with Docker, an RDS PostgreSQL 16 database
reachable only from it, and an S3 bucket with the CORS rule below. Put the settings in `/etc/adreco-crm/.env`, copy
[`deploy/docker-compose.single-server.yml`](deploy/docker-compose.single-server.yml) and
[`deploy/Caddyfile`](deploy/Caddyfile) to the server, set `APP_IMAGE`, and run
`docker compose -f docker-compose.single-server.yml up -d`. Build and push the images to ECR as in
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), run the `migrator` image once
(`docker run --rm --env-file /etc/adreco-crm/.env <ecr>/adreco-crm:migrator`), and seed the administrator with
`SEED_MODE=production` and `SEED_ADMIN_PASSWORD` as in section 4. Schedule the digest with a cron entry:
`30 2 * * * curl -fsS -X POST https://crm.adreco.in/api/cron/digest -H "x-cron-secret: $CRON_SECRET"`.

```json
[ { "AllowedOrigins": ["https://crm.adreco.in"], "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["*"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3000 } ]
```

## 9. Security checklist

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

Set up by the stack (shape B): the database is private, reachable only from the containers, encrypted, and
deletion-protected; the document bucket is private, encrypted, versioned and HTTPS-only; the running app can only read
and write customer documents; passwords and keys are generated into Secrets Manager; the load balancer serves HTTPS
only (TLS 1.2 and up) and redirects plain HTTP; GitHub deploys through a role that only trusts the `main` branch.

For you: multi-factor sign-in and a budget alert on the AWS account (section 2), the alarm email address, a
database **Multi-AZ** standby for production, and optionally AWS WAF in front of the load balancer.

Known gaps to plan for: no two-factor sign-in or single sign-on for CRM users yet; password resets are done by an
administrator (no emailed reset link); the database connection is encrypted but its certificate is not verified (a
known limitation of Prisma with RDS; verifying it means adding the RDS certificate bundle to the image);
`npm audit` still reports three high advisories in the Prisma 6 **command-line tooling** (build and migration time
only, not the running app) which clear only by moving to Prisma 7, a separate migration.

## What has and hasn't been verified

**Verified:** typecheck, lint, 121 unit tests, a production build, and the full container flow in GitHub's CI (it
builds the image, applies all migrations to a real PostgreSQL, starts the container and smoke-tests health, headers,
redirects and the Indian time zone). Every page and feature was also exercised in a browser against a real database.

**Checked only offline:** the CloudFormation template parses and every reference inside it resolves, and `cfn-lint`
runs on it in CI. The deploy workflow is valid YAML.

**Not verified, because it needs an AWS account:** the template actually creating its resources, ECS and load-balancer
behaviour, the database connection settings against RDS, S3 uploads from the browser (CORS and signed links), SES
delivery, the scheduled digest, the deploy workflow end to end, and live calls to Gemini, WhatsApp and Zoho. The first
deployment is where these get proven, so plan to watch it and expect small fixes.
