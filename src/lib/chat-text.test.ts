import { describe, expect, it } from "vitest";
import { MAX_CHAT_MESSAGE_LENGTH, chatPreview, cleanChatBody } from "@/lib/chat-text";

describe("cleanChatBody", () => {
  it("trims the message and keeps ordinary text as typed", () => {
    expect(cleanChatBody("  Please call the Pune client today.  ")).toEqual({
      ok: true,
      body: "Please call the Pune client today.",
    });
  });

  it("keeps Hindi, rupee signs and emoji", () => {
    const text = "नमस्ते, quote ₹1,25,000 भेज दिया 👍";
    expect(cleanChatBody(text)).toEqual({ ok: true, body: text });
  });

  it("normalises line endings and collapses long runs of blank lines", () => {
    expect(cleanChatBody("one\r\ntwo\r\n\r\n\r\n\r\nthree")).toEqual({ ok: true, body: "one\ntwo\n\nthree" });
  });

  it("removes control characters and text-direction marks", () => {
    expect(cleanChatBody("a\u0000b\u0007c‮d⁦e")).toEqual({ ok: true, body: "abcde" });
  });

  it("keeps tabs and new lines", () => {
    expect(cleanChatBody("a\tb\nc")).toEqual({ ok: true, body: "a\tb\nc" });
  });

  it("refuses an empty message, blank spaces and things that are not text", () => {
    expect(cleanChatBody("")).toMatchObject({ ok: false });
    expect(cleanChatBody("   \n  ")).toMatchObject({ ok: false });
    expect(cleanChatBody(null)).toMatchObject({ ok: false });
    expect(cleanChatBody(42)).toMatchObject({ ok: false });
  });

  it("allows the longest permitted message and refuses one character more", () => {
    expect(cleanChatBody("x".repeat(MAX_CHAT_MESSAGE_LENGTH)).ok).toBe(true);
    const tooLong = cleanChatBody("x".repeat(MAX_CHAT_MESSAGE_LENGTH + 1));
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.error).toContain(String(MAX_CHAT_MESSAGE_LENGTH));
  });
});

describe("chatPreview", () => {
  it("flattens line breaks into one line", () => {
    expect(chatPreview("first line\n\nsecond   line")).toBe("first line second line");
  });

  it("shortens long text with an ellipsis", () => {
    const preview = chatPreview("word ".repeat(40), 20);
    expect(preview.length).toBeLessThanOrEqual(20);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("leaves short text alone", () => {
    expect(chatPreview("ok")).toBe("ok");
  });
});
