import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { clearSignInFailures, clientIp, recordSignInFailure, signInBlocked } from "@/lib/login-throttle";

/** Surfaced to the login form as `code`, so it can say "try again later" instead of "wrong password". */
class TooManyAttempts extends CredentialsSignin {
  code = "too_many_attempts";
}

/** How long a signed-in browser may go without us re-reading its account from the database. */
const ACCOUNT_RECHECK_MS = 60_000;

// Compared against when the email is unknown, so a miss takes as long as a wrong password and the response time
// does not reveal which addresses have accounts.
const UNKNOWN_USER_HASH = bcrypt.hashSync("no-such-user-password", 10);

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // Self-hosted on our own EC2/ALB (not Vercel), so Auth.js must trust the
  // incoming request's Host header rather than requiring a fixed AUTH_URL.
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials, request) => {
        const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : undefined;
        const password = typeof credentials?.password === "string" ? credentials.password : undefined;
        if (!email || !password) return null;

        const ip = clientIp(request.headers.get("x-forwarded-for"));
        if (await signInBlocked(email, ip)) throw new TooManyAttempts();

        const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
        const valid = await bcrypt.compare(password, user?.passwordHash ?? UNKNOWN_USER_HASH);
        if (!user || !user.active || !valid) {
          await recordSignInFailure(email, ip);
          return null;
        }

        await clearSignInFailures(email);
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          departmentId: user.departmentId,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.departmentId = user.departmentId;
        token.mustChangePassword = user.mustChangePassword;
        token.checkedAt = Date.now();
        return token;
      }

      // The token outlives a deactivation, a role change and a password reset, so re-read the account about once
      // a minute (and straight away after the person changes their own password). Returning null signs them out.
      if (trigger === "update" || Date.now() - ((token.checkedAt as number | undefined) ?? 0) > ACCOUNT_RECHECK_MS) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { name: true, role: true, departmentId: true, active: true, mustChangePassword: true },
        });
        if (!fresh || !fresh.active) return null;
        token.name = fresh.name;
        token.role = fresh.role;
        token.departmentId = fresh.departmentId;
        token.mustChangePassword = fresh.mustChangePassword;
        token.checkedAt = Date.now();
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as Role;
      session.user.departmentId = token.departmentId as string | null;
      session.user.mustChangePassword = Boolean(token.mustChangePassword);
      return session;
    },
  },
});
