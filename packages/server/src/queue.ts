import { PgBoss } from "pg-boss";

export const CAPTURE_QUEUE = "capture-page";
export const INDEX_QUEUE = "index-bookmark";
export const TAG_QUEUE = "suggest-tags";

export function createQueue(connectionString = process.env.DATABASE_URL): PgBoss {
  if (!connectionString) throw new Error("缺少 DATABASE_URL");
  return new PgBoss({ connectionString });
}

export async function startQueue(boss: PgBoss): Promise<void> {
  boss.on("error", (error) => console.error("pg-boss", error));
  await boss.start();
  await Promise.all([CAPTURE_QUEUE, INDEX_QUEUE, TAG_QUEUE].map((name) => boss.createQueue(name)));
}

