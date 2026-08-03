import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./client.js";

const { db, pool } = createDatabase();
await migrate(db, {
  migrationsFolder: new URL("../migrations", import.meta.url).pathname
});
await pool.end();
