
import { pool } from "./db.ts";

try {
  const result = await pool.query("SELECT NOW() AS current_time");

  console.log("Database connection successful!");
  console.log("PostgreSQL time:", result.rows[0]?.current_time);
} catch (error) {
  console.error("Database connection failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
