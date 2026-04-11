const GENDERIZE_URL = "https://api.genderize.io";
const EXTERNAL_TIMEOUT_MS = 5000;

module.exports = async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin", "*");

  // ── Method guard ──────────────────────────────────────────────────────────
  if (req.method !== "GET") {
    return res.status(405).json({ status: "error", message: "Method not allowed" });
  }

  const { name } = req.query;

  // ── 1. Query Validation ───────────────────────────────────────────────────
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

  // ── 2. External API Integration ───────────────────────────────────────────
  let genderizeData;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(`${GENDERIZE_URL}?name=${encodeURIComponent(name)}`, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return res.status(502).json({
        status: "error",
        message: `Upstream API returned an error: ${response.status}`,
      });
    }

    const data = await response.json();

    if (
      !data ||
      typeof data !== "object" ||
      !("gender" in data) ||
      !("probability" in data) ||
      !("count" in data)
    ) {
      return res.status(502).json({
        status: "error",
        message: "Received an invalid response from the upstream API",
      });
    }

    genderizeData = data;
  } catch (err) {
    if (err.name === "AbortError") {
      return res.status(504).json({
        status: "error",
        message: "Request to upstream API timed out",
      });
    }

    return res.status(500).json({
      status: "error",
      message: "Failed to reach the upstream API due to a network error",
    });
  }

  const { gender, probability, count } = genderizeData;

  // ── 3. Edge Case Handling ─────────────────────────────────────────────────
  if (gender === null || count === 0) {
    return res.status(200).json({
      status: "error",
      message: "No prediction available for the provided name",
    });
  }

  // ── 4. Data Processing ────────────────────────────────────────────────────
  const sample_size  = count;
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
}