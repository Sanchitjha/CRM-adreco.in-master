import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const globalForS3 = globalThis as unknown as { s3Client: S3Client | undefined };

function getClient() {
  if (!globalForS3.s3Client) {
    globalForS3.s3Client = new S3Client({
      region: process.env.AWS_REGION || "ap-south-1",
      // Without these two lines the AWS library adds a checksum of an EMPTY body (x-amz-checksum-crc32) to every signed
      // upload link. The browser then sends a real file, S3 compares the two checksums and refuses the upload. A link
      // cannot carry the checksum of a file that does not exist yet, so checksums are only added where S3 requires one.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: process.env.AWS_ACCESS_KEY_ID
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          }
        : undefined,
    });
  }
  return globalForS3.s3Client;
}

const BUCKET = () => {
  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) throw new Error("S3_BUCKET_NAME is not configured.");
  return bucket;
};

export function documentS3Key(leadId: string, documentId: string, fileName: string) {
  return `leads/${leadId}/${documentId}-${fileName}`;
}

export async function getUploadUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({ Bucket: BUCKET(), Key: key, ContentType: contentType });
  return getSignedUrl(getClient(), command, { expiresIn: 300 });
}

/** Reads a stored file into memory, refusing anything larger than `maxBytes`. Used to attach it to an email. */
export async function getObjectBytes(key: string, maxBytes: number): Promise<Buffer> {
  const response = await getClient().send(new GetObjectCommand({ Bucket: BUCKET(), Key: key }));
  if ((response.ContentLength ?? 0) > maxBytes) throw new Error("A file is too large to attach.");
  const bytes = await response.Body?.transformToByteArray();
  if (!bytes) throw new Error("A file could not be read.");
  if (bytes.byteLength > maxBytes) throw new Error("A file is too large to attach.");
  return Buffer.from(bytes);
}

/** The size of a stored file in bytes, or null if there is no such file (used to check an upload really arrived). */
export async function getObjectSize(key: string): Promise<number | null> {
  try {
    const head = await getClient().send(new HeadObjectCommand({ Bucket: BUCKET(), Key: key }));
    return head.ContentLength ?? null;
  } catch {
    return null;
  }
}

/**
 * A link for showing a stored photo or video in the page (it lasts an hour, so a page left open still works), or for
 * downloading any other file under its own name.
 */
export async function getAttachmentUrl(key: string, options: { fileName: string; inline: boolean }) {
  const safeName = options.fileName.replace(/["\\\r\n]/g, "_");
  const command = new GetObjectCommand({
    Bucket: BUCKET(),
    Key: key,
    ResponseContentDisposition: `${options.inline ? "inline" : "attachment"}; filename="${safeName}"`,
  });
  return getSignedUrl(getClient(), command, { expiresIn: 3600 });
}

export async function getDownloadUrl(key: string) {
  const command = new GetObjectCommand({ Bucket: BUCKET(), Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: 300 });
}
