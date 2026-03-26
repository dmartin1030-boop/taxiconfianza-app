/**
 * migrate-passwords.js
 *
 * One-time migration: hashes any plaintext passwords in `usuarios` with bcrypt.
 * Safe to re-run: rows already hashed (starting with "$2b$") are skipped.
 *
 * Usage:
 *   node migrate-passwords.js
 *   node migrate-passwords.js --dry-run   # preview only, no writes
 */

require("dotenv").config();
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");

const BCRYPT_ROUNDS = 12;
const BATCH_SIZE = 50;
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  if (DRY_RUN) console.log("=== DRY RUN — no changes will be written ===\n");

  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
  });

  console.log("Connected to database.");

  // Count total users
  const [[{ total }]] = await db.query("SELECT COUNT(*) AS total FROM usuarios");
  console.log(`Total users in table: ${total}\n`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;
  let offset = 0;

  while (offset < total) {
    const [rows] = await db.query(
      "SELECT id, email, password FROM usuarios ORDER BY id LIMIT ? OFFSET ?",
      [BATCH_SIZE, offset]
    );

    for (const row of rows) {
      const pwd = row.password;

      // Skip rows already hashed
      if (pwd && pwd.startsWith("$2b$")) {
        skipped++;
        continue;
      }

      // Skip rows with no password — cannot migrate without the original value
      if (!pwd) {
        console.warn(`  SKIP user ${row.id} (${row.email}): NULL or empty password, cannot migrate`);
        skipped++;
        continue;
      }

      try {
        if (DRY_RUN) {
          console.log(`  [DRY] Would hash password for user ${row.id} (${row.email})`);
          migrated++;
          continue;
        }

        const hash = await bcrypt.hash(pwd, BCRYPT_ROUNDS);
        await db.query("UPDATE usuarios SET password = ? WHERE id = ?", [hash, row.id]);
        console.log(`  Migrated user ${row.id} (${row.email})`);
        migrated++;
      } catch (err) {
        console.error(`  ERROR migrating user ${row.id} (${row.email}):`, err.message);
        errors++;
      }
    }

    offset += BATCH_SIZE;
  }

  await db.end();

  console.log("\n=== Migration complete ===");
  console.log(`  Migrated : ${migrated}`);
  console.log(`  Skipped  : ${skipped} (already bcrypt)`);
  console.log(`  Errors   : ${errors}`);

  if (errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
