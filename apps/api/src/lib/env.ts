const env = process.env;

function required(name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  nodeEnv: env.NODE_ENV ?? "development",
  logLevel: env.LOG_LEVEL ?? "info",
  port: Number(env.PORT ?? 3003),
  apiBaseUrl: env.API_BASE_URL ?? "http://localhost:3003",
  cookieDomain: env.COOKIE_DOMAIN,
  databaseUrl: required("DATABASE_URL"),
  betterAuthSecret: required("BETTER_AUTH_SECRET"),
  trustedOrigins: (env.BETTER_AUTH_TRUSTED_ORIGINS ?? "http://localhost:3001")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  deviceProvisioningToken: required("DEVICE_PROVISIONING_TOKEN"),
  fieldEncryptionKey: env.FIELD_ENCRYPTION_KEY ?? "",
  seedAdminEmail: env.SEED_ADMIN_EMAIL ?? "admin@example.com",
  seedAdminPassword: env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!",
  seedAdminName: env.SEED_ADMIN_NAME ?? "Platform Admin",
  seedAdminUsername: env.SEED_ADMIN_USERNAME ?? "admin",
};

if (config.nodeEnv === "production") {
  if (!config.fieldEncryptionKey) {
    throw new Error("FIELD_ENCRYPTION_KEY is required in production.");
  }
  if (config.betterAuthSecret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters in production.");
  }
  if (config.seedAdminPassword === "ChangeMe123!" || config.seedAdminPassword === "sibi") {
    console.warn("WARNING: Default seed admin password detected in production.");
  }
}
