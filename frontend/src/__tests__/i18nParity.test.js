import { describe, expect, it } from "vitest";
import { TRANSLATIONS } from "../i18n/translations";

function collectLeafKeys(obj, prefix = "") {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...collectLeafKeys(value, fullKey));
    } else {
      keys.push([fullKey, value]);
    }
  }
  return keys;
}

describe("i18n English / Khmer translation parity", () => {
  it("keeps identical key sets and non-empty string values in en and km dictionaries", () => {
    const enEntries = collectLeafKeys(TRANSLATIONS.en);
    const kmEntries = collectLeafKeys(TRANSLATIONS.km);

    const enMap = new Map(enEntries);
    const kmMap = new Map(kmEntries);

    const missingInKm = [...enMap.keys()].filter((k) => !kmMap.has(k));
    const extraInKm = [...kmMap.keys()].filter((k) => !enMap.has(k));

    expect(missingInKm).toEqual([]);
    expect(extraInKm).toEqual([]);

    for (const [key, value] of enEntries) {
      expect(typeof value, `en.${key} should be string`).toBe("string");
      expect(value.trim().length, `en.${key} should not be empty`).toBeGreaterThan(0);
    }
    for (const [key, value] of kmEntries) {
      expect(typeof value, `km.${key} should be string`).toBe("string");
      expect(value.trim().length, `km.${key} should not be empty`).toBeGreaterThan(0);
    }
  });
});
