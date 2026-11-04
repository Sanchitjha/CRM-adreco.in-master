import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildTemplatePayload,
  cleanTemplateParam,
  describeApiError,
  isWhatsAppCloudConfigured,
  normalizeWhatsAppNumber,
  sendWhatsAppTemplate,
} from "@/lib/whatsapp-cloud";

afterEach(() => vi.unstubAllEnvs());

describe("normalizeWhatsAppNumber", () => {
  it("adds the Indian country code to a ten-digit number", () => {
    expect(normalizeWhatsAppNumber("98765 43210")).toBe("919876543210");
  });

  it("reads the ways people write Indian numbers", () => {
    for (const written of ["+91 98765 43210", "091-98765-43210", "0091 9876543210", "09876543210", "919876543210"]) {
      expect(normalizeWhatsAppNumber(written)).toBe("919876543210");
    }
  });

  it("keeps a number that already has another country code", () => {
    expect(normalizeWhatsAppNumber("+44 7911 123456")).toBe("447911123456");
  });

  it("refuses what cannot be a phone number", () => {
    for (const bad of ["", "   ", "12345", "abc", "9876", "1234567890123456"]) {
      expect(normalizeWhatsAppNumber(bad)).toBeNull();
    }
    expect(normalizeWhatsAppNumber(null)).toBeNull();
    expect(normalizeWhatsAppNumber(undefined)).toBeNull();
  });
});

describe("cleanTemplateParam", () => {
  it("flattens line breaks, tabs and runs of spaces", () => {
    expect(cleanTemplateParam("a\nb\t c      d")).toBe("a b c d");
  });

  it("never returns an empty value", () => {
    expect(cleanTemplateParam("   ")).toBe("-");
  });

  it("limits the length", () => {
    expect(cleanTemplateParam("x".repeat(5000)).length).toBe(1000);
  });
});

describe("buildTemplatePayload", () => {
  it("builds the request Meta expects for a template with text values", () => {
    expect(buildTemplatePayload({ to: "919876543210", template: "daily_crm_update", language: "en", params: ["a", "b\nc"] })).toEqual({
      messaging_product: "whatsapp",
      to: "919876543210",
      type: "template",
      template: {
        name: "daily_crm_update",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "a" },
              { type: "text", text: "b c" },
            ],
          },
        ],
      },
    });
  });
});

describe("describeApiError", () => {
  it("uses the detail Meta gives, with the status and code", () => {
    expect(
      describeApiError(400, { error: { message: "Invalid parameter", code: 100, error_data: { details: "Template not found" } } }),
    ).toBe("WhatsApp API error 400 (code 100): Template not found");
  });

  it("copes with a body that is not an error object", () => {
    expect(describeApiError(502, null)).toBe("WhatsApp API error 502: no details given");
  });
});

describe("isWhatsAppCloudConfigured", () => {
  it("needs both the phone number id and the access token", () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    expect(isWhatsAppCloudConfigured()).toBe(false);
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123");
    expect(isWhatsAppCloudConfigured()).toBe(false);
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token");
    expect(isWhatsAppCloudConfigured()).toBe(true);
  });
});

describe("sendWhatsAppTemplate", () => {
  const message = { to: "919876543210", template: "daily_crm_update", language: "en", params: ["x"] };

  function reply(body: unknown, status = 200) {
    return vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
  }

  it("posts to the Graph API with the token and returns the message id", async () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "555");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "secret-token");
    vi.stubEnv("WHATSAPP_API_VERSION", "v99.0");
    const fetchMock = reply({ messages: [{ id: "wamid.ABC" }] });

    const result = await sendWhatsAppTemplate(message, fetchMock as unknown as typeof fetch);

    expect(result).toEqual({ messageId: "wamid.ABC" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v99.0/555/messages");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer secret-token");
    expect(JSON.parse(init.body).template.name).toBe("daily_crm_update");
  });

  it("explains a refusal without ever including the token", async () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "555");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "secret-token");
    const fetchMock = reply({ error: { message: "Recipient not in allowed list", code: 131030 } }, 400);

    const error = await sendWhatsAppTemplate(message, fetchMock as unknown as typeof fetch).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("WhatsApp API error 400 (code 131030): Recipient not in allowed list");
    expect((error as Error).message).not.toContain("secret-token");
  });

  it("complains when the answer has no message id", async () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "555");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "t");
    await expect(sendWhatsAppTemplate(message, reply({}) as unknown as typeof fetch)).rejects.toThrow("no message id");
  });

  it("refuses to send when WhatsApp is not set up", async () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    const fetchMock = reply({});
    await expect(sendWhatsAppTemplate(message, fetchMock as unknown as typeof fetch)).rejects.toThrow("not set up");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
