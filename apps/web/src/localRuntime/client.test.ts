import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkLocalRuntimeHealth,
  getLocalRuntimeDetails,
  isLocalRuntimePairingError,
  loadLocalRuntimePairingKey,
  normalizeLocalRuntimeBaseUrl,
  removeLocalRuntimePairingKey,
  requireLocalRuntimePairingKey,
  resolveLocalRuntimeGatewayOrigin,
  saveLocalRuntimePairingKey
} from "./client";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    },
    setTimeout,
    clearTimeout
  });
});

describe("local runtime connection boundary", () => {
  it("accepts only loopback HTTP origins", () => {
    expect(normalizeLocalRuntimeBaseUrl("http://127.0.0.1:8484/")).toBe(
      "http://127.0.0.1:8484"
    );
    expect(normalizeLocalRuntimeBaseUrl("http://localhost:8484")).toBe(
      "http://localhost:8484"
    );
    expect(() => normalizeLocalRuntimeBaseUrl("https://attacker.example")).toThrow(
      /localhost/
    );
    expect(() =>
      normalizeLocalRuntimeBaseUrl("http://127.0.0.1:8484/v1/responses")
    ).toThrow(/path/);
  });

  it("requires speech and evaluation to share one paired gateway origin", () => {
    expect(
      resolveLocalRuntimeGatewayOrigin({
        baseUrl: "http://127.0.0.1:8484",
        sttUrl: "http://127.0.0.1:8484/",
        llmUrl: null
      })
    ).toBe("http://127.0.0.1:8484");
    expect(() =>
      resolveLocalRuntimeGatewayOrigin({
        sttUrl: "http://127.0.0.1:8484",
        llmUrl: "http://127.0.0.1:8585"
      })
    ).toThrow(/same local gateway/);
  });

  it("stores pairing keys per loopback origin", () => {
    const token = "a".repeat(64);
    saveLocalRuntimePairingKey("http://127.0.0.1:8484", token);

    expect(loadLocalRuntimePairingKey("http://127.0.0.1:8484/")).toBe(token);
    expect(loadLocalRuntimePairingKey("http://127.0.0.1:8585")).toBe("");
    expect(requireLocalRuntimePairingKey("http://127.0.0.1:8484")).toBe(token);
    removeLocalRuntimePairingKey("http://127.0.0.1:8484");
    expect(() => requireLocalRuntimePairingKey("http://127.0.0.1:8484")).toThrow(
      /Pair this browser/
    );
  });

  it("rejects an unrelated service on the configured port", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ service: "other", status: "ready" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
    );

    await expect(checkLocalRuntimeHealth("http://127.0.0.1:8484")).rejects.toThrow(
      /different service/
    );
  });

  it("rejects an incompatible gateway protocol", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            service: "therapy-local-runtime",
            protocol_version: "0",
            status: "ready"
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      )
    );

    await expect(checkLocalRuntimeHealth("http://127.0.0.1:8484")).rejects.toThrow(
      /not compatible/
    );
  });

  it("preserves a 401 as a pairing recovery error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ detail: "Invalid pairing key." }), {
          status: 401,
          headers: { "content-type": "application/json" }
        })
      )
    );
    const request = getLocalRuntimeDetails(
      "http://127.0.0.1:8484",
      "expired-pairing-key"
    );
    await expect(request).rejects.toSatisfy(isLocalRuntimePairingError);
  });
});
