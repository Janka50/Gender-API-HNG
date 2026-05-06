"use strict";

/**
 * Normalize query filters into a deterministic cache key string.
 * Input:  { country: "Nigeria", gender: "Female", age_min: 20, page: 1 }
 * Output: "age_min:20|country:nigeria|gender:female|page:1"
 */
function normalizeQuery(filters = {}) {
  const VALID_KEYS = [
    "gender", "age_group", "country_id",
    "min_age", "max_age",
    "min_gender_probability", "min_country_probability",
    "sort_by", "order", "page", "limit"
  ];

  const normalized = {};

  for (const key of VALID_KEYS) {
    const val = filters[key];
    if (val !== undefined && val !== null && val !== "") {
      // Lowercase string values, keep numbers as-is
      normalized[key] = typeof val === "string"
        ? val.toLowerCase().trim()
        : String(val);
    }
  }

  // Sort keys alphabetically for deterministic output
  return Object.keys(normalized)
    .sort()
    .map(k => `${k}:${normalized[k]}`)
    .join("|") || "all";
}

module.exports = { normalizeQuery };