import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const globalForS3 = globalThis as unknown as { s3Client: S3Client | undefined };

function getClient() {
  if (!globalForS3.s3Client) {
    globalForS3.s3Client = new S3Client({
      region: process.env.AWS_REGION || "ap-south-1",
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

export async function getDownloadUrl(key: string) {
  const command = new GetObjectCommand({ Bucket: BUCKET(), Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: 300 });
}
