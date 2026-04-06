import { DbClient } from "../db/client.js";
import { createLogger } from "../logger.js";
import type { MatchResult } from "../types.js";

const logger = createLogger("plate-matcher");

export class PlateMatcher {
  public constructor(private readonly db: DbClient) {}

  public match(plateNormalized: string): MatchResult {
    const normalizedPlate = PlateMatcher.normalizePlate(plateNormalized);
    const entries = this.db.findMatchingEntries(normalizedPlate);
    const result: MatchResult = {
      matched: entries.length > 0,
      entries,
      normalizedPlate,
    };

    logger.debug("plate match evaluated", {
      normalizedPlate,
      matched: result.matched,
      entryCount: entries.length,
    });

    return result;
  }

  public static normalizePlate(raw: string): string {
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  }
}
