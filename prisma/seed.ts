import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEPARTMENT_PIPELINE, ROLE_TO_DEPARTMENT_NAME } from "../src/lib/rbac";
import { passwordSchema } from "../src/lib/password-policy";

const prisma = new PrismaClient();

const SEED_USERS: { name: string; email: string; role: Role }[] = [
  { name: "Admin", email: "admin@adreco.in", role: "ADMIN" },
  { name: "Sales Rep", email: "sales@adreco.in", role: "SALES" },
  { name: "Design Engineer", email: "design@adreco.in", role: "DESIGN" },
  { name: "Accounts Executive", email: "accounts@adreco.in", role: "ACCOUNTS" },
  { name: "Installation Lead", email: "installation@adreco.in", role: "INSTALLATION" },
  { name: "Service Executive", email: "service@adreco.in", role: "SERVICE" },
];

// Demo accounts for local development only. A production database never gets these.
const DEMO_PASSWORD = "ChangeMe123!";

const production = process.env.SEED_MODE === "production" || process.env.NODE_ENV === "production";

async function seedDepartments() {
  const departments = await Promise.all(
    DEPARTMENT_PIPELINE.map((name, index) =>
      prisma.department.upsert({
        where: { name },
        update: { sortOrder: index },
        create: { name, sortOrder: index },
      }),
    ),
  );
  return new Map(departments.map((d) => [d.name, d]));
}

/** Local development: one demo account per role, all sharing a known password. */
async function seedDemoUsers(departmentByName: Awaited<ReturnType<typeof seedDepartments>>) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const u of SEED_USERS) {
    const departmentName = ROLE_TO_DEPARTMENT_NAME[u.role];
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        name: u.name,
        email: u.email,
        passwordHash,
        role: u.role,
        departmentId: departmentName ? departmentByName.get(departmentName)?.id : null,
      },
    });
  }

  console.log(`Seeded ${departmentByName.size} departments and ${SEED_USERS.length} demo users.`);
  console.log(`Demo password for all seeded users: ${DEMO_PASSWORD}`);
}

/**
 * Production: a single administrator whose password you supply. They must replace it at first sign-in, and every
 * other account is created from the Users screen. Re-running never overwrites an existing account.
 */
async function seedProductionAdmin(departmentByName: Awaited<ReturnType<typeof seedDepartments>>) {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@adreco.in").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";

  const strong = passwordSchema.safeParse(password).success && password.length >= 12 && password !== DEMO_PASSWORD;
  if (!strong) {
    throw new Error(
      "Set SEED_ADMIN_PASSWORD to a password of at least 12 characters, with a letter and a number, before seeding production.",
    );
  }

  const departmentName = ROLE_TO_DEPARTMENT_NAME.ADMIN;
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: process.env.SEED_ADMIN_NAME?.trim() || "Administrator",
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: "ADMIN",
      departmentId: departmentName ? departmentByName.get(departmentName)?.id : null,
      mustChangePassword: true,
    },
  });

  console.log(`Seeded ${departmentByName.size} departments and the administrator ${email}.`);
  console.log("They will be asked to choose a new password at first sign-in.");
}

async function main() {
  const departmentByName = await seedDepartments();
  if (production) await seedProductionAdmin(departmentByName);
  else await seedDemoUsers(departmentByName);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
