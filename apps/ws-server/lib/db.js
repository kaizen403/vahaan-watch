const { Pool } = require("pg");

const POSTGRES_URL = process.env.POSTGRES_URL || "postgresql://postgres:postgres@127.0.0.1:5432/carmen_anpr";
const DB_SCHEMA = process.env.DB_SCHEMA || "public";
const BLACKLIST_COLLECTION = process.env.BLACKLIST_COLLECTION || "blacklisted_plates";
const DETECTIONS_COLLECTION = process.env.DETECTIONS_COLLECTION || "detections";

let pool;

function tableRef(tableName) {
  return `"${DB_SCHEMA}"."${tableName}"`;
}

async function connectDb() {
  if (pool) return pool;

  pool = new Pool({ connectionString: POSTGRES_URL });
  await pool.query("SELECT 1");
  await ensureSchema();

  return pool;
}

async function ensureSchema() {
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

async function getBlacklistCollection() {
  await connectDb();
  return BLACKLIST_COLLECTION;
}

async function getDetectionsCollection() {
  await connectDb();
  return DETECTIONS_COLLECTION;
}

async function closeDb() {
  if (!pool) return;
  await pool.end();
  pool = null;
}

module.exports = {
  connectDb,
  getBlacklistCollection,
  getDetectionsCollection,
  closeDb,
  tableRef,
  POSTGRES_URL,
  DB_SCHEMA,
  BLACKLIST_COLLECTION,
  DETECTIONS_COLLECTION,
};
