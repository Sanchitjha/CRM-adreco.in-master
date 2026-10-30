import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      departmentId: string | null;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    departmentId: string | null;
    mustChangePassword: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    departmentId: string | null;
    mustChangePassword: boolean;
    /** Epoch milliseconds of the last time the account was re-read from the database. */
    checkedAt: number;
  }
}
