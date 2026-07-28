// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  window.localStorage.clear();
  vi.resetModules();
});

describe("i18n document language", () => {
  it("sets the initial html language and restores it after a module reload", async () => {
    window.localStorage.setItem("i18nextLng", "fr");
    document.documentElement.lang = "";

    const first = await import("./i18n");
    await first.default.changeLanguage("fr");
    expect(document.documentElement.lang).toBe("fr");

    document.documentElement.lang = "";
    vi.resetModules();
    await import("./i18n");

    expect(document.documentElement.lang).toBe("fr");
  });
});
