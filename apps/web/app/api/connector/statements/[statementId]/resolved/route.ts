import { GetObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { r2Client } from "@/lib/r2";
import { statement } from "@vouchr/db";

export async function GET(request: Request, { params }: { params: Promise<{ statementId: string }> }) {
  const env = getEnv();
  const connectorToken = request.headers.get("x-connector-token");
  if (connectorToken !== env.CONNECTOR_SHARED_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { statementId } = await params;
  const statementEntity = await db.query.statement.findFirst({ where: eq(statement.id, statementId) });
  if (!statementEntity || !statementEntity.resultR2Key) {
    return NextResponse.json({ error: "Resolved statement not found" }, { status: 404 });
  }

  const object = await r2Client.send(
    new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: statementEntity.resultR2Key
    })
  );

  const jsonText = await object.Body?.transformToString();
  if (!jsonText) {
    return NextResponse.json({ error: "Statement payload empty" }, { status: 500 });
  }

  return new NextResponse(jsonText, {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}
