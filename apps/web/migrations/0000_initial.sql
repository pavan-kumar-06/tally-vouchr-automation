CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  active_organization_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  id_token TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS organization (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS member (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invitation (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  inviter_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (inviter_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  tally_company_name TEXT,
  tally_company_remote_id TEXT,
  default_bank_ledger_name TEXT,
  connector_last_synced_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES user(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS companies_org_name_unique ON companies (organization_id, name);
CREATE INDEX IF NOT EXISTS companies_org_idx ON companies (organization_id);

CREATE TABLE IF NOT EXISTS tally_masters (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  source_updated_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS tally_masters_company_type_name_unique
ON tally_masters (company_id, type, normalized_name);

CREATE INDEX IF NOT EXISTS tally_masters_company_idx ON tally_masters (company_id);

CREATE TABLE IF NOT EXISTS statements (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL,
  uploaded_by_user_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  source_r2_key TEXT NOT NULL,
  result_r2_key TEXT,
  status TEXT NOT NULL DEFAULT 'UPLOADED',
  bank_ledger_name TEXT,
  password_protected INTEGER NOT NULL DEFAULT 0,
  extraction_period_from TEXT,
  extraction_period_to TEXT,
  entry_count INTEGER NOT NULL DEFAULT 0,
  processing_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES user(id)
);

CREATE INDEX IF NOT EXISTS statements_company_status_idx ON statements (company_id, status);
CREATE INDEX IF NOT EXISTS statements_created_idx ON statements (created_at);

CREATE TABLE IF NOT EXISTS mapping_memory (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL,
  narration_fingerprint TEXT NOT NULL,
  suggested_ledger_name TEXT NOT NULL,
  suggested_voucher_type TEXT NOT NULL,
  success_count INTEGER NOT NULL DEFAULT 1,
  last_used_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS mapping_memory_company_narration_unique
ON mapping_memory (company_id, narration_fingerprint);
