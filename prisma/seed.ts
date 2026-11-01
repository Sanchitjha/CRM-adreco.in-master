import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEPARTMENT_PIPELINE, ROLE_TO_DEPARTMENT_NAME } from "../src/lib/rbac";
import { passwordSchema } from "../src/lib/password-policy";
import { DEMO_PRODUCTS, demoProspectSheet } from "../src/lib/demo-data";
import { parseLeadTable } from "../src/lib/lead-import";
import { leadFromImportRow } from "../src/lib/lead-import-save";

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

/** One account per role, all sharing the given password. Accounts that already exist are left as they are. */
async function seedRoleUsers(departmentByName: Awaited<ReturnType<typeof seedDepartments>>, password: string) {
  const passwordHash = await bcrypt.hash(password, 10);

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
}

/** Local development: one demo account per role, all sharing a known password. */
async function seedDevelopmentUsers(departmentByName: Awaited<ReturnType<typeof seedDepartments>>) {
  await seedRoleUsers(departmentByName, DEMO_PASSWORD);

  console.log(`Seeded ${departmentByName.size} departments and ${SEED_USERS.length} demo users.`);
  console.log(`Demo password for all seeded users: ${DEMO_PASSWORD}`);
}

/**
 * A demo or test copy to hand to someone: one account per role with a password you supply (never the shared
 * development one), a small product catalogue, and made-up prospects in the layout of a sales team's sheet, owned by
 * the sales account. Only for a database that exists for that purpose: it refuses one that has other users, and it
 * loads the sample prospects only into a CRM that has no leads yet.
 */
async function seedDemo(departmentByName: Awaited<ReturnType<typeof seedDepartments>>) {
  const password = process.env.SEED_DEMO_PASSWORD ?? "";
  const strong = passwordSchema.safeParse(password).success && password.length >= 12 && password !== DEMO_PASSWORD;
  if (!strong) {
    throw new Error("Set SEED_DEMO_PASSWORD to a password of at least 12 characters, with a letter and a number, before seeding a demo.");
  }

  const others = await prisma.user.count({ where: { email: { notIn: SEED_USERS.map((u) => u.email) } } });
  if (others > 0) throw new Error("This database has other users, so it is not a demo copy. Demo accounts were not added.");

  await seedRoleUsers(departmentByName, password);
  for (const product of DEMO_PRODUCTS) {
    await prisma.product.upsert({ where: { modelCode: product.modelCode }, update: {}, create: product });
  }

  const sales = await prisma.user.findUniqueOrThrow({ where: { email: "sales@adreco.in" } });
  let prospects = 0;
  if ((await prisma.lead.count()) === 0) {
    const sheet = parseLeadTable(demoProspectSheet());
    if (sheet.fatal || sheet.problems.length > 0) throw new Error(`The sample prospects could not be read: ${sheet.fatal ?? sheet.problems[0].message}`);
    await prisma.$transaction(
      async (tx) => {
        for (const row of sheet.rows) await tx.lead.create({ data: leadFromImportRow(row, sales.id, sales.id) });
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    prospects = sheet.rows.length;
  }

  console.log(`Seeded ${departmentByName.size} departments, ${SEED_USERS.length} accounts, ${DEMO_PRODUCTS.length} products and ${prospects} sample prospects.`);
  console.log("Everyone signs in with the password given in SEED_DEMO_PASSWORD.");
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
  // A demo is asked for by name, so it wins even inside a production-built container, where everything else is production.
  if (process.env.SEED_MODE === "demo") await seedDemo(departmentByName);
  else if (production) await seedProductionAdmin(departmentByName);
  else await seedDevelopmentUsers(departmentByName);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
