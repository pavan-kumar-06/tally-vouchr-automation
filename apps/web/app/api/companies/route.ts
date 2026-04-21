import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { member, organization, company } from "@vouchr/db";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

async function getOrCreateOrgId(sessionObj: any) {
  if (sessionObj.session.activeOrganizationId) {
    return sessionObj.session.activeOrganizationId;
  }
  
  const existingMember = await db.query.member.findFirst({
    where: eq(member.userId, sessionObj.user.id)
  });
  
  if (existingMember) {
    return existingMember.organizationId;
  }
  
  // Create default org
  const orgId = `org_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.insert(organization).values({
    id: orgId,
    name: "My Organization",
    slug: `org-${crypto.randomUUID().substring(0,8)}`,
    createdAt: new Date(),
  });
  
  await db.insert(member).values({
    id: `mem_${crypto.randomUUID().replaceAll("-", "")}`,
    userId: sessionObj.user.id,
    organizationId: orgId,
    role: "owner",
    createdAt: new Date(),
  });
  
  return orgId;
}

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = await getOrCreateOrgId(session);

  const companies = await db.query.company.findMany({
    where: eq(company.organizationId, orgId)
  });

  return NextResponse.json(companies);
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = await getOrCreateOrgId(session);
  const { name, tallyCompanyName, tallyCompanyRemoteId } = await request.json();
  const id = `cmp_${crypto.randomUUID().replaceAll("-", "")}`;

  await db.insert(company).values({
    id,
    name,
    organizationId: orgId,
    ownerId: session.user.id,
    tallyCompanyName: tallyCompanyName || null,
    tallyCompanyRemoteId: tallyCompanyRemoteId || null,
    updatedAt: new Date(),
    createdAt: new Date(),
  });

  return NextResponse.json({ id, name });
}
