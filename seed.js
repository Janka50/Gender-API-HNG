"use strict";

require("dotenv").config();

const { query, initDb } = require("./db");
const { v4: uuidv4 } = require("uuid");

// ── Seed data pools ───────────────────────────────────────────────────────────
const MALE_NAMES = [
  "James","John","Robert","Michael","William","David","Richard","Joseph","Thomas","Charles",
  "Christopher","Daniel","Matthew","Anthony","Mark","Donald","Steven","Paul","Andrew","Joshua",
  "Kenneth","Kevin","Brian","George","Timothy","Ronald","Edward","Jason","Jeffrey","Ryan",
  "Jacob","Gary","Nicholas","Eric","Jonathan","Stephen","Larry","Justin","Scott","Brandon",
  "Benjamin","Samuel","Raymond","Gregory","Frank","Alexander","Patrick","Jack","Dennis","Jerry",
  "Tyler","Aaron","Jose","Henry","Adam","Douglas","Nathan","Peter","Zachary","Kyle",
  "Walter","Harold","Jeremy","Ethan","Carl","Keith","Roger","Gerald","Christian","Terry",
  "Sean","Arthur","Austin","Noah","Lawrence","Jesse","Joe","Bryan","Billy","Jordan",
  "Albert","Dylan","Bruce","Willie","Gabriel","Alan","Juan","Logan","Wayne","Ralph",
  "Roy","Eugene","Randy","Vincent","Russell","Louis","Philip","Bobby","Johnny","Bradley",
  "Emeka","Chidi","Kwame","Kofi","Seun","Tunde","Yusuf","Musa","Ibrahim","Aminu",
  "Oluwaseun","Adebayo","Chukwuemeka","Obinna","Nnamdi","Chisom","Ikenna","Uche","Eze","Obi",
  "Abebe","Tadesse","Girma","Tesfaye","Dawit","Haile","Bereket","Yonas","Ermias","Fitsum",
  "Hamza","Abdullahi","Muhammad","Ahmed","Omar","Ali","Hassan","Hussain","Khalid","Tariq",
  "Liam","Oliver","Noah","Elijah","Lucas","Mason","Logan","Ethan","Aiden","Jackson",
  "Sebastian","Mateo","Jack","Owen","Theodore","Levi","Henry","Alexander","Hudson","Felix",
  "Finn","Eli","Silas","Ezra","Miles","Nolan","Leo","Jasper","Atticus","Declan",
  "Ravi","Arjun","Vikram","Suresh","Rajesh","Amit","Deepak","Sanjay","Anil","Rahul",
  "Wei","Huang","Liu","Zhang","Chen","Wang","Li","Zhao","Sun","Zhou",
  "Carlos","Miguel","Luis","Jorge","Antonio","Manuel","Pedro","Francisco","Juan","Alejandro",
  "Pierre","Jean","Michel","Francois","Rene","Alain","Henri","Philippe","Louis","Gerard",
  "Hans","Klaus","Werner","Dieter","Horst","Wolfgang","Gunter","Helmut","Otto","Kurt",
  "Yuki","Kenji","Takashi","Hiroshi","Satoshi","Makoto","Daisuke","Shota","Ryota","Kenta",
];

const FEMALE_NAMES = [
  "Mary","Patricia","Jennifer","Linda","Barbara","Elizabeth","Susan","Jessica","Sarah","Karen",
  "Lisa","Nancy","Betty","Margaret","Sandra","Ashley","Dorothy","Kimberly","Emily","Donna",
  "Michelle","Carol","Amanda","Melissa","Deborah","Stephanie","Rebecca","Sharon","Laura","Cynthia",
  "Kathleen","Amy","Angela","Shirley","Anna","Brenda","Pamela","Emma","Nicole","Helen",
  "Samantha","Katherine","Christine","Debra","Rachel","Carolyn","Janet","Catherine","Maria","Heather",
  "Diane","Julie","Joyce","Victoria","Kelly","Christina","Lauren","Joan","Evelyn","Olivia",
  "Judith","Megan","Cheryl","Andrea","Hannah","Martha","Jacqueline","Frances","Gloria","Teresa",
  "Kathryn","Sara","Janice","Julia","Marie","Madison","Grace","Judy","Theresa","Beverly",
  "Denise","Marilyn","Amber","Danielle","Abigail","Brittany","Rose","Diana","Natalie","Sophia",
  "Alexis","Lori","Kayla","Jane","Aisha","Fatima","Zainab","Aminata","Ngozi","Chidinma",
  "Adaeze","Ifeoma","Chiamaka","Blessing","Precious","Gift","Mercy","Grace","Faith","Joy",
  "Amara","Yetunde","Folake","Ronke","Toyin","Bisi","Shade","Kemi","Lola","Funmi",
  "Mia","Isabella","Sofia","Charlotte","Amelia","Harper","Evelyn","Abigail","Emily","Luna",
  "Ella","Elizabeth","Camila","Layla","Victoria","Nora","Lily","Eleanor","Hannah","Lillian",
  "Addison","Aubrey","Ellie","Stella","Natalia","Zoe","Leah","Hazel","Violet","Aurora",
  "Priya","Ananya","Divya","Pooja","Sneha","Kavya","Nisha","Meera","Anika","Shreya",
  "Mei","Ling","Xiao","Yan","Fang","Hong","Jing","Ping","Qian","Rong",
  "Sofia","Valentina","Camila","Isabella","Lucia","Gabriela","Maria","Fernanda","Ana","Paula",
  "Marie","Sophie","Camille","Lea","Manon","Chloe","Inès","Emma","Jade","Lucie",
  "Lena","Anna","Julia","Sarah","Laura","Nina","Lisa","Hannah","Katharina","Sabrina",
  "Yuki","Sakura","Hana","Nana","Miki","Rika","Yui","Ai","Emi","Nao",
];

const COUNTRIES = [
  { id: "NG", name: "Nigeria", prob: 0.85 },
  { id: "GH", name: "Ghana", prob: 0.78 },
  { id: "KE", name: "Kenya", prob: 0.82 },
  { id: "ET", name: "Ethiopia", prob: 0.76 },
  { id: "US", name: "United States", prob: 0.91 },
  { id: "GB", name: "United Kingdom", prob: 0.88 },
  { id: "CA", name: "Canada", prob: 0.84 },
  { id: "AU", name: "Australia", prob: 0.87 },
  { id: "DE", name: "Germany", prob: 0.83 },
  { id: "FR", name: "France", prob: 0.86 },
  { id: "BR", name: "Brazil", prob: 0.79 },
  { id: "IN", name: "India", prob: 0.92 },
  { id: "CN", name: "China", prob: 0.89 },
  { id: "JP", name: "Japan", prob: 0.93 },
  { id: "MX", name: "Mexico", prob: 0.81 },
  { id: "ZA", name: "South Africa", prob: 0.77 },
  { id: "EG", name: "Egypt", prob: 0.80 },
  { id: "MA", name: "Morocco", prob: 0.75 },
  { id: "TZ", name: "Tanzania", prob: 0.74 },
  { id: "UG", name: "Uganda", prob: 0.73 },
];

const AGE_GROUPS = [
  { group: "child",    min: 1,  max: 12 },
  { group: "teenager", min: 13, max: 19 },
  { group: "adult",    min: 20, max: 59 },
  { group: "senior",   min: 60, max: 90 },
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getAgeGroup(age) {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
}

function generateProfiles(count) {
  const profiles = [];
  const usedNames = new Set();

  let maleIdx = 0;
  let femaleIdx = 0;

  for (let i = 0; i < count; i++) {
    const isMale = i % 2 === 0;
    const gender = isMale ? "male" : "female";

    // Pick unique name
    let name;
    const namePool = isMale ? MALE_NAMES : FEMALE_NAMES;
    const baseIdx = isMale ? maleIdx : femaleIdx;
    const baseName = namePool[baseIdx % namePool.length];

    // Make unique by appending suffix if needed
    const suffix = Math.floor(baseIdx / namePool.length);
    name = suffix === 0 ? baseName : `${baseName}${suffix}`;

    if (isMale) maleIdx++; else femaleIdx++;

    if (usedNames.has(name.toLowerCase())) {
      name = `${name}_${i}`;
    }
    usedNames.add(name.toLowerCase());

    const ageGroupObj = randomFrom(AGE_GROUPS);
    const age = randomInt(ageGroupObj.min, ageGroupObj.max);
    const country = randomFrom(COUNTRIES);
    const genderProb = parseFloat((0.65 + Math.random() * 0.35).toFixed(2));

    profiles.push({
      id: uuidv4(),
      name,
      gender,
      gender_probability: genderProb,
      sample_size: randomInt(100, 500000),
      age,
      age_group: getAgeGroup(age),
      country_id: country.id,
      country_name: country.name,
      country_probability: country.prob,
      created_at: new Date(
        Date.now() - randomInt(0, 365 * 24 * 60 * 60 * 1000)
      ).toISOString().replace(/\.\d{3}Z$/, "Z"),
    });
  }

  return profiles;
}

async function seed() {
  console.log("Initializing database...");
  await initDb();

  console.log("Generating 2026 profiles...");
  const profiles = generateProfiles(2026);

  console.log("Inserting in bulk...");

  const chunkSize = 100;
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < profiles.length; i += chunkSize) {
    const chunk = profiles.slice(i, i + chunkSize);
    const values = chunk.map((p, idx) => {
      const base = idx * 11;
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11})`;
    }).join(",");

    const flat = chunk.flatMap(p => [
      p.id, p.name, p.gender, p.gender_probability, p.sample_size,
      p.age, p.age_group, p.country_id, p.country_name, p.country_probability, p.created_at
    ]);

    try {
      const result = await query(
        `INSERT INTO profiles (id,name,gender,gender_probability,sample_size,age,age_group,country_id,country_name,country_probability,created_at)
         VALUES ${values} ON CONFLICT (name) DO NOTHING`,
        flat
      );
      inserted += result.rowCount;
      console.log(`Inserted chunk ${Math.floor(i/chunkSize)+1}/${Math.ceil(profiles.length/chunkSize)}`);
    } catch (err) {
      skipped += chunk.length;
      console.error("Chunk failed:", err.message);
    }
  }

  console.log(`Seed complete: ${inserted} inserted, ${skipped} skipped`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});