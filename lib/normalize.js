"use strict";

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
      normalized[key] = typeof val === "string"
        ? val.toLowerCase().trim()
        : String(val);
    }
  }

  return Object.keys(normalized)
    .sort()
    .map(k => `${k}:${normalized[k]}`)
    .join("|") || "all";
}

module.exports = { normalizeQuery };