"use strict";

async function fetchGenderize(name) {
  const res = await fetch("https://api.genderize.io?name=" + encodeURIComponent(name));
  if (!res.ok) throw new Error("genderize_http");
  const data = await res.json();
  if (!data.gender || data.count === 0) throw new Error("genderize_invalid");
  return {
    gender: data.gender,
    gender_probability: data.probability,
    sample_size: data.count,
  };
}

async function fetchAgify(name) {
  const res = await fetch("https://api.agify.io?name=" + encodeURIComponent(name));
  if (!res.ok) throw new Error("agify_http");
  const data = await res.json();
  if (data.age === null || data.age === undefined) throw new Error("agify_invalid");
  return { age: data.age };
}

async function fetchNationalize(name) {
  const res = await fetch("https://api.nationalize.io?name=" + encodeURIComponent(name));
  if (!res.ok) throw new Error("nationalize_http");
  const data = await res.json();
  if (!data.country || data.country.length === 0) throw new Error("nationalize_invalid");
  const top = data.country.reduce((a, b) =>
    a.probability >= b.probability ? a : b
  );
  return {
    country_id: top.country_id,
    country_probability: top.probability,
  };
}

function getAgeGroup(age) {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
}

module.exports = { fetchGenderize, fetchAgify, fetchNationalize, getAgeGroup };
