// Cuisine list is duplicated from packages/db/src/seed.ts — keep in sync.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "path";

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

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[migrate] DATABASE_URL is not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  try {
    // Advisory lock prevents concurrent container boots from racing on the
    // migrations table. Lock is session-scoped and auto-released on pool.end().
    console.log("[migrate] Acquiring advisory lock...");
    await pool.query("SELECT pg_advisory_lock(8765432)");

    const migrationsFolder = path.join(process.cwd(), "migrations");
    console.log("[migrate] Running migrations from", migrationsFolder);
    await migrate(db, { migrationsFolder });
    console.log("[migrate] Migrations applied");

    await pool.query("SELECT pg_advisory_unlock(8765432)");
    console.log("[migrate] Advisory lock released");

    const { rows } = await pool.query("SELECT COUNT(*) AS c FROM cuisine_types");
    const count = Number(rows[0].c);
    if (count === 0) {
      console.log("[migrate] Seeding cuisine types...");
      const placeholders = CUISINES.map((_, i) => `($${i + 1})`).join(", ");
      await pool.query(`INSERT INTO cuisine_types (name) VALUES ${placeholders}`, CUISINES);
      console.log("[migrate] Seeded", CUISINES.length, "cuisine types");
    } else {
      console.log("[migrate] cuisine_types already populated (" + count + " rows) — skipping seed");
    }
  } catch (err) {
    console.error("[migrate] Fatal error:", err);
    await pool.end();
    process.exit(1);
  }

  await pool.end();
  console.log("[migrate] Done");
}

main();
