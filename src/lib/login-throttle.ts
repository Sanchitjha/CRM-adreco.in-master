import { prisma } from "@/lib/db";

/** Failed sign-ins tolerated per email, and per network address, inside the window before further attempts are refused. */
export const MAX_FAILURES_PER_EMAIL = 5;
export const MAX_FAILURES_PER_IP = 20;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

/** Whether the recent failure counts mean a sign-in must be refused. Pure so the policy can be tested. */
export function isLockedOut(emailFailures: number, ipFailures: number): boolean {
  return emailFailures >= MAX_FAILURES_PER_EMAIL || ipFailures >= MAX_FAILURES_PER_IP;
}

/**
 * The caller's address from an X-Forwarded-For header. Our load balancer appends the real client address as the
 * last entry; anything before it was supplied by the client and cannot be trusted.
 */
export function clientIp(forwardedFor: string | null | undefined): string | null {
  const parts = (forwardedFor ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

export async function signInBlocked(email: string, ip: string | null, now: Date = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - LOCKOUT_WINDOW_MS);
  const [emailFailures, ipFailures] = await Promise.all([
    prisma.loginFailure.count({ where: { email, createdAt: { gt: since } } }),
    ip ? prisma.loginFailure.count({ where: { ip, createdAt: { gt: since } } }) : Promise.resolve(0),
  ]);
  return isLockedOut(emailFailures, ipFailures);
}

export async function recordSignInFailure(email: string, ip: string | null): Promise<void> {
  await prisma.loginFailure.create({ data: { email, ip } });
}

export async function clearSignInFailures(email: string): Promise<void> {
  await prisma.loginFailure.deleteMany({ where: { email } });
}

/** Failures older than a day can no longer lock anyone out; the daily digest job removes them. */
export async function purgeOldSignInFailures(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.loginFailure.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
  });
  return count;
}
