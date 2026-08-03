import { describe, expect, it } from "vitest";
import { z } from "zod";
import { OpenAiCompatibleClient, parseModelJson } from "./ai.js";

describe("parseModelJson", () => {
  it("parses JSON returned inside a markdown fence", () => {
    expect(parseModelJson("```json\n{\"value\":42}\n```", z.object({ value: z.number() }))).toEqual({ value: 42 });
  });
});

describe("OpenAiCompatibleClient", () => {
  it("posts to an OpenAI-compatible chat completions endpoint", async () => {
    const calls: string[] = [];
    const client = new OpenAiCompatibleClient({
      baseUrl: "http://model.local/v1",
      apiKey: "secret",
      model: "test-model",
      fetcher: async (input) => {
        calls.push(String(input));
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":"ok"}' } }] }), {
          headers: { "content-type": "application/json" }
        });
      }
    });

    const result = await client.generate("return json", z.object({ answer: z.string() }));
    expect(result.answer).toBe("ok");
    expect(calls).toEqual(["http://model.local/v1/chat/completions"]);
  });
});
