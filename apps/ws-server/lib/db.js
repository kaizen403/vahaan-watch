const { MongoClient } = require("mongodb");

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.DB_NAME || "carmen_anpr";
const BLACKLIST_COLLECTION = process.env.BLACKLIST_COLLECTION || "blacklisted_plates";
const DETECTIONS_COLLECTION = process.env.DETECTIONS_COLLECTION || "detections";

let client;
let db;

async function connectDb() {
  if (db) return db;

  client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);

  return db;
}

async function getBlacklistCollection() {
  const activeDb = await connectDb();
  const collection = activeDb.collection(BLACKLIST_COLLECTION);

  await collection.createIndex({ plateHash: 1 }, { unique: true });
  await collection.createIndex({ createdAt: -1 });

  return collection;
}

async function getDetectionsCollection() {
  const activeDb = await connectDb();
  const collection = activeDb.collection(DETECTIONS_COLLECTION);

  await collection.createIndex({ detectedAt: -1 });
  await collection.createIndex({ plateHash: 1, detectedAt: -1 });

  return collection;
}

async function closeDb() {
  if (!client) return;
  await client.close();
  client = null;
  db = null;
}

module.exports = {
  connectDb,
  getBlacklistCollection,
  getDetectionsCollection,
  closeDb,
  MONGO_URI,
  DB_NAME,
  BLACKLIST_COLLECTION,
  DETECTIONS_COLLECTION,
};
