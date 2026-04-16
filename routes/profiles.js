"use strict";

const express = require("express");
const { v7: uuidv7 } = require("uuid");
const db = require("../db");
const { fetchGenderize, fetchAgify, fetchNationalize, getAgeGroup } = require("../helpers");

const router = express.Router();

// ── POST /api/profiles ────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const { name } = req.body || {};

  if (name === undefined || name === null || (typeof name === "string" && name.trim() === "")) {
    return res.status(400).json({
      status: "error",
      message: "Query parameter 'name' is required and cannot be empty",
    });
  }

  if (typeof name !== "string") {
    return res.status(422).json({
      status: "error",
      message: "Query parameter 'name' must be a string",
    });
  }

  const cleanName = name.trim();

  const existing = db.prepare("SELECT * FROM profiles WHERE name = ?").get(cleanName);
  if (existing) {
    return res.status(200).json({
      status: "success",
      message: "Profile already exists",
      data: existing,
    });
  }

  let genderData, ageData, nationalityData;

  try {
    genderData = await fetchGenderize(cleanName);
  } catch {
    return res.status(502).json({ status: "error", message: "Genderize returned an invalid response" });
  }

  try {
    ageData = await fetchAgify(cleanName);
  } catch {
    return res.status(502).json({ status: "error", message: "Agify returned an invalid response" });
  }

  try {
    nationalityData = await fetchNationalize(cleanName);
  } catch {
    return res.status(502).json({ status: "error", message: "Nationalize returned an invalid response" });
  }

  const profile = {
    id: uuidv7(),
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
    db.prepare(`
      INSERT INTO profiles
        (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_probability, created_at)
      VALUES
        (@id, @name, @gender, @gender_probability, @sample_size, @age, @age_group, @country_id, @country_probability, @created_at)
    `).run(profile);
  } catch {
    return res.status(500).json({ status: "error", message: "Failed to save profile to database" });
  }

  return res.status(201).json({ status: "success", data: profile });
});

// ── GET /api/profiles ─────────────────────────────────────────────────────────
router.get("/", (req, res) => {
  const { gender, country_id, age_group } = req.query;

  let query = "SELECT id, name, gender, age, age_group, country_id FROM profiles WHERE 1=1";
  const params = [];

  if (gender)     { query += " AND LOWER(gender) = LOWER(?)";     params.push(gender); }
  if (country_id) { query += " AND LOWER(country_id) = LOWER(?)"; params.push(country_id); }
  if (age_group)  { query += " AND LOWER(age_group) = LOWER(?)";  params.push(age_group); }

  try {
    const profiles = db.prepare(query).all(...params);
    return res.status(200).json({ status: "success", count: profiles.length, data: profiles });
  } catch {
    return res.status(500).json({ status: "error", message: "Failed to retrieve profiles" });
  }
});

// ── GET /api/profiles/:id ─────────────────────────────────────────────────────
router.get("/:id", (req, res) => {
  try {
    const profile = db.prepare("SELECT * FROM profiles WHERE id = ?").get(req.params.id);
    if (!profile) return res.status(404).json({ status: "error", message: "Profile not found" });
    return res.status(200).json({ status: "success", data: profile });
  } catch {
    return res.status(500).json({ status: "error", message: "Failed to retrieve profile" });
  }
});

// ── DELETE /api/profiles/:id ──────────────────────────────────────────────────
router.delete("/:id", (req, res) => {
  try {
    const profile = db.prepare("SELECT id FROM profiles WHERE id = ?").get(req.params.id);
    if (!profile) return res.status(404).json({ status: "error", message: "Profile not found" });
    db.prepare("DELETE FROM profiles WHERE id = ?").run(req.params.id);
    return res.status(204).end();
  } catch {
    return res.status(500).json({ status: "error", message: "Failed to delete profile" });
  }
});

module.exports = router;
