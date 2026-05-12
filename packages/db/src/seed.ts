import { db } from "./client";
import { cuisineTypes } from "./schema/index";

const CUISINES = [
  "American",
  "BBQ",
  "Burger Joint",
  "Cajun",
  "Chinese",
  "French",
  "Greek",
  "Indian",
  "Italian",
  "Japanese",
  "Korean",
  "Mediterranean",
  "Mexican",
  "Middle Eastern",
  "Pizza",
  "Seafood",
  "Steakhouse",
  "Thai",
  "Vegan / Vegetarian",
  "Vietnamese",
];

async function seed() {
  const existing = await db.select().from(cuisineTypes);
  if (existing.length > 0) {
    console.log(`cuisine_types already has ${existing.length} rows — skipping seed`);
    process.exit(0);
  }
  await db.insert(cuisineTypes).values(CUISINES.map((name) => ({ name })));
  console.log(`Seeded ${CUISINES.length} cuisine types`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
