-- CreateTable
CREATE TABLE "hitlist_assignments" (
    "id" TEXT NOT NULL,
    "hitlistId" TEXT NOT NULL,
    "workstationId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,

    CONSTRAINT "hitlist_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hitlist_assignments_hitlistId_workstationId_key" ON "hitlist_assignments"("hitlistId", "workstationId");

-- AddForeignKey
ALTER TABLE "hitlist_assignments" ADD CONSTRAINT "hitlist_assignments_hitlistId_fkey" FOREIGN KEY ("hitlistId") REFERENCES "hitlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hitlist_assignments" ADD CONSTRAINT "hitlist_assignments_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "workstations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
