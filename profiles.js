"use strict";

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { query } = require("../db");
const { fetchGenderize, fetchAgify, fetchNationalize, getAgeGroup } = require("../helpers");

const router = express.Router();

// ── Country mapping ───────────────────────────────────────────────────────────
const COUNTRY_MAP = {
  nigeria: "NG", ghana: "GH", kenya: "KE", ethiopia: "ET", tanzania: "TZ",
  uganda: "UG", southafrica: "ZA", "south africa": "ZA", egypt: "EG",
  morocco: "MA", usa: "US", "united states": "US", uk: "GB",
  "united kingdom": "GB", canada: "CA", australia: "AU", germany: "DE",
  france: "FR", brazil: "BR", india: "IN", china: "CN", japan: "JP",
  mexico: "MX", italy: "IT", spain: "ES", russia: "RU", indonesia: "ID",
  pakistan: "PK", bangladesh: "BD", argentina: "AR", colombia: "CO",
  algeria: "DZ", sudan: "SD", iraq: "IQ", ukraine: "UA", poland: "PL",
  senegal: "SN", mali: "ML", niger: "NE", cameroon: "CM", zimbabwe: "ZW",
};

const COUNTRY_NAMES = {
  NG: "Nigeria", GH: "Ghana", KE: "Kenya", ET: "Ethiopia", TZ: "Tanzania",
  UG: "Uganda", ZA: "South Africa", EG: "Egypt", MA: "Morocco", US: "United States",
  GB: "United Kingdom", CA: "Canada", AU: "Australia", DE: "Germany", FR: "France",
  BR: "Brazil", IN: "India", CN: "China", JP: "Japan", MX: "Mexico",
  IT: "Italy", ES: "Spain", RU: "Russia", ID: "Indonesia", PK: "Pakistan",
  BD: "Bangladesh", AR: "Argentina", CO: "Colombia", DZ: "Algeria", SD: "Sudan",
  IQ: "Iraq", UA: "Ukraine", PL: "Poland", SN: "Senegal", ML: "Mali",
  NE: "Niger", CM: "Cameroon", ZW: "Zimbabwe",
};

// ── Natural language parser ───────────────────────────────────────────────────
function parseNaturalQuery(q) {
  const text = q.toLowerCase().trim();
  const filters = {};
  let matched = false;

  // Gender
  if (/\bmales?\b/.test(text))   { filters.gender = "male";   matched = true; }
  if (/\bfemales?\b/.test(text)) { filters.gender = "female"; matched = true; }

  // Age group keywords
  if (/\bchild(ren)?\b/.test(text))   { filters.age_group = "child";    matched = true; }
  if (/\bteen(ager)?s?\b/.test(text)) { filters.age_group = "teenager"; matched = true; }
  if (/\badults?\b/.test(text))       { filters.age_group = "adult";    matched = true; }
  if (/\bseniors?\b/.test(text))      { filters.age_group = "senior";   matched = true; }

  // "young" → age 16–24
  if (/\byoung\b/.test(text)) {
    filters.min_age = 16;
    filters.max_age = 24;
    matched = true;
  }

  // "above X"
  const aboveMatch = text.match(/above\s+(\d+)/);
  if (aboveMatch) { filters.min_age = parseInt(aboveMatch[1]); matched = true; }

  // "below X"
  const belowMatch = text.match(/below\s+(\d+)/);
  if (belowMatch) { filters.max_age = parseInt(belowMatch[1]); matched = true; }

  // "older than X"
  const olderMatch = text.match(/older\s+than\s+(\d+)/);
  if (olderMatch) { filters.min_age = parseInt(olderMatch[1]); matched = true; }

  // "younger than X"
  const youngerMatch = text.match(/younger\s+than\s+(\d+)/);
  if (youngerMatch) { filters.max_age = parseInt(youngerMatch[1]); matched = true; }

  // Country — check all known country names
  for (const [name, code] of Object.entries(COUNTRY_MAP)) {
    if (text.includes(name)) {
      filters.country_id = code;
      matched = true;
      break;
    }
  }

  if (!matched) return null;
  return filters;
}

// ── SQL query builder ─────────────────────────────────────────────────────────
function buildProfilesQuery(queryParams, countOnly = false) {
  const {
    gender, age_group, country_id,
    min_age, max_age,
    min_gender_probability, min_country_probability,
    sort_by, order,
    page, limit,
  } = queryParams;

  const VALID_SORT = ["age", "created_at", "gender_probability"];
  const VALID_ORDER = ["asc", "desc"];

  // Validate sort params
  if (sort_by && !VALID_SORT.includes(sort_by)) {
    throw { status: 400, message: `Invalid sort_by. Must be one of: ${VALID_SORT.join(", ")}` };
  }
  if (order && !VALID_ORDER.includes(order.toLowerCase())) {
    throw { status: 400, message: "Invalid order. Must be asc or desc" };
  }

  const conditions = ["1=1"];
  const params = [];
  let i = 1;

  if (gender)     { conditions.push(`LOWER(gender) = LOWER($${i++})`);     params.push(gender); }
  if (age_group)  { conditions.push(`LOWER(age_group) = LOWER($${i++})`);  params.push(age_group); }
  if (country_id) { conditions.push(`LOWER(country_id) = LOWER($${i++})`); params.push(country_id); }
  if (min_age)    { conditions.push(`age >= $${i++}`);                      params.push(Number(min_age)); }
  if (max_age)    { conditions.push(`age <= $${i++}`);                      params.push(Number(max_age)); }
  if (min_gender_probability)  { conditions.push(`gender_probability >= $${i++}`);  params.push(Number(min_gender_probability)); }
  if (min_country_probability) { conditions.push(`country_probability >= $${i++}`); params.push(Number(min_country_probability)); }

  const where = conditions.join(" AND ");

  if (countOnly) {
    return { sql: `SELECT COUNT(*) as total FROM profiles WHERE ${where}`, params };
  }

  const sortCol  = VALID_SORT.includes(sort_by) ? sort_by : "created_at";
  const sortDir  = order && VALID_ORDER.includes(order.toLowerCase()) ? order.toUpperCase() : "DESC";
  const pageNum  = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
  const offset   = (pageNum - 1) * limitNum;

  const sql = `
    SELECT id, name, gender, gender_probability, age, age_group,
           country_id, country_name, country_probability, created_at
    FROM profiles
    WHERE ${where}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT $${i++} OFFSET $${i++}
  `;
  params.push(limitNum, offset);

  return { sql, params, pageNum, limitNum };
}

// ── POST /api/profiles ────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const { name } = req.body || {};

  if (name === undefined || name === null || (typeof name === "string" && name.trim() === "")) {
    return res.status(400).json({ status: "error", message: "Query parameter 'name' is required and cannot be empty" });
  }
  if (typeof name !== "string") {
    return res.status(422).json({ status: "error", message: "Query parameter 'name' must be a string" });
  }

  const cleanName = name.trim();

  const existing = await query("SELECT * FROM profiles WHERE LOWER(name) = LOWER($1)", [cleanName]);
  if (existing.rows.length > 0) {
    return res.status(200).json({ status: "success", message: "Profile already exists", data: existing.rows[0] });
  }

  let genderData, ageData, nationalityData;

  try { genderData = await fetchGenderize(cleanName); }
  catch { return res.status(502).json({ status: "error", message: "Genderize returned an invalid response" }); }

  try { ageData = await fetchAgify(cleanName); }
  catch { return res.status(502).json({ status: "error", message: "Agify returned an invalid response" }); }

  try { nationalityData = await fetchNationalize(cleanName); }
  catch { return res.status(502).json({ status: "error", message: "Nationalize returned an invalid response" }); }

  const country_name = COUNTRY_NAMES[nationalityData.country_id] || nationalityData.country_id;

  const profile = {
    id: uuidv4(),
    name: cleanName,
    gender: genderData.gender,
    gender_probability: genderData.gender_probability,
    sample_size: genderData.sample_size,
    age: ageData.age,
    age_group: getAgeGroup(ageData.age),
    country_id: nationalityData.country_id,
    country_name,
    country_probability: nationalityData.country_probability,
    created_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };

  try {
    await query(
      `INSERT INTO profiles
        (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_name, country_probability, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [profile.id, profile.name, profile.gender, profile.gender_probability, profile.sample_size,
       profile.age, profile.age_group, profile.country_id, profile.country_name,
       profile.country_probability, profile.created_at]
    );
  } catch {
    return res.status(500).json({ status: "error", message: "Failed to save profile to database" });
  }

  return res.status(201).json({ status: "success", data: profile });
});

// ── GET /api/profiles/search ──────────────────────────────────────────────────
router.get("/search", async (req, res) => {
  const { q } = req.query;

  if (!q || q.trim() === "") {
    return res.status(400).json({ status: "error", message: "Query parameter 'q' is required" });
  }

  const filters = parseNaturalQuery(q);
  if (!filters) {
    return res.status(200).json({ status: "error", message: "Unable to interpret query" });
  }

  try {
    const { sql, params, pageNum, limitNum } = buildProfilesQuery({ ...filters, ...req.query });
    const { sql: countSql, params: countParams } = buildProfilesQuery({ ...filters }, true);

    const [result, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, countParams),
    ]);

    const total = parseInt(countResult.rows[0].total);

    return res.status(200).json({
      status: "success",
      page: pageNum,
      limit: limitNum,
      total,
      data: result.rows,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ status: "error", message: err.message });
    return res.status(500).json({ status: "error", message: "Failed to search profiles" });
  }
});

// ── GET /api/profiles ─────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { sql, params, pageNum, limitNum } = buildProfilesQuery(req.query);
    const { sql: countSql, params: countParams } = buildProfilesQuery(req.query, true);

    const [result, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, countParams),
    ]);

    const total = parseInt(countResult.rows[0].total);

    return res.status(200).json({
      status: "success",
      page: pageNum,
      limit: limitNum,
      total,
      data: result.rows,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ status: "error", message: err.message });
    return res.status(500).json({ status: "error", message: "Failed to retrieve profiles" });
  }
});

// ── GET /api/profiles/:id ─────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const result = await query("SELECT * FROM profiles WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ status: "error", message: "Profile not found" });
    return res.status(200).json({ status: "success", data: result.rows[0] });
  } catch {
    return res.status(500).json({ status: "error", message: "Failed to retrieve profile" });
  }
});

// ── DELETE /api/profiles/:id ──────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const existing = await query("SELECT id FROM profiles WHERE id = $1", [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ status: "error", message: "Profile not found" });
    await query("DELETE FROM profiles WHERE id = $1", [req.params.id]);
    return res.status(204).end();
  } catch {
    return res.status(500).json({ status: "error", message: "Failed to delete profile" });
  }
});

module.exports = router;
