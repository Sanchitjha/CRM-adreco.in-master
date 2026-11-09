import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adviceToJson,
  blockProvider,
  buildLeadFacts,
  clearBlock,
  getAiConfig,
  hashAdviceInput,
  normalizeAdvice,
  type LeadForAi,
} from "@/lib/ai";
import { getLeadAdvice, getLeadInsight } from "@/lib/ai-insight";

const { findUnique, upsert } = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { leadAiAdvice: { findUnique, upsert } } }));

// Everything below is made up. No real customer appears in these tests.
const lead: LeadForAi = {
  id: "lead-1",
  customerName: "Asha Verma",
  phone: "+91 98765 43210",
  email: "asha.verma@example.com",
  productCategory: "Commercial heat pump",
  budget: 450000,
  status: "FOLLOW_UP",
  createdAt: new Date("2026-10-20T05:00:00Z"),
  requirementNotes: "Hotel with 40 rooms.",
  followUpCount: 2,
  lastFollowUpDaysAgo: 4,
  hasSurvey: false,
  hasQuotation: true,
  quotationAmount: 520000,
};
const NOW = new Date("2026-10-30T05:00:00Z");

const answer = {
  score: 72,
  urgency: "Urgent",
  summary: "A quotation is out and the customer has been quiet for four days.",
  recommendedAction: "Call to ask whether the quotation answers their questions.",
  whatsappMessage: "Hello {{name}}, we sent you our quotation. Shall I walk you through it?",
};

function geminiReply(status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: async () =>
      status < 400 ? { candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] } : { error: { message: "nope" } },
  });
}

/** What the table holds for this lead: made from the same facts as now, an hour ago, unless changed. */
function savedRow(changes: Record<string, unknown> = {}) {
  const config = getAiConfig()!;
  return {
    leadId: lead.id,
    insight: adviceToJson(normalizeAdvice(answer)!),
    inputHash: hashAdviceInput(config, buildLeadFacts(lead, NOW)),
    provider: "gemini",
    model: config.model,
    generatedAt: new Date(NOW.getTime() - 3600_000),
    ...changes,
  };
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key-123");
  vi.stubEnv("GEMINI_MODEL", "gemini-test-model");
  vi.stubEnv("OPENAI_API_KEY", "");
  findUnique.mockReset();
  upsert.mockReset();
  upsert.mockResolvedValue({});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  clearBlock("gemini");
});

describe("getLeadAdvice", () => {
  it("gives the built-in advice, touching neither the database nor the AI, when no key is set", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const fetchMock = geminiReply();
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await getLeadAdvice(lead, { now: NOW });

    expect(outcome.kind).toBe("rules");
    expect(outcome.insight.source).toBe("rules");
    expect(findUnique).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not ask the AI about a won or a lost lead", async () => {
    const fetchMock = geminiReply();
    vi.stubGlobal("fetch", fetchMock);

    for (const status of ["CONVERTED", "LOST"]) {
      const outcome = await getLeadAdvice({ ...lead, status }, { now: NOW });
      expect(outcome.kind).toBe("rules");
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("shows the saved answer without asking while it is fresh and the lead is unchanged", async () => {
    findUnique.mockResolvedValue(savedRow());
    const fetchMock = geminiReply();
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await getLeadAdvice(lead, { now: NOW });

    expect(outcome.kind).toBe("cached");
    expect(outcome.insight).toMatchObject({ source: "ai", model: "gemini-test-model", score: 72, winProbability: "High" });
    expect(outcome.insight.suggestedWhatsAppMessage).toBe("Hello Asha Verma, we sent you our quotation. Shall I walk you through it?");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("asks and saves the answer when nothing is saved yet", async () => {
    findUnique.mockResolvedValue(null);
    const fetchMock = geminiReply();
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await getLeadAdvice(lead, { now: NOW });

    expect(outcome.kind).toBe("generated");
    expect(outcome.insight).toMatchObject({ source: "ai", model: "gemini-test-model", score: 72 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const saved = upsert.mock.calls[0][0];
    expect(saved.where).toEqual({ leadId: "lead-1" });
    expect(saved.create).toMatchObject({
      leadId: "lead-1",
      provider: "gemini",
      model: "gemini-test-model",
      inputHash: hashAdviceInput(getAiConfig()!, buildLeadFacts(lead, NOW)),
    });
    // The name is not kept in the saved answer: it is filled in when the advice is shown.
    expect(JSON.stringify(saved.create.insight)).not.toContain("Asha");
    expect(JSON.stringify(saved.create.insight)).toContain("{{name}}");
  });

  it("asks again when the lead has changed in a way the AI is told about", async () => {
    findUnique.mockResolvedValue(savedRow({ inputHash: "made-from-older-facts" }));
    const fetchMock = geminiReply();
    vi.stubGlobal("fetch", fetchMock);

    expect((await getLeadAdvice(lead, { now: NOW })).kind).toBe("generated");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks again when the saved answer is more than a day old", async () => {
    findUnique.mockResolvedValue(savedRow({ generatedAt: new Date(NOW.getTime() - 25 * 3600_000) }));
    const fetchMock = geminiReply();
    vi.stubGlobal("fetch", fetchMock);

    expect((await getLeadAdvice(lead, { now: NOW })).kind).toBe("generated");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores a saved answer in a format it cannot read", async () => {
    findUnique.mockResolvedValue(savedRow({ insight: { something: "else" } }));
    const fetchMock = geminiReply();
    vi.stubGlobal("fetch", fetchMock);

    expect((await getLeadAdvice(lead, { now: NOW })).kind).toBe("generated");
  });

  it("keeps showing the earlier answer when a day-old answer cannot be renewed", async () => {
    findUnique.mockResolvedValue(savedRow({ generatedAt: new Date(NOW.getTime() - 25 * 3600_000) }));
    vi.stubGlobal("fetch", geminiReply(500));

    const outcome = await getLeadAdvice(lead, { now: NOW });

    expect(outcome.kind).toBe("failed");
    expect(outcome.kind === "failed" && outcome.reason).toContain("Gemini error 500");
    expect(outcome.insight.source).toBe("ai");
    expect(outcome.insight.note).toContain("earlier advice");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("falls back to the built-in advice, with a note, when there is no earlier answer", async () => {
    findUnique.mockResolvedValue(null);
    vi.stubGlobal("fetch", geminiReply(403));

    const outcome = await getLeadAdvice(lead, { now: NOW });

    expect(outcome.kind).toBe("failed");
    expect(outcome.insight.source).toBe("rules");
    expect(outcome.insight.note).toContain("built-in advice");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("does not use an earlier answer made from different facts as a fallback", async () => {
    findUnique.mockResolvedValue(savedRow({ inputHash: "made-from-older-facts" }));
    vi.stubGlobal("fetch", geminiReply(500));

    const outcome = await getLeadAdvice(lead, { now: NOW });
    expect(outcome.insight.source).toBe("rules");
  });

  it("leaves a provider alone while it is paused after a problem, unless a person presses Refresh", async () => {
    findUnique.mockResolvedValue(null);
    const fetchMock = geminiReply();
    vi.stubGlobal("fetch", fetchMock);
    blockProvider("gemini", 60_000, NOW.getTime());

    const paused = await getLeadAdvice(lead, { now: NOW });
    expect(paused.kind).toBe("failed");
    expect(paused.kind === "failed" && paused.reason).toContain("Paused for another 60 seconds");
    expect(fetchMock).not.toHaveBeenCalled();

    const refreshed = await getLeadAdvice(lead, { now: NOW, refresh: true });
    expect(refreshed.kind).toBe("generated");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks once when Refresh is pressed twice in a row", async () => {
    const fetchMock = geminiReply();
    vi.stubGlobal("fetch", fetchMock);

    findUnique.mockResolvedValue(savedRow({ generatedAt: new Date(NOW.getTime() - 10_000) }));
    expect((await getLeadAdvice(lead, { now: NOW, refresh: true })).kind).toBe("cached");
    expect(fetchMock).not.toHaveBeenCalled();

    findUnique.mockResolvedValue(savedRow({ generatedAt: new Date(NOW.getTime() - 40_000) }));
    expect((await getLeadAdvice(lead, { now: NOW, refresh: true })).kind).toBe("generated");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the built-in advice, and does not ask (or pay), when the saved advice cannot be read", async () => {
    findUnique.mockRejectedValue(new Error('relation "LeadAiAdvice" does not exist'));
    const fetchMock = geminiReply();
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await getLeadAdvice(lead, { now: NOW });

    expect(outcome.kind).toBe("rules");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still shows a good answer when saving it fails", async () => {
    findUnique.mockResolvedValue(null);
    upsert.mockRejectedValue(new Error("database down"));
    vi.stubGlobal("fetch", geminiReply());

    expect((await getLeadAdvice(lead, { now: NOW })).kind).toBe("generated");
  });
});

describe("getLeadInsight", () => {
  it("returns just the advice", async () => {
    findUnique.mockResolvedValue(savedRow({ generatedAt: new Date(Date.now() - 1000), inputHash: "x" }));
    vi.stubGlobal("fetch", geminiReply());

    const insight = await getLeadInsight(lead);
    expect(insight).toMatchObject({ source: "ai", score: 72 });
  });

  it("never fails, whatever goes wrong", async () => {
    findUnique.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));

    const insight = await getLeadInsight(lead);
    expect(insight.source).toBe("rules");
    expect(insight.note).toBeDefined();
  });
});
