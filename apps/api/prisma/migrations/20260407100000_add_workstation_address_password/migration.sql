ALTER TABLE "workstations" ADD COLUMN "address" TEXT;
ALTER TABLE "workstations" ADD COLUMN "passwordHash" TEXT;

UPDATE "workstations" SET "address" = "deviceId", "passwordHash" = '' WHERE "address" IS NULL;

ALTER TABLE "workstations" ALTER COLUMN "address" SET NOT NULL;
ALTER TABLE "workstations" ALTER COLUMN "passwordHash" SET NOT NULL;

CREATE UNIQUE INDEX "workstations_address_key" ON "workstations"("address");
