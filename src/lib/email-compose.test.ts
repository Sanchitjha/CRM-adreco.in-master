import { describe, expect, it } from "vitest";
import {
  MAX_ATTACHMENT_BYTES,
  attachmentProblem,
  buildSignature,
  chooseSender,
  cleanBody,
  cleanSubject,
  isValidEmail,
  parseAddressList,
  parseMailbox,
  plainTextToHtml,
} from "@/lib/email-compose";

describe("isValidEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(isValidEmail("meera.test@example.com")).toBe(true);
    expect(isValidEmail("a+tag@sub.example.co.in")).toBe(true);
  });

  it("rejects things that are not addresses", () => {
    for (const bad of ["", "no-at-sign", "a@b", "a@@b.com", "a b@c.com", "@c.com", "a@.com", "a@c..com"]) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });
});

describe("parseAddressList", () => {
  it("splits on commas, semicolons and spaces, lower-cases and removes duplicates", () => {
    expect(parseAddressList("A@x.com, b@y.com; a@X.com  c@z.com")).toEqual({
      valid: ["a@x.com", "b@y.com", "c@z.com"],
      invalid: [],
    });
  });

  it("accepts an address in angle brackets", () => {
    expect(parseAddressList("<a@x.com>").valid).toEqual(["a@x.com"]);
  });

  it("reports what it could not read", () => {
    expect(parseAddressList("a@x.com, nonsense, b@y")).toEqual({ valid: ["a@x.com"], invalid: ["nonsense", "b@y"] });
  });

  it("handles empty input", () => {
    expect(parseAddressList("")).toEqual({ valid: [], invalid: [] });
    expect(parseAddressList(null)).toEqual({ valid: [], invalid: [] });
  });
});

describe("cleanSubject", () => {
  it("keeps header-injection attempts on one line", () => {
    const subject = cleanSubject("Hello\r\nBcc: someone@example.com");
    expect(subject).toBe("Hello Bcc: someone@example.com");
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it("collapses spaces and trims", () => {
    expect(cleanSubject("  Quotation   QT-0012  ")).toBe("Quotation QT-0012");
  });

  it("returns an empty string for anything that is not text", () => {
    expect(cleanSubject(undefined)).toBe("");
    expect(cleanSubject(7)).toBe("");
  });
});

describe("cleanBody", () => {
  it("normalises line endings, drops control characters and collapses blank lines", () => {
    expect(cleanBody("one\r\ntwo\u0000\r\n\r\n\r\n\r\nthree  ")).toBe("one\ntwo\n\nthree");
  });

  it("keeps Hindi text", () => {
    expect(cleanBody("नमस्ते")).toBe("नमस्ते");
  });
});

describe("plainTextToHtml", () => {
  it("escapes anything that looks like markup", () => {
    const html = plainTextToHtml('<script>alert("x")</script> & more');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; more");
  });

  it("keeps line breaks", () => {
    expect(plainTextToHtml("one\ntwo")).toContain("one<br>\ntwo");
  });

  it("turns web addresses into links and leaves sentence punctuation outside", () => {
    const html = plainTextToHtml("See https://adreco.in/quote?a=1&b=2.");
    expect(html).toContain('<a href="https://adreco.in/quote?a=1&amp;b=2">https://adreco.in/quote?a=1&amp;b=2</a>.');
  });

  it("does not link anything that is not http or https", () => {
    expect(plainTextToHtml("javascript:alert(1) and ftp://x.com")).not.toContain("<a ");
  });
});

describe("buildSignature", () => {
  it("names the sender, their role and the company", () => {
    expect(buildSignature({ name: "Asha Rao", email: "asha@adreco.in", roleLabel: "Sales" }, { name: "Adreco Engineering" })).toBe(
      "Regards,\nAsha Rao\nSales | Adreco Engineering",
    );
  });

  it("adds phone and website when the company has them", () => {
    const signature = buildSignature(
      { name: "Asha Rao", email: "asha@adreco.in", roleLabel: "Sales" },
      { name: "Adreco", phone: "+91 20 5550 1234", website: "https://adreco.in" },
    );
    expect(signature.split("\n").slice(-2)).toEqual(["Phone: +91 20 5550 1234", "https://adreco.in"]);
  });
});

describe("parseMailbox", () => {
  it("reads a name and an address", () => {
    expect(parseMailbox("Adreco Engineering <Sales@Adreco.in>")).toEqual({ name: "Adreco Engineering", address: "sales@adreco.in" });
    expect(parseMailbox('"Adreco, Pune" <sales@adreco.in>')).toEqual({ name: "Adreco, Pune", address: "sales@adreco.in" });
  });

  it("reads a bare address", () => {
    expect(parseMailbox("sales@adreco.in")).toEqual({ name: null, address: "sales@adreco.in" });
  });

  it("gives up on anything else", () => {
    expect(parseMailbox("")).toBeNull();
    expect(parseMailbox(undefined)).toBeNull();
    expect(parseMailbox("Adreco <not-an-address>")).toBeNull();
  });
});

describe("chooseSender", () => {
  const sender = { name: "Asha Rao", email: "asha@adreco.in" };

  it("sends from the company address with the employee's name, and replies go to the employee", () => {
    expect(
      chooseSender({ configuredFrom: "Adreco <sales@adreco.in>", sender, companyName: "Adreco Engineering", perEmployee: false }),
    ).toEqual({ from: { name: "Asha Rao | Adreco Engineering", address: "sales@adreco.in" }, replyTo: "asha@adreco.in" });
  });

  it("uses the employee's own address when asked to and it is on the company's domain", () => {
    const identity = chooseSender({ configuredFrom: "sales@adreco.in", sender, companyName: "Adreco", perEmployee: true });
    expect(identity.from.address).toBe("asha@adreco.in");
  });

  it("keeps the company address when the employee's address is on another domain", () => {
    const identity = chooseSender({
      configuredFrom: "sales@adreco.in",
      sender: { name: "Asha Rao", email: "asha.rao@gmail.com" },
      companyName: "Adreco",
      perEmployee: true,
    });
    expect(identity.from.address).toBe("sales@adreco.in");
    expect(identity.replyTo).toBe("asha.rao@gmail.com");
  });

  it("falls back to a default company address when none is configured", () => {
    expect(chooseSender({ configuredFrom: undefined, sender, companyName: "Adreco", perEmployee: false }).from.address).toBe(
      "no-reply@adreco.in",
    );
  });

  it("keeps quotes, brackets and line breaks out of the display name", () => {
    const identity = chooseSender({
      configuredFrom: "sales@adreco.in",
      sender: { name: 'Asha "Boss" <x>\r\nBcc: y@z.com', email: "asha@adreco.in" },
      companyName: "Adreco",
      perEmployee: false,
    });
    expect(identity.from.name).not.toMatch(/["<>\r\n]/);
  });
});

describe("attachmentProblem", () => {
  it("accepts files that fit together", () => {
    expect(attachmentProblem([1024, 2048])).toBeNull();
    expect(attachmentProblem([MAX_ATTACHMENT_BYTES])).toBeNull();
    expect(attachmentProblem([])).toBeNull();
  });

  it("explains when they are too large", () => {
    expect(attachmentProblem([MAX_ATTACHMENT_BYTES, 1])).toContain("too large");
  });
});
