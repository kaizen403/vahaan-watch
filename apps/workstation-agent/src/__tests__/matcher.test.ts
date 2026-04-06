import { describe, expect, it } from "vitest";
import { PlateMatcher } from "../detection/matcher.js";
import type { DbClient } from "../db/client.js";
import type { LocalHitlistEntry } from "../types.js";

function createEntry(overrides: Partial<LocalHitlistEntry> = {}): LocalHitlistEntry {
  return {
    id: "entry-1",
    hitlistId: "hitlist-1",
    plateOriginal: "KA01 AB 1234",
    plateNormalized: "KA01AB1234",
    countryOrRegion: null,
    priority: "high",
    status: "active",
    validFrom: null,
    validUntil: null,
    reasonSummary: "Stolen vehicle",
    vehicleMake: null,
    vehicleModel: null,
    vehicleColor: null,
    metadata: null,
    syncedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("PlateMatcher", () => {
  it("normalizes plates consistently", () => {
    expect(PlateMatcher.normalizePlate("ka 01-ab.1234")).toBe("KA01AB1234");
    expect(PlateMatcher.normalizePlate(" test 123 ")).toBe("TEST123");
  });

  it("normalizes plate using canonical [^A-Z0-9] form", () => {
    expect(PlateMatcher.normalizePlate("AB-12.3 C")).toBe("AB123C");
  });

  it("returns matched results from the backing store", () => {
    const entries = [createEntry()];
    const db = {
      findMatchingEntries: (plateNormalized: string) =>
        plateNormalized === "KA01AB1234" ? entries : [],
    } as unknown as DbClient;

    const matcher = new PlateMatcher(db);
    const result = matcher.match("KA 01-AB 1234");

    expect(result).toEqual({
      matched: true,
      entries,
      normalizedPlate: "KA01AB1234",
    });
  });

  it("reports non-matches with a normalized plate", () => {
    const db = {
      findMatchingEntries: () => [],
    } as unknown as DbClient;

    const matcher = new PlateMatcher(db);
    const result = matcher.match("mh 12 xx 9999");

    expect(result).toEqual({
      matched: false,
      entries: [],
      normalizedPlate: "MH12XX9999",
    });
  });

  describe("fuzzy matching", () => {
    it("does NOT do fuzzy match when disabled (default)", () => {
      const db = {
        findMatchingEntries: (plate: string) =>
          plate === "AB0123C" ? [createEntry({ plateNormalized: "AB0123C" })] : [],
      } as unknown as DbClient;
      const matcher = new PlateMatcher(db);
      const result = matcher.match("ABO123C");
      expect(result.matched).toBe(false);
      expect(result.fuzzyMatch).toBeUndefined();
    });

    it("corrects O→0 confusion when fuzzy enabled", () => {
      const db = {
        findMatchingEntries: (plate: string) =>
          plate === "AB0123C" ? [createEntry({ plateNormalized: "AB0123C" })] : [],
      } as unknown as DbClient;
      const matcher = new PlateMatcher(db, true);
      const result = matcher.match("ABO123C");
      expect(result.matched).toBe(true);
      expect(result.fuzzyMatch).toBe(true);
    });

    it("prefers exact match over fuzzy match", () => {
      const exactEntry = createEntry({ plateNormalized: "ABO123C" });
      const fuzzyEntry = createEntry({ plateNormalized: "AB0123C" });
      const db = {
        findMatchingEntries: (plate: string) => {
          if (plate === "ABO123C") return [exactEntry];
          if (plate === "AB0123C") return [fuzzyEntry];
          return [];
        },
      } as unknown as DbClient;
      const matcher = new PlateMatcher(db, true);
      const result = matcher.match("ABO123C");
      expect(result.matched).toBe(true);
      expect(result.fuzzyMatch).toBeUndefined();
      expect(result.entries).toEqual([exactEntry]);
    });

    it("corrects 1→I confusion when fuzzy enabled", () => {
      const db = {
        findMatchingEntries: (plate: string) =>
          plate === "AB1234" ? [createEntry({ plateNormalized: "AB1234" })] : [],
      } as unknown as DbClient;
      const matcher = new PlateMatcher(db, true);
      const result = matcher.match("ABI234");
      expect(result.matched).toBe(true);
      expect(result.fuzzyMatch).toBe(true);
    });
  });
});
