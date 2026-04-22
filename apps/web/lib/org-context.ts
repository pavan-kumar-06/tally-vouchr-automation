import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { company, member, organization } from "@vouchr/db";
import { getEnv } from "@/lib/env";

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
  // Use Python BE /auth/me for session (reads vouchr_access JWT cookie)
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";

  const env = getEnv();
  let res: Response;
  try {
    res = await fetch(`${env.WORKER_BASE_URL}/auth/me`, {
      headers: { cookie: cookieHeader },
      credentials: "include",
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  const sessionData = await res.json() as {
    user: { id: string; email: string; name: string };
    organization: { id: string; name: string; role: string };
  };

  const orgId = await getOrCreateOrgId({
    user: { id: sessionData.user.id },
    session: { activeOrganizationId: sessionData.organization.id },
  });

  return {
    session: sessionData as unknown as Parameters<typeof getOrCreateOrgId>[0]["session"],
    orgId,
    userId: sessionData.user.id,
    email: sessionData.user.email,
    name: sessionData.user.name,
    orgName: sessionData.organization.name,
    role: sessionData.organization.role,
  };
}

export async function getCompanyForOrg(companyId: string, orgId: string) {
  return db.query.company.findFirst({
    where: and(eq(company.id, companyId), eq(company.organizationId, orgId))
  });
}
