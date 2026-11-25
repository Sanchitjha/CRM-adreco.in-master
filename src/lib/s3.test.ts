import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAttachmentUrl, getUploadUrl } from "@/lib/s3";

describe("signed links for the file storage", () => {
  const saved = { ...process.env };

  beforeAll(() => {
    process.env.S3_BUCKET_NAME = "adreco-test-bucket";
    process.env.AWS_REGION = "ap-south-1";
    process.env.AWS_ACCESS_KEY_ID = "AKIATESTONLY";
    process.env.AWS_SECRET_ACCESS_KEY = "test-secret-only";
  });

  afterAll(() => {
    process.env = saved;
  });

  it("makes an upload link that carries no checksum, because the browser sends a file that is not known yet", async () => {
    const url = new URL(await getUploadUrl("leads/attachments/quotation/q1/abc-spec.pdf", "application/pdf"));
    const names = [...url.searchParams.keys()].map((k) => k.toLowerCase());
    expect(url.hostname).toContain("adreco-test-bucket");
    expect(names).toContain("x-amz-signature");
    // A checksum in the link would be the checksum of an empty body, and S3 would refuse every real upload.
    expect(names.filter((k) => k.includes("checksum"))).toEqual([]);
  });

  it("makes a view link that names the file and lasts an hour", async () => {
    const url = new URL(await getAttachmentUrl("leads/attachments/quotation/q1/abc-spec.pdf", { fileName: "Spec sheet.pdf", inline: true }));
    expect(url.searchParams.get("X-Amz-Expires")).toBe("3600");
    expect(url.searchParams.get("response-content-disposition")).toBe('inline; filename="Spec sheet.pdf"');
  });
});
