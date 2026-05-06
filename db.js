"use strict";

require("dotenv").config();
const { Pool } = require("pg");
const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT) || 6543,
  database: process.env.PGDATABASE || "postgres",
  ssl: { rejectUnauthorized: false },

  // Pooling config
  max: 10,                  // max connections in pool
  min: 2,                   // keep 2 warm connections alive
  idleTimeoutMillis: 30000, // close idle connections after 30s
  connectionTimeoutMillis: 5000, // fail fast if no connection in 5s
  allowExitOnIdle: false,
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
  // Profiles table (existing)
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

  // Users table (Stage 3)
  await query(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    github_id TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'analyst',
    created_at TEXT NOT NULL
  )`);

  // Refresh tokens table (Stage 3)
  await query(`CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
  )`);
}

module.exports = { query, initDb };