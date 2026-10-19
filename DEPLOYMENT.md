# Deploying Adreco CRM on AWS

Target: no single point of failure for the app tier, at a cost that makes sense for a 10-person
internal tool. Not provisioned yet — this is the guide for when you're ready.

## Architecture

```
                        Route 53 (crm.adreco.in)
                                 |
                    Application Load Balancer (2 AZs)
                          /              \
                 EC2 instance A     EC2 instance B   (Auto Scaling Group, min 2)
                  (Docker)             (Docker)
                          \              /
                        RDS PostgreSQL
                                 |
                          S3 (documents)
```

- **2+ EC2 instances** in an Auto Scaling Group across two Availability Zones. If one instance or
  AZ goes down, the ALB routes around it and the ASG replaces it automatically.
- **Application Load Balancer** health-checks `GET /api/health` on each instance and stops sending
  it traffic (then the ASG replaces it) if that check fails — this is what actually delivers the
  "never down" requirement, not any single server being unkillable.
- **RDS PostgreSQL** — managed, automated daily backups, easy to upgrade to Multi-AZ later if the
  client wants to survive a database-level outage too (roughly doubles DB cost).
- **S3** for uploaded documents — durable independent of the app servers.

## One-time setup

1. **VPC**: use the default VPC or create one with public subnets in 2 AZs (EC2 + ALB) and private
   subnets in 2 AZs (RDS).
2. **RDS**: PostgreSQL 16, `db.t4g.micro` to start, single-AZ, 7-day automated backup retention,
   in the private subnets. Note the connection string for `DATABASE_URL`.
3. **S3**: create a private bucket (block all public access), enable versioning and default
   encryption. Create an IAM user or role with `s3:PutObject`/`s3:GetObject` scoped to that bucket
   only — used for `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (or attach the role directly to the
   EC2 instances via an instance profile, which is preferable to static keys).
4. **Secrets**: store `.env` values in AWS Systems Manager Parameter Store (free, simple) rather
   than baking them into the image or committing them anywhere.
5. **ECR**: create a repository, e.g. `adreco-crm`, to push the Docker image to.
6. **ALB + target group**: target group protocol HTTP, port 3000, health check path `/api/health`,
   healthy threshold 2, unhealthy threshold 2, interval 15s. Listener on 443 with an ACM certificate
   for `crm.adreco.in`; redirect 80 → 443.
7. **Auto Scaling Group**: launch template running the Docker image (see below), min/desired 2,
   max 4, spread across the 2 AZs, attached to the ALB target group.
8. **Route 53**: A record (alias) for `crm.adreco.in` pointing at the ALB.

## Building and shipping the image

```bash
docker build -t adreco-crm .
docker tag adreco-crm:latest <account-id>.dkr.ecr.<region>.amazonaws.com/adreco-crm:latest
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/adreco-crm:latest
```

Each EC2 instance's launch template user-data pulls the latest image from ECR and runs it:

```bash
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com
docker pull <account-id>.dkr.ecr.<region>.amazonaws.com/adreco-crm:latest
docker run -d --restart unless-stopped -p 3000:3000 --env-file /etc/adreco-crm/.env <account-id>.dkr.ecr.<region>.amazonaws.com/adreco-crm:latest
```

`--restart unless-stopped` means Docker itself restarts the container if the process crashes, on
top of the ALB/ASG layer handling a whole-instance failure.

## Database migrations

Run migrations as a one-off step before rolling out a new version — not automatically on every
container start (with 2+ instances starting simultaneously, concurrent auto-migration is a race
condition to avoid):

```bash
DATABASE_URL=<rds-connection-string> npm run db:migrate:deploy
```

Run this from CI, or once from any machine that can reach the RDS instance (e.g. a bastion host or
temporarily opening the security group), before updating the running instances.

## Environment variables in production

Same keys as `.env.example`, with real values:
- `AUTH_URL` → `https://crm.adreco.in`
- `AUTH_SECRET` → secure random 32-byte base64 string
- `DATABASE_URL` → the RDS PostgreSQL connection string
- `AWS_REGION` / `S3_BUCKET_NAME` (prefer an EC2/ECS IAM task role over static keys)
- `SMTP_*` → your transactional email provider (AWS SES is the natural fit)
- `CRON_SECRET` → shared secret for scheduled digests
- `GEMINI_API_KEY` → Google Gemini API key for AI deal scoring and automated message drafts
- `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` / `ZOHO_REFRESH_TOKEN` → Zoho CRM OAuth 2.0 credentials
- `NEXT_PUBLIC_ZOHO_SALESIQ_WIDGET_CODE` → Zoho SalesIQ chat widget code for live in-app chat

## Deployment Options on AWS

### Option 1: EC2 + Docker in Auto Scaling Group (Cost-Optimized)
- 2x `t4g.small` or `t4g.micro` EC2 instances (ARM-based Graviton2, ~20% cheaper)
- Managed via launch template, automatically pulling the Docker image from Amazon ECR.
- Fronted by an Application Load Balancer with ACM SSL.

### Option 2: AWS ECS Fargate (Serverless Containers - Zero Server Maintenance)
- Run the Docker container as an ECS Fargate Service.
- No EC2 OS patching or host management required.
- Auto-scales container tasks automatically based on CPU/memory utilization.
- Health checks connect directly to ALB target group on `/api/health`.

## What this buys you, and what it doesn't

This design survives: a single instance crashing, a bad deploy to one instance, an AZ outage, and
routine EC2 maintenance. It does **not** survive an RDS outage unless Multi-AZ is enabled, or a
region-wide AWS outage (out of scope for an internal CRM — the cost/complexity of
multi-region isn't justified here).

