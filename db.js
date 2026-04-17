"use strict";

const path = require("path");
const fs = require("fs");
const initSqlJs = require("sql.js");

const DB_PATH = path.join(__dirname, "profiles.db");

let db;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      gender TEXT,
      gender_probability REAL,
      sample_size INTEGER,
      age INTEGER,
      age_group TEXT,
      country_id TEXT,
      country_probability REAL,
      created_at TEXT NOT NULL
    )
  `);

  persist(db);
  return db;
}

function persist(database) {
  const data = database.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function runQuery(database, sql, params = []) {
  database.run(sql, params);
  persist(database);
}

function getOne(database, sql, params = []) {
  const stmt = database.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function getAll(database, sql, params = []) {
  const stmt = database.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

module.exports = { getDb, runQuery, getOne, getAll, persist };
