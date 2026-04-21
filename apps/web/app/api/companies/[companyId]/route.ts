import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { member, organization, company } from "@vouchr/db";
import { eq, and } from "drizzle-orm";
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

  const orgId = `org_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.insert(organization).values({
    id: orgId,
    name: "My Organization",
    slug: `org-${crypto.randomUUID().substring(0, 8)}`,
    createdAt: new Date()
  });

  await db.insert(member).values({
    id: `mem_${crypto.randomUUID().replaceAll("-", "")}`,
    userId: sessionObj.user.id,
    organizationId: orgId,
    role: "owner",
    createdAt: new Date()
  });

  return orgId;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = await getOrCreateOrgId(session);
  const resolvedParams = await params;
  const { tallyCompanyName, tallyCompanyRemoteId } = await request.json();

  await db
    .update(company)
    .set({
      tallyCompanyName,
      tallyCompanyRemoteId,
      updatedAt: new Date()
    })
    .where(and(eq(company.id, resolvedParams.companyId), eq(company.organizationId, orgId)));

  return NextResponse.json({ ok: true });
}
