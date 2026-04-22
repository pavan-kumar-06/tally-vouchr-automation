const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

let isRefreshing = false;
let refreshSubscribers: Array<(success: boolean) => void> = [];

function subscribeTokenRefresh(callback: (success: boolean) => void) {
  refreshSubscribers.push(callback);
}

function onTokenRefresh(success: boolean) {
  refreshSubscribers.forEach((cb) => cb(success));
  refreshSubscribers = [];
}

async function handleResponse<T>(res: Response, retry?: () => Promise<T>): Promise<T> {
  if (res.status === 401) {
    // Try to refresh token once
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (refreshRes.ok) {
          onTokenRefresh(true);
          // Retry the original request
          if (retry) return retry();
        } else {
          onTokenRefresh(false);
          // Refresh failed — clear cookies and redirect to login
          await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
          window.location.href = "/login";
        }
      } finally {
        isRefreshing = false;
      }
    } else {
      // Already refreshing — wait for it
      await new Promise<void>((resolve) => {
        subscribeTokenRefresh((success) => {
          if (success) resolve();
          else {
            window.location.href = "/login";
            resolve();
          }
        });
      });
      if (retry) return retry();
    }
    throw new Error("UNAUTHORIZED");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // ── Auth ──────────────────────────────────────────────────
  async signup(email: string, password: string, name: string, organizationName?: string) {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, organization_name: organizationName }),
    });
    return handleResponse<{ ok: boolean; user: { id: string; email: string; name: string }; organization: { id: string; name: string; role: string } }>(res);
  },

  async login(email: string, password: string) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return handleResponse<{ ok: boolean; user: { id: string; email: string; name: string }; organization: { id: string; name: string; role: string } }>(res);
  },

  async logout() {
    const res = await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    return handleResponse<{ ok: boolean }>(res);
  },

  async me() {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
    if (res.status === 401) return null;
    return handleResponse<{ user: { id: string; email: string; name: string }; organization: { id: string; name: string; role: string } }>(res);
  },

  async refresh() {
    const res = await fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "include" });
    return handleResponse<{ ok: boolean }>(res);
  },

  // ── Companies ────────────────────────────────────────────────
  async getCompanies() {
    const res = await fetch(`${API_BASE}/api/companies`, { credentials: "include" });
    if (res.status === 401) throw new Error("UNAUTHORIZED");
    if (!res.ok) return [];
    return handleResponse<any[]>(res);
  },

  async createCompany(payload: { name: string; tallyCompanyName?: string; tallyCompanyRemoteId?: string }) {
    const res = await fetch(`${API_BASE}/api/companies`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return handleResponse<any>(res);
  },

  async patchCompany(companyId: string, payload: { tallyCompanyName?: string; tallyCompanyRemoteId?: string }) {
    const res = await fetch(`${API_BASE}/api/companies/${companyId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return handleResponse<any>(res);
  },

  async getCompanyStatements(companyId: string) {
    const res = await fetch(`${API_BASE}/api/companies/${companyId}/statements`, { credentials: "include" });
    if (res.status === 401) throw new Error("UNAUTHORIZED");
    if (!res.ok) return [];
    return handleResponse<any[]>(res);
  },

  async getCompanyBankLedgers(companyId: string) {
    const res = await fetch(`${API_BASE}/api/companies/${companyId}/bank-ledgers`, { credentials: "include" });
    if (res.status === 401) throw new Error("UNAUTHORIZED");
    if (!res.ok) return { names: [] };
    return handleResponse<{ names: string[]; source: string }>(res);
  },

  async checkDuplicateStatement(companyId: string, filename: string) {
    const res = await fetch(`${API_BASE}/api/companies/${companyId}/statements/duplicate-check?filename=${encodeURIComponent(filename)}`, { credentials: "include" });
    if (res.status === 401) throw new Error("UNAUTHORIZED");
    return handleResponse<{ exists: boolean; statementId: string | null }>(res);
  },

  // ── Statements ───────────────────────────────────────────────
  async createStatementUpload(payload: {
    companyId: string;
    filename: string;
    contentType?: string;
    bankLedgerName?: string;
    extractionPeriodFrom?: string;
    extractionPeriodTo?: string;
    passwordProtected?: boolean;
  }) {
    const res = await fetch(`${API_BASE}/api/statements/upload-url`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return handleResponse<{ statementId: string; sourceR2Key: string; uploadUrl: string }>(res);
  },

  async processStatement(statementId: string, filePassword?: string) {
    const res = await fetch(`${API_BASE}/api/statements/${statementId}/process`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePassword }),
    });
    return handleResponse<any>(res);
  },

  async getStatementEntries(statementId: string) {
    const res = await fetch(`${API_BASE}/api/statements/${statementId}/entries`, { credentials: "include" });
    if (res.status === 401) throw new Error("UNAUTHORIZED");
    if (res.status === 404) return null;
    return handleResponse<any>(res);
  },

  async putStatementEntries(statementId: string, entries: any[], extractionModel?: string) {
    const res = await fetch(`${API_BASE}/api/statements/${statementId}/entries`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries, extractionModel }),
    });
    return handleResponse<any>(res);
  },

  async archiveStatement(statementId: string, archived = true) {
    const res = await fetch(`${API_BASE}/api/statements/${statementId}/archive`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    });
    return handleResponse<any>(res);
  },

  async deleteStatement(statementId: string) {
    const res = await fetch(`${API_BASE}/api/statements/${statementId}/archive`, {
      method: "DELETE",
      credentials: "include",
    });
    return handleResponse<any>(res);
  },

  async patchStatement(statementId: string, payload: { bankLedgerName?: string | null }) {
    const res = await fetch(`${API_BASE}/api/statements/${statementId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return handleResponse<any>(res);
  },

  async getStatementPreview(statementId: string) {
    const res = await fetch(`${API_BASE}/api/statements/${statementId}/preview`, { credentials: "include" });
    if (res.status === 401) throw new Error("UNAUTHORIZED");
    if (res.status === 404) return null;
    return handleResponse<any>(res);
  },

  async getStatementReviewContext(statementId: string) {
    const res = await fetch(`${API_BASE}/api/statements/${statementId}/review-context`, { credentials: "include" });
    if (res.status === 401) throw new Error("UNAUTHORIZED");
    if (res.status === 404) return null;
    return handleResponse<any>(res);
  },

  // ── Connector ───────────────────────────────────────────────
  async getDiscovery() {
    const res = await fetch(`${API_BASE}/api/connector/discovery`, { credentials: "include" });
    if (res.status === 401) return [];
    if (!res.ok) return [];
    return handleResponse<any[]>(res);
  },

  async getMappedCompanies() {
    const res = await fetch(`${API_BASE}/api/connector/mapped-companies`, {
      credentials: "include",
      headers: { "x-connector-token": process.env.CONNECTOR_SHARED_TOKEN ?? "" },
    });
    return handleResponse<any>(res);
  },

  async triggerSync(companyId: string, orgId: string, tallyRemoteId: string) {
    const res = await fetch(`${API_BASE}/api/connector/sync`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, orgId, tallyRemoteId }),
    });
    return handleResponse<any>(res);
  },

  async getSyncStatus(syncId: string) {
    const res = await fetch(`${API_BASE}/api/connector/status/${syncId}`, { credentials: "include" });
    return handleResponse<any>(res);
  },
};
