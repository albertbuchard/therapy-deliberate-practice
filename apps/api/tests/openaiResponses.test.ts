import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import { createStructuredResponse, createTextResponse } from "../src/providers/openaiResponses";

const mockFetchOnce = (payload: unknown, status = 200, headers?: Record<string, string>) => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers
    });
};

test("createTextResponse extracts output_text", async () => {
  mockFetchOnce({
    output: [{ content: [{ type: "output_text", text: "hello world" }] }]
  });

  const result = await createTextResponse({
    apiKey: "test-key",
    model: "gpt-5.1",
    input: "hi"
  });

  assert.equal(result.text, "hello world");
});

test("createStructuredResponse validates with Zod", async () => {
  mockFetchOnce({
    output: [{ content: [{ type: "output_text", text: "{\"ok\":true}" }] }]
  });

  const schema = z.object({ ok: z.boolean() });
  const result = await createStructuredResponse({
    apiKey: "test-key",
    model: "gpt-5.1",
    input: "payload",
    schemaName: "TestSchema",
    schema
  });

  assert.deepEqual(result.value, { ok: true });
});

test("no direct OpenAI fetch usage outside providers (except key validation)", async () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const srcRoot = path.resolve(__dirname, "../src");
  const providerRoot = path.join(srcRoot, "providers");
  const allowedFile = path.join(srcRoot, "app.ts");

  const files: string[] = [];
  const walk = async (dir: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        files.push(full);
      }
    }
  };

  await walk(srcRoot);
  const offenders: string[] = [];
  for (const file of files) {
    const contents = await fs.readFile(file, "utf8");
    if (!contents.includes("api.openai.com/v1")) continue;
    if (file === allowedFile) continue;
    if (file.startsWith(providerRoot)) continue;
    offenders.push(path.relative(srcRoot, file));
  }

  assert.deepEqual(offenders, []);
});
