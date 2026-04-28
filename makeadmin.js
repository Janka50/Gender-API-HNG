require("dotenv").config();
const { Pool } = require("pg");
const p = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  ssl: { rejectUnauthorized: false }
});
p.query("UPDATE users SET role = 'admin' WHERE username = 'Janka50'")
  .then(r => console.log("Updated rows:", r.rowCount))
  .catch(e => console.error(e))
  .finally(() => p.end());