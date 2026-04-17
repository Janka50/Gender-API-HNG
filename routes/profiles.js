"use strict";

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { getDb, runQuery, getOne, getAll } = require("../db");
const { fetchGenderize, fetchAgify, fetchNationalize, getAgeGroup } = require("../helpers");

const router = express.Router();

// POST /api/profiles
router.post("/", async (req, res) => {
  const { name } = req.body || {};

  if (name === undefined || name === null || (typeof name === "string" && name.trim() === "")) {
    return res.status(400).json({ status: "error", message: "Query parameter 'name' is required and cannot be empty" });
  }
  if (typeof name !== "string") {
    return res.status(422).json({ status: "error", message: "Query parameter 'name' must be a string" });
  }

  const cleanName = name.trim();
  const db = await getDb();

  const existing = getOne(db, "SELECT * FROM profiles WHERE name = ?", [cleanName]);
  if (existing) {
    return res.status(200).json({ status: "success", message: "Profile already exists", data: existing });
  }

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
    country_probability: nationalityData.country_probability,
    created_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };

  try {
    runQuery(db,
      `INSERT INTO profiles (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_probability, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [profile.id, profile.name, profile.gender, profile.gender_probability, profile.sample_size,
       profile.age, profile.age_group, profile.country_id, profile.country_probability, profile.created_at]
    );
  } catch {
    return res.status(500).json({ status: "error", message: "Failed to save profile to database" });
  }

  return res.status(201).json({ status: "success", data: profile });
});

// GET /api/profiles
router.get("/", async (req, res) => {
  const { gender, country_id, age_group } = req.query;
  const db = await getDb();

  let sql = "SELECT id, name, gender, age, age_group, country_id FROM profiles WHERE 1=1";
  const params = [];

  if (gender)     { sql += " AND LOWER(gender) = LOWER(?)"; params.push(gender); }
  if (country_id) { sql += " AND LOWER(country_id) = LOWER(?)"; params.push(country_id); }
  if (age_group)  { sql += " AND LOWER(age_group) = LOWER(?)"; params.push(age_group); }

  try {
    const profiles = getAll(db, sql, params);
    return res.status(200).json({ status: "success", count: profiles.length, data: profiles });
  } catch {
    return res.status(500).json({ status: "error", message: "Failed to retrieve profiles" });
  }
});

// GET /api/profiles/:id
router.get("/:id", async (req, res) => {
  const db = await getDb();
  try {
    const profile = getOne(db, "SELECT * FROM profiles WHERE id = ?", [req.params.id]);
    if (!profile) return res.status(404).json({ status: "error", message: "Profile not found" });
    return res.status(200).json({ status: "success", data: profile });
  } catch {
    return res.status(500).json({ status: "error", message: "Failed to retrieve profile" });
  }
});

// DELETE /api/profiles/:id
router.delete("/:id", async (req, res) => {
  const db = await getDb();
  try {
    const profile = getOne(db, "SELECT id FROM profiles WHERE id = ?", [req.params.id]);
    if (!profile) return res.status(404).json({ status: "error", message: "Profile not found" });
    runQuery(db, "DELETE FROM profiles WHERE id = ?", [req.params.id]);
    return res.status(204).end();
  } catch {
    return res.status(500).json({ status: "error", message: "Failed to delete profile" });
  }
});

module.exports = router;
