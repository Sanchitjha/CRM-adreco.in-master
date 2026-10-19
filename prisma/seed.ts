import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEPARTMENT_PIPELINE, ROLE_TO_DEPARTMENT_NAME } from "../src/lib/rbac";

const prisma = new PrismaClient();

const SEED_USERS: { name: string; email: string; role: Role }[] = [
  { name: "Admin", email: "admin@adreco.in", role: "ADMIN" },
  { name: "Sales Rep", email: "sales@adreco.in", role: "SALES" },
  { name: "Design Engineer", email: "design@adreco.in", role: "DESIGN" },
  { name: "Accounts Executive", email: "accounts@adreco.in", role: "ACCOUNTS" },
  { name: "Installation Lead", email: "installation@adreco.in", role: "INSTALLATION" },
  { name: "Service Executive", email: "service@adreco.in", role: "SERVICE" },
];

const DEFAULT_PASSWORD = "ChangeMe123!";

async function main() {
  const departments = await Promise.all(
    DEPARTMENT_PIPELINE.map((name, index) =>
      prisma.department.upsert({
        where: { name },
        update: { sortOrder: index },
        create: { name, sortOrder: index },
      }),
    ),
  );
  const departmentByName = new Map(departments.map((d) => [d.name, d]));

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

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

  console.log(`Seeded ${departments.length} departments and ${SEED_USERS.length} users.`);
  console.log(`Default password for all seeded users: ${DEFAULT_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
