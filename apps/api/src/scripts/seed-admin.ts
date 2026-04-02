import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { config } from "../lib/env.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("seed");

async function main() {
  await prisma.role.upsert({
    where: { name: "admin" },
    update: {
      description: "Central platform administrators",
      permissions: ["*"] as never,
    },
    create: {
      name: "admin",
      description: "Central platform administrators",
      permissions: ["*"] as never,
    },
  });

  await prisma.role.upsert({
    where: { name: "operator" },
    update: {
      description: "Central platform operators",
      permissions: ["hitlists:read", "devices:read", "alerts:read"] as never,
    },
    create: {
      name: "operator",
      description: "Central platform operators",
      permissions: ["hitlists:read", "devices:read", "alerts:read"] as never,
    },
  });

  await prisma.role.upsert({
    where: { name: "scanner" },
    update: {
      description: "Field scanning operators (tablet/police)",
      permissions: ["portal:scan"] as never,
    },
    create: {
      name: "scanner",
      description: "Field scanning operators (tablet/police)",
      permissions: ["portal:scan"] as never,
    },
  });

  const existing = await prisma.user.findUnique({
    where: { email: config.seedAdminEmail },
  });

  if (existing) {
    logger.info({ email: existing.email }, "admin already exists");
    return;
  }

  const user = await prisma.user.create({
    data: {
      email: config.seedAdminEmail,
      name: config.seedAdminName,
      username: config.seedAdminUsername,
      displayUsername: config.seedAdminUsername,
      role: "admin",
      emailVerified: true,
    },
  });

  await prisma.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: await bcrypt.hash(config.seedAdminPassword, 10),
    },
  });

  logger.info({ email: config.seedAdminEmail, username: config.seedAdminUsername }, "admin seeded");

  const scannerEmail = "scanner@scanner.com";
  const existingScanner = await prisma.user.findUnique({
    where: { email: scannerEmail },
  });

  if (!existingScanner) {
    const scannerUser = await prisma.user.create({
      data: {
        email: scannerEmail,
        name: "Field Scanner",
        username: "scanner",
        displayUsername: "scanner",
        role: "scanner",
        emailVerified: true,
      },
    });

    await prisma.account.create({
      data: {
        userId: scannerUser.id,
        accountId: scannerUser.id,
        providerId: "credential",
        password: await bcrypt.hash("scanner", 10),
      },
    });

    logger.info({ email: scannerEmail }, "scanner user seeded");
  }
}

main()
  .catch((error) => {
    logger.error({ err: error }, "seed failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
