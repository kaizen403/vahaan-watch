import { DbClient } from "../db/client.js";
import { createLogger } from "../logger.js";
import type { MatchResult } from "../types.js";

const logger = createLogger("plate-matcher");

// OCR character confusion pairs — single substitution only
const OCR_CONFUSION_MAP: Record<string, string[]> = {
  "0": ["O"],
  "O": ["0"],
  "1": ["I", "L"],
  "I": ["1"],
  "L": ["1"],
  "5": ["S"],
  "S": ["5"],
  "8": ["B"],
  "B": ["8"],
  "2": ["Z"],
  "Z": ["2"],
};

function generateFuzzyVariants(plate: string): string[] {
  const variants = new Set<string>();
  for (let i = 0; i < plate.length; i++) {
    const char = plate[i];
    const substitutions = OCR_CONFUSION_MAP[char];
    if (substitutions) {
      for (const sub of substitutions) {
        variants.add(plate.slice(0, i) + sub + plate.slice(i + 1));
      }
    }
  }
  return [...variants];
}

export class PlateMatcher {
  public constructor(
    private readonly db: DbClient,
    private readonly fuzzyMatchEnabled: boolean = false,
  ) {}

  public match(plateNormalized: string): MatchResult {
    const normalizedPlate = PlateMatcher.normalizePlate(plateNormalized);
    const entries = normalizedPlate ? this.db.findMatchingEntries(normalizedPlate) : [];

    if (entries.length > 0) {
      const result: MatchResult = {
        matched: true,
        entries,
        normalizedPlate,
      };
      logger.debug("plate match evaluated", { normalizedPlate, matched: true, entryCount: entries.length });
      return result;
    }

    if (this.fuzzyMatchEnabled && normalizedPlate) {
      const variants = generateFuzzyVariants(normalizedPlate);
      for (const variant of variants) {
        const variantEntries = this.db.findMatchingEntries(variant);
        if (variantEntries.length > 0) {
          logger.debug("fuzzy plate match", { normalizedPlate, variant, entryCount: variantEntries.length });
          return {
            matched: true,
            entries: variantEntries,
            normalizedPlate,
            fuzzyMatch: true,
          };
        }
      }
    }

    logger.debug("plate match evaluated", { normalizedPlate, matched: false, entryCount: 0 });
    return { matched: false, entries: [], normalizedPlate };
  }

  public static normalizePlate(raw: string): string {
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  }
}
