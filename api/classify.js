module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const name = req.query.name;

  if (!name || name.trim() === "") {
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
    const url = "https://api.genderize.io?name=" + encodeURIComponent(name);
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(502).json({
        status: "error",
        message: "Upstream API returned an error: " + response.status,
      });
    }

    genderizeData = await response.json();
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: "Failed to reach the upstream API",
    });
  }

  const gender = genderizeData.gender;
  const probability = genderizeData.probability;
  const count = genderizeData.count;

  if (gender === null || count === 0) {
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
      name: name,
      gender: gender,
      probability: probability,
      sample_size: sample_size,
      is_confident: is_confident,
      processed_at: processed_at,
    },
  });
};
