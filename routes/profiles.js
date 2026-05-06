"use strict";

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { query } = require("../db");
const { fetchGenderize, fetchAgify, fetchNationalize, getAgeGroup } = require("../helpers");
const { requireAuth, requireRole } = require("../middleware/auth");
const { getCache, setCache } = require("../lib/cache");
const { normalizeQuery } = require("../lib/normalize"); // Part 2
const router = express.Router();

const COUNTRY_NAMES = {
  NG:"Nigeria",GH:"Ghana",KE:"Kenya",ET:"Ethiopia",TZ:"Tanzania",
  UG:"Uganda",ZA:"South Africa",EG:"Egypt",MA:"Morocco",US:"United States",
  GB:"United Kingdom",CA:"Canada",AU:"Australia",DE:"Germany",FR:"France",
  BR:"Brazil",IN:"India",CN:"China",JP:"Japan",MX:"Mexico",IT:"Italy",
  ES:"Spain",RU:"Russia",ID:"Indonesia",PK:"Pakistan",BD:"Bangladesh",
  AR:"Argentina",CO:"Colombia",DZ:"Algeria",SD:"Sudan",SN:"Senegal",
};

const COUNTRY_MAP = {
  nigeria:"NG",ghana:"GH",kenya:"KE",ethiopia:"ET",tanzania:"TZ",
  uganda:"UG","south africa":"ZA",egypt:"EG",morocco:"MA",usa:"US",
  "united states":"US",uk:"GB","united kingdom":"GB",canada:"CA",
  australia:"AU",germany:"DE",france:"FR",brazil:"BR",india:"IN",
  china:"CN",japan:"JP",mexico:"MX",italy:"IT",spain:"ES",russia:"RU",
  indonesia:"ID",pakistan:"PK",bangladesh:"BD",argentina:"AR",
  colombia:"CO",algeria:"DZ",sudan:"SD",senegal:"SN",
};

const VALID_SORT  = ["age", "created_at", "gender_probability"];
const VALID_ORDER = ["asc", "desc"];

function parseNaturalQuery(q) {
  const text = q.toLowerCase().trim();
  const filters = {};
  let matched = false;
  if (/\bmales?\b/.test(text))        { filters.gender = "male";      matched = true; }
  if (/\bfemales?\b/.test(text))      { filters.gender = "female";    matched = true; }
  if (/\bchild(ren)?\b/.test(text))   { filters.age_group = "child";    matched = true; }
  if (/\bteen(ager)?s?\b/.test(text)) { filters.age_group = "teenager"; matched = true; }
  if (/\badults?\b/.test(text))       { filters.age_group = "adult";    matched = true; }
  if (/\bseniors?\b/.test(text))      { filters.age_group = "senior";   matched = true; }
  if (/\byoung\b/.test(text))         { filters.min_age = 16; filters.max_age = 24; matched = true; }
  const above = text.match(/above\s+(\d+)/);
  if (above) { filters.min_age = parseInt(above[1]); matched = true; }
  const below = text.match(/below\s+(\d+)/);
  if (below) { filters.max_age = parseInt(below[1]); matched = true; }
  const older = text.match(/older\s+than\s+(\d+)/);
  if (older) { filters.min_age = parseInt(older[1]); matched = true; }
  const younger = text.match(/younger\s+than\s+(\d+)/);
  if (younger) { filters.max_age = parseInt(younger[1]); matched = true; }
  for (const [name, code] of Object.entries(COUNTRY_MAP)) {
    if (text.includes(name)) { filters.country_id = code; matched = true; break; }
  }
  return matched ? filters : null;
}

function validateAndBuildQuery(params, countOnly = false) {
  const {
    gender, age_group, country_id,
    min_age, max_age,
    min_gender_probability, min_country_probability,
    sort_by, order, page, limit,
  } = params;

  if (sort_by && !VALID_SORT.includes(sort_by))
    throw { status: 400, message: "Invalid query parameters" };
  if (order && !VALID_ORDER.includes(order.toLowerCase()))
    throw { status: 400, message: "Invalid query parameters" };
  if (page  && (isNaN(Number(page))  || Number(page)  < 1)) throw { status: 400, message: "Invalid query parameters" };
  if (limit && (isNaN(Number(limit)) || Number(limit) < 1)) throw { status: 400, message: "Invalid query parameters" };
  if (min_age && isNaN(Number(min_age))) throw { status: 400, message: "Invalid query parameters" };
  if (max_age && isNaN(Number(max_age))) throw { status: 400, message: "Invalid query parameters" };
  if (min_gender_probability  && isNaN(Number(min_gender_probability)))  throw { status: 400, message: "Invalid query parameters" };
  if (min_country_probability && isNaN(Number(min_country_probability))) throw { status: 400, message: "Invalid query parameters" };

  const conditions = ["1=1"];
  const qParams = [];
  let i = 1;

  if (gender)     { conditions.push(`LOWER(gender) = LOWER($${i++})`);     qParams.push(gender); }
  if (age_group)  { conditions.push(`LOWER(age_group) = LOWER($${i++})`);  qParams.push(age_group); }
  if (country_id) { conditions.push(`LOWER(country_id) = LOWER($${i++})`); qParams.push(country_id); }
  if (min_age)    { conditions.push(`age >= $${i++}`);    qParams.push(Number(min_age)); }
  if (max_age)    { conditions.push(`age <= $${i++}`);    qParams.push(Number(max_age)); }
  if (min_gender_probability)  { conditions.push(`gender_probability >= $${i++}`);  qParams.push(Number(min_gender_probability)); }
  if (min_country_probability) { conditions.push(`country_probability >= $${i++}`); qParams.push(Number(min_country_probability)); }

  const where = conditions.join(" AND ");

  if (countOnly) return { sql: `SELECT COUNT(*) as total FROM profiles WHERE ${where}`, params: qParams };

  const sortCol  = VALID_SORT.includes(sort_by) ? sort_by : "created_at";
  const sortDir  = order && VALID_ORDER.includes(order.toLowerCase()) ? order.toUpperCase() : "DESC";
  const pageNum  = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
  const offset   = (pageNum - 1) * limitNum;
  


//(fast — only fetch what the client needs)
const sql = `
  SELECT
    id, name, gender, gender_probability,
    age, age_group, country_id, country_name,
    country_probability, created_at
  FROM profiles
  WHERE ${where}
  ORDER BY ${sortCol} ${sortDir}
  LIMIT $${i} OFFSET $${i + 1}
`;
  
  qParams.push(limitNum, offset);
  return { sql, params: qParams, pageNum, limitNum };
}

// POST /api/v1/profiles
router.post("/", async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || (typeof name === "string" && name.trim() === ""))
      return res.status(400).json({ status: "error", message: "Query parameter 'name' is required and cannot be empty" });
    if (typeof name !== "string")
      return res.status(422).json({ status: "error", message: "Query parameter 'name' must be a string" });

    const cleanName = name.trim();
    const existing = await query("SELECT * FROM profiles WHERE LOWER(name) = LOWER($1)", [cleanName]);
    if (existing.rows.length > 0)
      return res.status(200).json({ status: "success", message: "Profile already exists", data: existing.rows[0] });

    let genderData, ageData, nationalityData;
    try { genderData = await fetchGenderize(cleanName); }
    catch { return res.status(502).json({ status: "error", message: "Genderize returned an invalid response" }); }
    try { ageData = await fetchAgify(cleanName); }
    catch { return res.status(502).json({ status: "error", message: "Agify returned an invalid response" }); }
    try { nationalityData = await fetchNationalize(cleanName); }
    catch { return res.status(502).json({ status: "error", message: "Nationalize returned an invalid response" }); }

    const profile = {
      id: uuidv4(), name: cleanName,
      gender: genderData.gender,
      gender_probability: genderData.gender_probability,
      sample_size: genderData.sample_size,
      age: ageData.age,
      age_group: getAgeGroup(ageData.age),
      country_id: nationalityData.country_id,
      country_name: COUNTRY_NAMES[nationalityData.country_id] || nationalityData.country_id,
      country_probability: nationalityData.country_probability,
      created_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    };

    await query(
      `INSERT INTO profiles (id,name,gender,gender_probability,sample_size,age,age_group,country_id,country_name,country_probability,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [profile.id,profile.name,profile.gender,profile.gender_probability,profile.sample_size,
       profile.age,profile.age_group,profile.country_id,profile.country_name,
       profile.country_probability,profile.created_at]
    );
    return res.status(201).json({ status: "success", data: profile });
  } catch (err) {
    console.error("POST /profiles error:", err.message);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
});
//temporary caching for development
router.get("/", async (req, res) => {
  console.time("profiles-query");

  const cacheKey = `profiles:${normalizeQuery(req.query)}`;
  const cached = await getCache(cacheKey);

  if (cached) {
    console.timeEnd("profiles-query"); // expect ~2-5ms
    return res.status(200).json(cached);
  }

  // DB query
  const result = await runQuery(req.query);
  await setCache(cacheKey, result);

  console.timeEnd("profiles-query"); // expect ~100-400ms first time
  return res.status(200).json(result);
});
const { normalizeQuery } = require("../lib/normalize");
const { getCache, setCache } = require("../lib/cache");

router.get("/", async (req, res) => {
  // Generate deterministic cache key
  const cacheKey = `profiles:${normalizeQuery(req.query)}`;

  const cached = await getCache(cacheKey);
  if (cached) return res.status(200).json(cached);

  // ... DB query ...
  await setCache(cacheKey, result);
  return res.status(200).json(result);
});
// GET /api/v1/profiles/search
router.get("/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === "")
      return res.status(400).json({ status: "error", message: "Invalid query parameters" });
    const filters = parseNaturalQuery(q);
    if (!filters)
      return res.status(200).json({ status: "error", message: "Unable to interpret query" });
    const merged = { ...filters, page: req.query.page, limit: req.query.limit };
    const { sql, params: p, pageNum, limitNum } = validateAndBuildQuery(merged);
    const { sql: cSql, params: cP } = validateAndBuildQuery(filters, true);
    const [result, countResult] = await Promise.all([query(sql, p), query(cSql, cP)]);
    return res.status(200).json({
      status: "success", page: pageNum, limit: limitNum,
      total: parseInt(countResult.rows[0].total), data: result.rows,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ status: "error", message: err.message });
    return res.status(500).json({ status: "error", message: "Search failed" });
  }
});

// GET /api/v1/profiles/export (admin only)
router.get("/export", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { sql, params: p } = validateAndBuildQuery({ ...req.query, limit: "10000", page: "1" });
    const result = await query(sql, p);
    const rows = result.rows;
    const headers = ["id","name","gender","gender_probability","age","age_group","country_id","country_name","country_probability","created_at"];
    const csv = [
      headers.join(","),
      ...rows.map(row =>
        headers.map(h => {
          const val = row[h] === null || row[h] === undefined ? "" : String(row[h]);
          return val.includes(",") ? `"${val}"` : val;
        }).join(",")
      ),
    ].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=profiles.csv");
    return res.status(200).send(csv);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ status: "error", message: err.message });
    return res.status(500).json({ status: "error", message: "Export failed" });
  }
});

// GET /api/v1/profiles

router.get("/", async (req, res) => {
  try {
    const cacheKey = `profiles:${normalizeQuery(req.query)}`;

    // Check cache first
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    // ... your existing DB query logic ...
    const result = { status: "success", page, limit, total, data };

    // Store in cache
    await setCache(cacheKey, result);

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ status: "error", message: "Failed" });
  }
});
router.get("/", async (req, res) => {
  try {
    const { sql, params: p, pageNum, limitNum } = validateAndBuildQuery(req.query);
    const { sql: cSql, params: cP } = validateAndBuildQuery(req.query, true);
    const [result, countResult] = await Promise.all([query(sql, p), query(cSql, cP)]);
    return res.status(200).json({
      status: "success", page: pageNum, limit: limitNum,
      total: parseInt(countResult.rows[0].total), data: result.rows,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ status: "error", message: err.message });
    return res.status(500).json({ status: "error", message: "Failed to retrieve profiles" });
  }
});

// GET /api/v1/profiles/:id
router.get("/:id", async (req, res) => {
  try {
    const result = await query("SELECT * FROM profiles WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0)
      return res.status(404).json({ status: "error", message: "Profile not found" });
    return res.status(200).json({ status: "success", data: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ status: "error", message: "Failed to retrieve profile" });
  }
});

// DELETE /api/v1/profiles/:id (admin only)
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const existing = await query("SELECT id FROM profiles WHERE id = $1", [req.params.id]);
    if (existing.rows.length === 0)
      return res.status(404).json({ status: "error", message: "Profile not found" });
    await query("DELETE FROM profiles WHERE id = $1", [req.params.id]);
    return res.status(204).end();
  } catch (err) {
    return res.status(500).json({ status: "error", message: "Failed to delete profile" });
  }
});

module.exports = router;