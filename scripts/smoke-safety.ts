import pg from "pg";

const instruction = "烟雾测试只允许在隔离环境执行，请使用 npm run smoke。";

export function assertSmokeEnvironment(env: NodeJS.ProcessEnv): void {
  if (env.RECALINK_SMOKE_ISOLATED !== "1") throw new Error(instruction);
  const database = new URL(env.DATABASE_URL ?? "invalid:");
  if (
    database.protocol !== "postgres:" ||
    database.hostname !== "postgres" ||
    database.port !== "5432" ||
    database.pathname !== "/recalink_smoke" ||
    database.search ||
    database.hash ||
    env.SMOKE_API_URL !== "http://127.0.0.1:3210" ||
    env.AI_BASE_URL ||
    env.AI_API_KEY ||
    env.AI_MODEL
  ) {
    throw new Error(instruction);
  }
}

// Both destructive test entrypoints call this before their first HTTP request.
export async function requireEmptySmokeDatabase(): Promise<void> {
  assertSmokeEnvironment(process.env);
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 5_000
  });
  try {
    const result = await pool.query<{ occupied: boolean }>(`
      select (
        exists(select 1 from bookmarks) or
        exists(select 1 from bookmark_sources) or
        exists(select 1 from folders) or
        exists(select 1 from tags)
      ) as occupied
    `);
    if (result.rows[0]?.occupied !== false) {
      throw new Error(
        "烟雾测试拒绝修改非空数据库，请使用 npm run smoke 创建新的隔离环境。"
      );
    }
  } finally {
    await pool.end();
  }
}
