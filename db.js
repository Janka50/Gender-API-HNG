"use strict";

require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT),
  database: process.env.PGDATABASE,
  ssl: { rejectUnauthorized: false },
  max: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
});

pool.on("error", (err) => {
  console.error("Unexpected pool error", err.message);
});

async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result;
  } finally {
    client.release();
  }
}

async function initDb() {
  await query(`CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    gender TEXT,
    gender_probability REAL,
    sample_size INTEGER,
    age INTEGER,
    age_group TEXT,
    country_id TEXT,
    country_name TEXT,
    country_probability REAL,
    created_at TEXT NOT NULL
  )`);
  await query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country_name TEXT`);
  await query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sample_size INTEGER`);
  console.log("Database initialized successfully");
}

module.exports = { query, initDb };