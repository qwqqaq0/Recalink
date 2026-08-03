import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("API app", () => {
  it("reports service health without an extension token", async () => {
    const app = buildApp({
      extensionToken: "secret",
      health: async () => ({ database: true, search: true, worker: true, ai: false })
    });
    const response = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json().ai).toBe(false);
    await app.close();
  });

  it("protects extension sync endpoints with a bearer token", async () => {
    const app = buildApp({ extensionToken: "secret", health: async () => ({ database: true, search: true, worker: true, ai: false }) });
    const response = await app.inject({ method: "POST", url: "/api/v1/edge/sync", payload: { nodes: [] } });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
