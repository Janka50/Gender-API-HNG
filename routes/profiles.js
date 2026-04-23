"use strict";

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { query } = require("../db");
const { fetchGenderize, fetchAgify, fetchNationalize, getAgeGroup } = require("../helpers");

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

function buildQuery(params, countOnly = false) {
  const VALID_SORT = ["age", "created_at", "gender_probability"];
  const VALID_ORDER = ["asc", "desc"];
  const { gender, age_group, country_id, min_age, max_age,
          min_gender_probability, min_country_probability,
          sort_by, order, page, limit } = params;
  if (sort_by && !VALID_SORT.includes(sort_by))
    throw { status: 400, message: "Invalid sort_by. Must be: age, created_at, gender_probability" };
  if (order && !VALID_ORDER.includes(order.toLowerCase()))
    throw { status: 400, message: "Invalid order. Must be asc or desc" };
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
  const sql = `SELECT id, name, gender, gender_probability, age, age_group, country_id, country_name, country_probability, created_at FROM profiles WHERE ${where} ORDER BY ${sortCol} ${sortDir} LIMIT $${i++} OFFSET $${i++}`;
  qParams.push(limitNum, offset);
  return { sql, params: qParams, pageNum, limitNum };
}

router.post("/", async (req, res) => {
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
    id: uuidv4(),
    name: cleanName,
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
  try {
    await query(
      `INSERT INTO profiles (id,name,gender,gender_probability,sample_size,age,age_group,country_id,country_name,country_probability,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [profile.id,profile.name,profile.gender,profile.gender_probability,profile.sample_size,profile.age,profile.age_group,profile.country_id,profile.country_name,profile.country_probability,profile.created_at]
    );
  } catch { return res.status(500).json({ status: "error", message: "Failed to save profile" }); }
  return res.status(201).json({ status: "success", data: profile });
});

router.get("/search", async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim() === "")
    return res.status(400).json({ status: "error", message: "Query parameter 'q' is required" });
  const filters = parseNaturalQuery(q);
  if (!filters)
    return res.status(200).json({ status: "error", message: "Unable to interpret query" });
  try {
    const { sql, params: p, pageNum, limitNum } = buildQuery({ ...filters, ...req.query });
    const { sql: cSql, params: cP } = buildQuery({ ...filters }, true);
    const [result, countResult] = await Promise.all([query(sql, p), query(cSql, cP)]);
    return res.status(200).json({ status: "success", page: pageNum, limit: limitNum, total: parseInt(countResult.rows[0].total), data: result.rows });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ status: "error", message: err.message });
    return res.status(500).json({ status: "error", message: "Search failed" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { sql, params: p, pageNum, limitNum } = buildQuery(req.query);
    const { sql: cSql, params: cP } = buildQuery(req.query, true);
    const [result, countResult] = await Promise.all([query(sql, p), query(cSql, cP)]);
    return res.status(200).json({ status: "success", page: pageNum, limit: limitNum, total: parseInt(countResult.rows[0].total), data: result.rows });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ status: "error", message: err.message });
    return res.status(500).json({ status: "error", message: "Failed to retrieve profiles" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const result = await query("SELECT * FROM profiles WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0)
      return res.status(404).json({ status: "error", message: "Profile not found" });
    return res.status(200).json({ status: "success", data: result.rows[0] });
  } catch { return res.status(500).json({ status: "error", message: "Failed to retrieve profile" }); }
});

router.delete("/:id", async (req, res) => {
  try {
    const existing = await query("SELECT id FROM profiles WHERE id = $1", [req.params.id]);
    if (existing.rows.length === 0)
      return res.status(404).json({ status: "error", message: "Profile not found" });
    await query("DELETE FROM profiles WHERE id = $1", [req.params.id]);
    return res.status(204).end();
  } catch { return res.status(500).json({ status: "error", message: "Failed to delete profile" }); }
});

module.exports = router;