import { S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getEnv } from "@/lib/env";

const env = getEnv();

export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY
  }
});

export async function createStatementUploadUrl({
  key,
  contentType,
  expiresIn = 60 * 5
}: {
  key: string;
  contentType: string;
  expiresIn?: number;
}) {
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType
  });

  return getSignedUrl(r2Client, command, { expiresIn });
}

export async function createStatementDownloadUrl({
  key,
  expiresIn = 60 * 5
}: {
  key: string;
  expiresIn?: number;
}) {
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key
  });

  return getSignedUrl(r2Client, command, { expiresIn });
}
export async function getStatementEntries(key: string): Promise<Record<string, unknown> | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key
    });

    const response = await r2Client.send(command);
    if (!response.Body) return null;

    const data = await response.Body.transformToString();
    if (!data || data === "null" || data === "undefined") return null;

    return JSON.parse(data) as Record<string, unknown>;
  } catch (error) {
    console.error("[r2] Failed to get statement entries:", error);
    return null;
  }
}

export async function saveStatementEntries(key: string, data: object) {
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ContentType: "application/json",
    Body: JSON.stringify(data, null, 2)
  });

  await r2Client.send(command);
}
