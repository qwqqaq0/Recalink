import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";

const [entryArg, outputArg] = process.argv.slice(2);
if (!entryArg || !outputArg) throw new Error("用法：node build-node-app.mjs <entry> <output>");
const entry = resolve(entryArg);
const output = resolve(outputArg);
await mkdir(dirname(output), { recursive: true });
await build({
  entryPoints: [entry], outfile: output, bundle: true, platform: "node", format: "esm",
  target: "node24", sourcemap: true,
  external: ["pg", "drizzle-orm", "drizzle-orm/*", "meilisearch", "pg-boss", "zod", "@mozilla/readability", "jsdom"]
});
