import { Pool } from "pg";
import pino from "pino";

const logger = pino({ name: "ws-server:db", level: process.env.LOG_LEVEL ?? "info" });

const POSTGRES_URL =
  process.env.POSTGRES_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5432/carmen_anpr";
export const DB_SCHEMA = process.env.DB_SCHEMA || "public";
export const BLACKLIST_COLLECTION =
  process.env.BLACKLIST_COLLECTION || "blacklisted_plates";
export const DETECTIONS_COLLECTION =
  process.env.DETECTIONS_COLLECTION || "detections";

let pool: Pool | null = null;
let connectPromise: Promise<Pool> | null = null;

export function tableRef(tableName: string): string {
  return `"${DB_SCHEMA}"."${tableName}"`;
}

async function ensureSchema(): Promise<void> {
  if (!pool) throw new Error("Pool not initialized");

  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${DB_SCHEMA}"`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${tableRef(BLACKLIST_COLLECTION)} (
      id BIGSERIAL PRIMARY KEY,
      plate_hash TEXT NOT NULL UNIQUE,
      encrypted_plate TEXT NOT NULL,
      reason TEXT,
      risk_level TEXT,
      source TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${tableRef(DETECTIONS_COLLECTION)} (
      id BIGSERIAL PRIMARY KEY,
      session_id TEXT,
      batch_num INTEGER,
      region TEXT,
      timestamp TEXT,
      plate_hash TEXT NOT NULL,
      encrypted_plate TEXT NOT NULL,
      country TEXT,
      make TEXT,
      model TEXT,
      color TEXT,
      category TEXT,
      is_blacklisted BOOLEAN NOT NULL DEFAULT FALSE,
      blacklist_reason TEXT,
      risk_level TEXT,
      detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows } = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = '${DB_SCHEMA}'
      AND table_name = '${DETECTIONS_COLLECTION}'
      AND column_name = 'detected_at'
  `);
  if (rows.length === 0) {
    await pool.query(
      `ALTER TABLE ${tableRef(DETECTIONS_COLLECTION)} ADD COLUMN detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
    );
  }

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${BLACKLIST_COLLECTION}_created_at_idx
    ON ${tableRef(BLACKLIST_COLLECTION)} (created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${DETECTIONS_COLLECTION}_detected_at_idx
    ON ${tableRef(DETECTIONS_COLLECTION)} (detected_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${DETECTIONS_COLLECTION}_plate_hash_detected_at_idx
    ON ${tableRef(DETECTIONS_COLLECTION)} (plate_hash, detected_at DESC)
  `);
}

export async function connectDb(): Promise<Pool> {
  if (pool) return pool;
  if (connectPromise) return connectPromise;

  const nextPool = new Pool({ connectionString: POSTGRES_URL });

  connectPromise = (async () => {
    try {
      await nextPool.query("SELECT 1");
      pool = nextPool;
      await ensureSchema();
      return pool;
    } catch (err) {
      await nextPool.end().catch(() => {});
      if (pool === nextPool) {
        pool = null;
      }
      throw err;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

export async function getBlacklistCollection(): Promise<string> {
  await connectDb();
  return BLACKLIST_COLLECTION;
}

export async function getDetectionsCollection(): Promise<string> {
  await connectDb();
  return DETECTIONS_COLLECTION;
}

export async function closeDb(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
  logger.info("database connection closed");
}
