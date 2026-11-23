import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * src/proxy.ts sends everyone who is not signed in to the sign-in page. That includes a browser asking for a file that the
 * sign-in page itself shows, so such a file is only served if the matcher in `config` leaves it alone.
 */
const SRC = path.resolve(process.cwd(), "src");

/** The paths the proxy runs on, as a regular expression (the matcher is written in the pattern syntax of Next.js). */
function proxyRuns(): RegExp {
  const source = readFileSync(path.join(SRC, "proxy.ts"), "utf8");
  const found = /matcher:\s*\[\s*"([^"]+)"\s*\]/.exec(source);
  if (!found) throw new Error("src/proxy.ts has no matcher written as one quoted string.");
  return new RegExp(`^${found[1]}$`);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("the proxy matcher", () => {
  const runs = proxyRuns();

  it("leaves alone the files that are fetched without a session", () => {
    for (const p of [
      "/adreco-logo.png",
      "/favicon.ico",
      "/manifest.webmanifest",
      "/apple-icon.png",
      "/icons/icon-192.png",
      "/_next/static/chunks/app.js",
    ]) {
      expect(runs.test(p), p).toBe(false);
    }
  });

  it("still runs on the pages", () => {
    for (const p of ["/", "/leads", "/warranty/installed/new", "/admin/users", "/login"]) {
      expect(runs.test(p), p).toBe(true);
    }
  });

  it("serves every image that a page asks for by its own address", () => {
    const asked: { file: string; url: string }[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/src=["'](\/[^"'?#]+\.(?:png|jpe?g|gif|svg|webp|ico))["']/g)) {
        const url = m[1];
        if (url) asked.push({ file: path.relative(SRC, file), url });
      }
    }
    expect(asked.length).toBeGreaterThan(0);
    const blocked = asked.filter(({ url }) => runs.test(url));
    expect(
      blocked,
      "These images would be sent to the sign-in page for a visitor who is not signed in. Add them to the matcher in src/proxy.ts.",
    ).toEqual([]);
  });
});
