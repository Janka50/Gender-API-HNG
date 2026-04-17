"use strict";

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { fetchGenderize, fetchAgify, fetchNationalize, getAgeGroup } = require("../helpers");

const router = express.Router();

// In-memory store
const profiles = new Map();

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

  const existing = [...profiles.values()].find(p => p.name.toLowerCase() === cleanName.toLowerCase());
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

  profiles.set(profile.id, profile);

  return res.status(201).json({ status: "success", data: profile });
});

// GET /api/profiles
router.get("/", (req, res) => {
  const { gender, country_id, age_group } = req.query;

  let result = [...profiles.values()];

  if (gender)     result = result.filter(p => p.gender?.toLowerCase() === gender.toLowerCase());
  if (country_id) result = result.filter(p => p.country_id?.toLowerCase() === country_id.toLowerCase());
  if (age_group)  result = result.filter(p => p.age_group?.toLowerCase() === age_group.toLowerCase());

  const data = result.map(({ id, name, gender, age, age_group, country_id }) =>
    ({ id, name, gender, age, age_group, country_id })
  );

  return res.status(200).json({ status: "success", count: data.length, data });
});

// GET /api/profiles/:id
router.get("/:id", (req, res) => {
  const profile = profiles.get(req.params.id);
  if (!profile) return res.status(404).json({ status: "error", message: "Profile not found" });
  return res.status(200).json({ status: "success", data: profile });
});

// DELETE /api/profiles/:id
router.delete("/:id", (req, res) => {
  if (!profiles.has(req.params.id)) {
    return res.status(404).json({ status: "error", message: "Profile not found" });
  }
  profiles.delete(req.params.id);
  return res.status(204).end();
});

module.exports = router;
