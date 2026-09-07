import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertSmokeEnvironment,
  requireEmptySmokeDatabase
} from "./smoke-safety.js";
import { runSmoke } from "./run-smoke.js";

const isolated = {
  RECALINK_SMOKE_ISOLATED: "1",
  DATABASE_URL: "postgres://smoke:smoke@postgres:5432/recalink_smoke",
  SMOKE_API_URL: "http://127.0.0.1:3210",
  AI_BASE_URL: "",
  AI_API_KEY: "",
  AI_MODEL: ""
};

describe("smoke test isolation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(["smoke-test.ts", "lifecycle-smoke.ts"])(
    "blocks direct execution of %s",
    (script) => {
      const result = spawnSync(
        process.execPath,
        ["--import", "tsx", `scripts/${script}`],
        {
          cwd: fileURLToPath(new URL("../", import.meta.url)),
          env: {
            ...process.env,
            RECALINK_SMOKE_ISOLATED: "",
            SMOKE_API_URL: "http://127.0.0.1:1"
          },
          encoding: "utf8",
          timeout: 10_000
        }
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("请使用 npm run smoke");
    }
  );

  it("refuses a populated test database and closes the connection", async () => {
    for (const [name, value] of Object.entries(isolated))
      vi.stubEnv(name, value);
    const query = vi
      .spyOn(pg.Pool.prototype, "query")
      .mockResolvedValue({ rows: [{ occupied: true }] } as never);
    const close = vi
      .spyOn(pg.Pool.prototype, "end")
      .mockResolvedValue(undefined);
    await expect(requireEmptySmokeDatabase()).rejects.toThrow(/非空数据库/);
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/^\s*select /));
    expect(close).toHaveBeenCalledOnce();
  });
  it("refuses ordinary application environments before connecting", () => {
    expect(() => assertSmokeEnvironment({})).toThrow(/npm run smoke/);
    expect(() =>
      assertSmokeEnvironment({
        ...isolated,
        DATABASE_URL: "postgres://user:secret@postgres:5432/bookmark_recall"
      })
    ).toThrow(/隔离/);
  });

  it("rejects external API/database targets and paid AI configuration", () => {
    for (const override of [
      { SMOKE_API_URL: "http://localhost:3210" },
      { SMOKE_API_URL: "https://example.com" },
      { DATABASE_URL: "postgres://smoke:smoke@localhost:5432/recalink_smoke" },
      {
        DATABASE_URL:
          "postgres://smoke:smoke@postgres/recalink_smoke?host=other"
      },
      { AI_API_KEY: "configured-key" }
    ]) {
      expect(() =>
        assertSmokeEnvironment({ ...isolated, ...override })
      ).toThrow();
    }
    expect(() => assertSmokeEnvironment(isolated)).not.toThrow();
  });

  it("uses a different Compose project each run and cleans the same project", () => {
    const calls: string[][] = [];
    const execute = (args: string[]) => {
      calls.push(args);
    };
    runSmoke(execute);
    runSmoke(execute);
    const project = (args: string[]) =>
      args[args.indexOf("--project-name") + 1];
    expect(calls).toHaveLength(6);
    expect(project(calls[0]!)).toMatch(/^recalink-smoke-[a-f0-9-]{36}$/);
    expect(project(calls[0]!)).not.toBe(project(calls[3]!));
    for (const start of [0, 3]) {
      expect(project(calls[start]!)).toBe(project(calls[start + 1]!));
      expect(project(calls[start]!)).toBe(project(calls[start + 2]!));
      expect(calls[start]!).toContain("--wait");
      expect(calls[start + 2]!.slice(-2)).toEqual(["down", "--volumes"]);
    }
  });

  it("cleans only its temporary project when a test fails", () => {
    const calls: string[][] = [];
    expect(() =>
      runSmoke((args) => {
        calls.push(args);
        if (args.includes("exec")) throw new Error("synthetic failure");
      })
    ).toThrow("synthetic failure");
    expect(calls).toHaveLength(3);
    expect(calls[2]!.slice(-2)).toEqual(["down", "--volumes"]);
    expect(calls[2]!.slice(0, 5)).toEqual(calls[0]!.slice(0, 5));
  });

  it("also cleans partial startup resources and keeps the original failure", () => {
    const calls: string[][] = [];
    expect(() =>
      runSmoke((args) => {
        calls.push(args);
        if (args.includes("up")) throw new Error("startup failed");
      })
    ).toThrow("startup failed");
    expect(calls).toHaveLength(2);
    expect(calls[1]!.slice(-2)).toEqual(["down", "--volumes"]);
  });

  it("has no published ports, shared volumes, or user configuration in Compose", () => {
    const config = JSON.parse(
      readFileSync(new URL("../compose.smoke.json", import.meta.url), "utf8")
    );
    expect(Object.keys(config.services).sort()).toEqual([
      "api",
      "meilisearch",
      "postgres",
      "worker"
    ]);
    for (const service of Object.values(config.services) as Record<
      string,
      any
    >[]) {
      expect(service.ports).toBeUndefined();
      expect(service.network_mode).toBeUndefined();
      expect(service.container_name).toBeUndefined();
      expect(service.env_file).toBeUndefined();
      for (const volume of service.volumes ?? []) {
        expect(volume.type).toBe("volume");
        expect(config.volumes[volume.source]).toEqual({});
      }
    }
    for (const service of ["api", "worker"]) {
      expect(() =>
        assertSmokeEnvironment(config.services[service].environment)
      ).not.toThrow();
    }
    expect(JSON.stringify(config)).not.toContain("${");
  });
});
