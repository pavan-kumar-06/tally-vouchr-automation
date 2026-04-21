import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { company, member, organization } from "@vouchr/db";

async function getOrCreateOrgId(sessionObj: {
  user: { id: string };
  session: { activeOrganizationId?: string | null };
}) {
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

export async function resolveSessionOrg() {
  const session = await auth.api.getSession({
    headers: await headers()
  });
  if (!session) return null;
  const orgId = await getOrCreateOrgId(session);
  return { session, orgId };
}

export async function getCompanyForOrg(companyId: string, orgId: string) {
  return db.query.company.findFirst({
    where: and(eq(company.id, companyId), eq(company.organizationId, orgId))
  });
}
