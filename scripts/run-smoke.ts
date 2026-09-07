import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const composeFile = fileURLToPath(
  new URL("../compose.smoke.json", import.meta.url)
);

function executeDocker(args: string[]): void {
  const result = spawnSync("docker", args, {
    cwd: root,
    stdio: "inherit",
    timeout: args.includes("down") ? 60_000 : 600_000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Docker 命令失败（${result.status ?? result.signal}）：docker ${args.join(" ")}`
    );
  }
}

export function runSmoke(
  execute: (args: string[]) => void = executeDocker,
  lifecycle = false
): void {
  const project = `recalink-smoke-${randomUUID()}`;
  const prefix = ["compose", "--project-name", project, "--file", composeFile];
  const failures: unknown[] = [];
  let cleanupFailed = false;
  try {
    execute([
      ...prefix,
      "up",
      "--detach",
      "--build",
      "--wait",
      "--wait-timeout",
      "180"
    ]);
    execute([
      ...prefix,
      "exec",
      "-T",
      "api",
      "node",
      "--import",
      "tsx",
      lifecycle ? "scripts/lifecycle-smoke.ts" : "scripts/smoke-test.ts"
    ]);
  } catch (error) {
    failures.push(error);
  } finally {
    // The UUID is generated here, never supplied by a user or read from .env.
    // Only resources belonging to this fresh test project can be removed.
    try {
      execute([...prefix, "down", "--volumes"]);
    } catch (cleanupError) {
      failures.push(cleanupError);
      cleanupFailed = true;
    }
  }
  if (cleanupFailed) {
    throw new AggregateError(
      failures,
      `测试环境清理失败，保留项目 ${project}；恢复 Docker 后运行：docker compose --project-name ${project} --file "${composeFile}" down --volumes`
    );
  }
  if (failures.length) throw failures[0];
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== "--lifecycle")) {
      throw new Error("用法：npm run smoke [-- --lifecycle]");
    }
    runSmoke(undefined, args[0] === "--lifecycle");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
