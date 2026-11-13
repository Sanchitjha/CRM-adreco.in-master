import { describe, expect, it, vi } from "vitest";
import type { AiConfig } from "./ai";
import { buildColumnPrompt, headingsSafeToSend, parseColumnAnswer, suggestColumns } from "./column-ai";

const CONFIG: AiConfig = { provider: "gemini", apiKey: "test-key-123", model: "test-model" };

const geminiAnswer = (json: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] }), { status: 200 });

describe("headingsSafeToSend", () => {
  it("accepts a row of ordinary headings", () => {
    expect(headingsSafeToSend(["Sr No", "Party Name", "Mob", "Executive", "Date"])).toBe(true);
    expect(headingsSafeToSend(["", "Name"])).toBe(true);
  });

  it("refuses a first row that holds a phone number or an email address", () => {
    expect(headingsSafeToSend(["Asha", "98765 43210"])).toBe(false);
    expect(headingsSafeToSend(["asha@example.test", "Name"])).toBe(false);
  });

  it("refuses a very long cell, which is a sentence of data rather than a heading", () => {
    expect(headingsSafeToSend(["x".repeat(120)])).toBe(false);
  });
});

describe("buildColumnPrompt", () => {
  it("lists the headings by number and the fields they can match", () => {
    const prompt = buildColumnPrompt(["Party Name", "Mob"]);
    expect(JSON.parse(prompt.user)).toEqual({
      headings: [
        { index: 0, text: "Party Name" },
        { index: 1, text: "Mob" },
      ],
    });
    expect(prompt.system).toContain("customerName");
    expect(prompt.system).toContain("phone");
    expect(prompt.system).toContain("never see any rows");
  });

  it("skips empty headings but keeps the numbering", () => {
    const prompt = buildColumnPrompt(["Name", "", "Mob"]);
    expect(JSON.parse(prompt.user).headings.map((h: { index: number }) => h.index)).toEqual([0, 2]);
  });
});

describe("parseColumnAnswer", () => {
  it("keeps valid index-to-field pairs", () => {
    const map = parseColumnAnswer({ columns: [{ index: 0, field: "customerName" }, { index: 1, field: "phone" }, { index: 2, field: null }] }, 3);
    expect([...map]).toEqual([[0, "customerName"], [1, "phone"]]);
  });

  it("drops fields that do not exist, indexes out of range and repeats", () => {
    const map = parseColumnAnswer(
      {
        columns: [
          { index: 0, field: "customerName" },
          { index: 1, field: "customerName" },
          { index: 5, field: "phone" },
          { index: 2, field: "nonsense" },
          { index: -1, field: "email" },
          { index: 0, field: "phone" },
          { index: 1.5, field: "email" },
        ],
      },
      3,
    );
    expect([...map]).toEqual([[0, "customerName"]]);
  });

  it("returns nothing for an answer in the wrong shape", () => {
    expect(parseColumnAnswer(null, 3).size).toBe(0);
    expect(parseColumnAnswer({ columns: "x" }, 3).size).toBe(0);
    expect(parseColumnAnswer([1, 2], 3).size).toBe(0);
  });
});

describe("suggestColumns", () => {
  it("sends only the headings, with the key in a header, and returns the matches", async () => {
    const fetchImpl = vi.fn(async () => geminiAnswer({ columns: [{ index: 0, field: "customerName" }, { index: 1, field: "phone" }] }));
    const result = await suggestColumns(CONFIG, ["Party Name", "Mob"], { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result.ok).toBe(true);
    expect(result.ok && [...result.map]).toEqual([[0, "customerName"], [1, "phone"]]);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("test-key-123");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key-123");
    const body = String(init.body);
    expect(body).toContain("Party Name");
    expect(body).toContain("Mob");
  });

  it("does not contact the AI at all when the first row looks like customer data", async () => {
    const fetchImpl = vi.fn();
    const result = await suggestColumns(CONFIG, ["Asha", "9876543210"], { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("says so when the AI recognises nothing or cannot be reached", async () => {
    const nothing = await suggestColumns(CONFIG, ["Foo"], {
      fetchImpl: (async () => geminiAnswer({ columns: [{ index: 0, field: null }] })) as unknown as typeof fetch,
    });
    expect(nothing).toEqual({ ok: false, reason: "The AI did not recognise any of the headings." });

    const down = await suggestColumns(CONFIG, ["Foo"], {
      fetchImpl: (async () => new Response("{}", { status: 403 })) as unknown as typeof fetch,
    });
    expect(down.ok).toBe(false);
    expect(!down.ok && down.reason).not.toContain("test-key-123");
  });
});
