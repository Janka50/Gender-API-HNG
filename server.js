"use strict";

require("dotenv").config();

const express    = require("express");
const morgan     = require("morgan");
const rateLimit  = require("express-rate-limit");
const cookieParser = require("cookie-parser");

const app = express();

// ── Request logging ───────────────────────────────────────────────────────────
morgan.token("user-id", (req) => req.user?.id || "anonymous");
app.use(morgan(":method :url :status :response-time ms - user::user-id"));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max:      100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { status: "error", message: "Too many requests, please try again later" },
});
app.use(limiter);

// ── Body parsing + cookies ────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const allowedOrigins = [
    "http://localhost:3000",
    process.env.WEB_PORTAL_URL || "",
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

// ── API v1 routes ─────────────────────────────────────────────────────────────
const v1 = express.Router();

v1.use("/auth",     require("./routes/auth"));
v1.use("/profiles", require("./routes/profiles"));
v1.use("/classify", require("./routes/classify"));

app.use("/api/v1", v1);

// ── Legacy Stage 2 routes (keep working during transition) ────────────────────
app.use("/api/profiles", require("./routes/profiles"));
app.use("/api/classify",  require("./routes/classify"));

// ── 404 fallback ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ status: "error", message: "Route not found" });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ status: "error", message: "Internal server error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;