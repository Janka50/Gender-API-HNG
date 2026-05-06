"use strict";

const express  = require("express");
const multer   = require("multer");
const csvParser = require("csv-parser");
const { Readable } = require("stream");
const { query }  = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB max

const CHUNK_SIZE = 1000;
const VALID_GENDERS = new Set(["male", "female"]);

function validateRow(row) {
  const name   = row.name?.trim();
  const gender = row.gender?.toLowerCase().trim();
  const age    = parseInt(row.age);

  if (!name)                         return { valid: false, reason: "missing name" };
  if (!VALID_GENDERS.has(gender))    return { valid: false, reason: "invalid gender" };
  if (isNaN(age) || age < 0 || age > 130) return { valid: false, reason: "invalid age" };

  return { valid: true, name, gender, age };
}

function getAgeGroup(age) {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
}

async function bulkInsert(rows, existingNames) {
  // Filter duplicates against DB
  const filtered = rows.filter(r => !existingNames.has(r.name.toLowerCase()));
  if (!filtered.length) return 0;

  const values  = [];
  const params  = [];
  let   i       = 1;

  for (const r of filtered) {
    values.push(`($${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++})`);
    params.push(
      r.name, r.gender, r.age, getAgeGroup(r.age),
      r.country_id || null, r.country_name || null,
      new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
    );
  }

  const sql = `
    INSERT INTO profiles (name, gender, age, age_group, country_id, country_name, created_at)
    VALUES ${values.join(",")}
    ON CONFLICT (name) DO NOTHING
  `;

  const result = await query(sql, params);
  return result.rowCount;
}

// POST /api/v1/upload
router.post("/", requireAuth, requireRole("admin"), upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ status: "error", message: "No file uploaded" });
  }

  const stats = { inserted: 0, skipped: 0, reasons: {} };
  const batch = [];

  // Stream CSV from buffer (avoids loading full file into memory at once)
  const stream = Readable.from(req.file.buffer.toString());

  await new Promise((resolve, reject) => {
    stream
      .pipe(csvParser())
      .on("data", async (row) => {
        const { valid, reason, ...clean } = validateRow(row);

        if (!valid) {
          stats.skipped++;
          stats.reasons[reason] = (stats.reasons[reason] || 0) + 1;
          return;
        }

        batch.push(clean);

        // Process in chunks of 1000
        if (batch.length >= CHUNK_SIZE) {
          const chunk = batch.splice(0, CHUNK_SIZE);
          // Check existing names in DB to avoid duplicates
          const names = chunk.map(r => r.name.toLowerCase());
          const existing = await query(
            `SELECT LOWER(name) as name FROM profiles WHERE LOWER(name) = ANY($1)`,
            [names]
          );
          const existingSet = new Set(existing.rows.map(r => r.name));
          stats.inserted += await bulkInsert(chunk, existingSet);
          stats.skipped  += (chunk.length - (stats.inserted - stats.skipped));
        }
      })
      .on("end", resolve)
      .on("error", reject);
  });

  // Process remaining rows
  if (batch.length) {
    const names = batch.map(r => r.name.toLowerCase());
    const existing = await query(
      `SELECT LOWER(name) as name FROM profiles WHERE LOWER(name) = ANY($1)`,
      [names]
    );
    const existingSet = new Set(existing.rows.map(r => r.name));
    stats.inserted += await bulkInsert(batch, existingSet);
  }

  return res.status(200).json({
    status:   "success",
    inserted: stats.inserted,
    skipped:  stats.skipped,
    reasons:  stats.reasons,
  });
});

module.exports = router;