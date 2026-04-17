"use strict";

const express = require("express");
const router = express.Router();

router.get("/", async (req, res) => {
  const name = req.query.name;

  if (name === undefined || name === null || name.trim() === "") {
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

  let genderizeData;

  try {
    const url = "https://api.genderize.io?name=" + encodeURIComponent(name.trim());
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(502).json({
        status: "error",
        message: "Upstream API returned an error: " + response.status,
      });
    }

    genderizeData = await response.json();
  } catch {
    return res.status(500).json({
      status: "error",
      message: "Failed to reach the upstream API",
    });
  }

  const { gender, probability, count } = genderizeData;

  if (gender === null || gender === undefined || count === 0) {
    return res.status(200).json({
      status: "error",
      message: "No prediction available for the provided name",
    });
  }

  const sample_size = count;
  const is_confident = probability >= 0.7 && sample_size >= 100;
  const processed_at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  return res.status(200).json({
    status: "success",
    data: {
      name: name.trim(),
      gender,
      probability,
      sample_size,
      is_confident,
      processed_at,
    },
  });
});

module.exports = router;
