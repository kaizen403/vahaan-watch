import Database from "better-sqlite3";

export const SCHEMA_DDL = [
  `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      appliedAt TEXT NOT NULL
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS local_hitlist_entries (
      id TEXT PRIMARY KEY,
      hitlistId TEXT NOT NULL,
      plateOriginal TEXT NOT NULL,
      plateNormalized TEXT NOT NULL,
      countryOrRegion TEXT,
      priority TEXT,
      status TEXT NOT NULL,
      validFrom TEXT,
      validUntil TEXT,
      reasonSummary TEXT,
      vehicleMake TEXT,
      vehicleModel TEXT,
      vehicleColor TEXT,
      metadata TEXT,
      syncedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_local_hitlist_entries_hitlist_id
      ON local_hitlist_entries(hitlistId);

    CREATE INDEX IF NOT EXISTS idx_local_hitlist_entries_plate_normalized
      ON local_hitlist_entries(plateNormalized);
  `,
  `
    CREATE TABLE IF NOT EXISTS pending_detections (
      id TEXT PRIMARY KEY,
      externalEventId TEXT NOT NULL UNIQUE,
      plate TEXT NOT NULL,
      plateNormalized TEXT NOT NULL,
      occurredAt TEXT NOT NULL,
      confidence REAL,
      snapshotPath TEXT,
      hitlistId TEXT,
      country TEXT,
      make TEXT,
      model TEXT,
      color TEXT,
      synced INTEGER NOT NULL DEFAULT 0,
      syncedAt TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pending_detections_synced_created_at
      ON pending_detections(synced, createdAt);

    CREATE INDEX IF NOT EXISTS idx_pending_detections_plate_normalized
      ON pending_detections(plateNormalized);
  `,
  `
    CREATE TABLE IF NOT EXISTS pending_match_events (
      id TEXT PRIMARY KEY,
      externalEventId TEXT NOT NULL UNIQUE,
      detectionId TEXT,
      hitlistEntryId TEXT,
      alertStatus TEXT NOT NULL,
      note TEXT,
      synced INTEGER NOT NULL DEFAULT 0,
      syncedAt TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pending_match_events_synced_created_at
      ON pending_match_events(synced, createdAt);
  `,
  `
    CREATE TABLE IF NOT EXISTS pending_snapshots (
      id TEXT PRIMARY KEY,
      detectionId TEXT NOT NULL,
      filePath TEXT NOT NULL UNIQUE,
      fileSize INTEGER NOT NULL,
      contentType TEXT NOT NULL,
      capturedAt TEXT NOT NULL,
      compressed INTEGER NOT NULL DEFAULT 0,
      uploaded INTEGER NOT NULL DEFAULT 0,
      retentionUntil TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pending_snapshots_uploaded_created_at
      ON pending_snapshots(uploaded, createdAt);

    CREATE INDEX IF NOT EXISTS idx_pending_snapshots_retention_until
      ON pending_snapshots(retentionUntil);
  `,
  `
    CREATE TABLE IF NOT EXISTS telemetry_buffer (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0,
      syncedAt TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_telemetry_buffer_synced_created_at
      ON telemetry_buffer(synced, createdAt);
  `,
  `
    CREATE TABLE IF NOT EXISTS device_health_snapshots (
      component TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      lastCheckedAt TEXT NOT NULL
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS sync_state (
      scope TEXT PRIMARY KEY,
      cursor TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sync_state_updated_at
      ON sync_state(updatedAt);
  `,
] as const;

interface SchemaMigration {
  id: string;
  statements: readonly string[];
}

const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = [
  {
    id: "20260401_pending_detections_attempts",
    statements: [
      `ALTER TABLE pending_detections ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0`,
    ],
  },
  {
    id: "20260401_pending_detections_last_attempt_at",
    statements: [
      `ALTER TABLE pending_detections ADD COLUMN lastAttemptAt TEXT`,
    ],
  },
  {
    id: "20260401_pending_detections_next_retry_at",
    statements: [
      `ALTER TABLE pending_detections ADD COLUMN nextRetryAt TEXT`,
    ],
  },
  {
    id: "20260401_pending_detections_failed",
    statements: [
      `ALTER TABLE pending_detections ADD COLUMN failed INTEGER NOT NULL DEFAULT 0`,
    ],
  },
  {
    id: "20260401_pending_match_events_attempts",
    statements: [
      `ALTER TABLE pending_match_events ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0`,
    ],
  },
  {
    id: "20260401_pending_match_events_last_attempt_at",
    statements: [
      `ALTER TABLE pending_match_events ADD COLUMN lastAttemptAt TEXT`,
    ],
  },
  {
    id: "20260401_pending_match_events_next_retry_at",
    statements: [
      `ALTER TABLE pending_match_events ADD COLUMN nextRetryAt TEXT`,
    ],
  },
  {
    id: "20260401_pending_match_events_failed",
    statements: [
      `ALTER TABLE pending_match_events ADD COLUMN failed INTEGER NOT NULL DEFAULT 0`,
    ],
  },
];

export function applySchemaMigrations(db: Database.Database): void {
  const appliedMigrations = new Set(
    (db
      .prepare(
        `
          SELECT id
          FROM schema_migrations
          ORDER BY id ASC
        `,
      )
      .all() as Array<{ id: string }>)
      .map((migration) => migration.id),
  );

  const applyMigration = db.transaction((migration: SchemaMigration) => {
    for (const statement of migration.statements) {
      db.exec(statement);
    }

    db.prepare(
      `
        INSERT INTO schema_migrations (
          id,
          appliedAt
        ) VALUES (?, ?)
      `,
    ).run(migration.id, new Date().toISOString());
  });

  for (const migration of SCHEMA_MIGRATIONS) {
    if (appliedMigrations.has(migration.id)) {
      continue;
    }

    applyMigration(migration);
  }
}
