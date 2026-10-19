import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getClient() {
  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        }
      : undefined,
  });
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

export async function getDownloadUrl(key: string) {
  const command = new GetObjectCommand({ Bucket: BUCKET(), Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: 300 });
}
