"use strict";

const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;
const GENDERIZE_URL = "https://api.genderize.io";
const EXTERNAL_TIMEOUT_MS = 5000;

// ── Global CORS header ────────────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// ── GET /api/classify ─────────────────────────────────────────────────────────
app.get("/api/classify", async (req, res) => {
  const { name } = req.query;

  // 1. Query Validation
  if (name === undefined || name === "") {
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

  // 2. External API Integration
  let genderizeData;

  try {
    const response = await axios.get(GENDERIZE_URL, {
      params: { name },
      timeout: EXTERNAL_TIMEOUT_MS,
    });

    if (
      !response.data ||
      typeof response.data !== "object" ||
      !("gender" in response.data) ||
      !("probability" in response.data) ||
      !("count" in response.data)
    ) {
      return res.status(502).json({
        status: "error",
        message: "Received an invalid response from the upstream API",
      });
    }

    genderizeData = response.data;
  } catch (err) {
    if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
      return res.status(504).json({
        status: "error",
        message: "Request to upstream API timed out",
      });
    }

    if (err.response) {
      // Upstream returned a non-2xx status
      return res.status(502).json({
        status: "error",
        message: `Upstream API returned an error: ${err.response.status}`,
      });
    }

    // Network / DNS / other transport error
    return res.status(500).json({
      status: "error",
      message: "Failed to reach the upstream API due to a network error",
    });
  }

  const { gender, probability, count } = genderizeData;

  // 3. Edge Case Handling
  if (gender === null || count === 0) {
    return res.status(200).json({
      status: "error",
      message: "No prediction available for the provided name",
    });
  }

  // 4. Data Processing
  const sample_size = count;
  const is_confident = probability >= 0.7 && sample_size >= 100;
  const processed_at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  return res.status(200).json({
    status: "success",
    data: {
      name,
      gender,
      probability,
      sample_size,
      is_confident,
      processed_at,
    },
  });
});

// ── 404 fallback ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ status: "error", message: "Route not found" });
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app; // export for testing
