import bcrypt from "bcryptjs";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { username } from "better-auth/plugins";
import { prisma } from "./prisma.js";
import { config } from "./env.js";
import { writeAuditLog } from "./audit.js";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  baseURL: config.apiBaseUrl,
  secret: config.betterAuthSecret,
  basePath: "/api/auth",
  trustedOrigins: config.trustedOrigins,
  user: {
    additionalFields: {
      role: {
        type: ["admin", "operator", "scanner"],
        required: false,
        defaultValue: "operator",
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
    password: {
      hash: async (password) => bcrypt.hash(password, 10),
      verify: async ({ hash, password }) => bcrypt.compare(password, hash),
    },
  },
  plugins: [username()],
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          await writeAuditLog({
            actorUser: { id: session.userId, email: "", name: "", username: null, role: "" },
            action: "user.signed_in",
            entityType: "session",
            entityId: session.id,
          }).catch(() => {});
        },
      },
    },
  },
});
