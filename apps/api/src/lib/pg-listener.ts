import pg from "pg";
import { createLogger } from "./logger.js";

const { Client } = pg;
const logger = createLogger("pg-listener");

export async function createPgListener(
  connectionString: string,
  channels: string[],
  onNotify: (channel: string, payload: string) => void,
): Promise<() => Promise<void>> {
  const client = new Client({ connectionString });
  await client.connect();
  for (const ch of channels) {
    await client.query(`LISTEN "${ch}"`);
  }
  client.on("notification", (msg) => {
    onNotify(msg.channel, msg.payload ?? "");
  });
  client.on("error", (err) => {
    logger.warn({ err }, "pg listener error");
  });
  logger.info({ channels }, "pg listener connected");
  return async () => {
    await client.end();
    logger.info("pg listener disconnected");
  };
}
