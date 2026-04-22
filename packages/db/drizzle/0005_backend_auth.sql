CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_unique ON organizations (slug);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS memberships_user_org_unique ON memberships (user_id, organization_id);
CREATE INDEX IF NOT EXISTS memberships_org_idx ON memberships (organization_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  replaced_by_token_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (replaced_by_token_id) REFERENCES refresh_tokens(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_hash_unique ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_idx ON refresh_tokens (expires_at);

-- Backfill from legacy Better Auth tables to keep ownership/company mapping intact.
INSERT INTO users (id, email, name, password_hash, email_verified, created_at, updated_at)
SELECT
  u.id,
  u.name,
  COALESCE(u.name, split_part(u.id, '_', 1)),
  CASE
    WHEN a.password IS NOT NULL AND a.password LIKE '$argon2%' THEN a.password
    ELSE NULL
  END,
  u.email_verified,
  u.created_at,
  COALESCE(u.updated_at, u.created_at)
FROM user u
LEFT JOIN account a ON a.user_id = u.id
WHERE NOT EXISTS (SELECT 1 FROM users nu WHERE nu.id = u.id);

INSERT INTO organizations (id, name, slug, created_at, updated_at)
SELECT
  o.id,
  o.name,
  o.slug,
  o.created_at,
  COALESCE(o.updated_at, o.created_at)
FROM organization o
WHERE NOT EXISTS (SELECT 1 FROM organizations no2 WHERE no2.id = o.id);

INSERT INTO memberships (id, user_id, organization_id, role, created_at, updated_at)
SELECT
  m.id,
  m.user_id,
  m.organization_id,
  m.role,
  m.created_at,
  COALESCE(m.updated_at, m.created_at)
FROM member m
WHERE NOT EXISTS (SELECT 1 FROM memberships nm WHERE nm.id = m.id);

-- Sync legacy tables (user, organization, member) so FK references from
-- companies/statements/etc. continue to work after the auth schema split.
INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
SELECT id, name, email, email_verified, created_at, updated_at
FROM users
WHERE NOT EXISTS (SELECT 1 FROM user u2 WHERE u2.id = users.id);

INSERT INTO organization (id, name, slug, created_at)
SELECT id, name, slug, created_at
FROM organizations
WHERE NOT EXISTS (SELECT 1 FROM organization o2 WHERE o2.id = organizations.id);

INSERT INTO member (id, user_id, organization_id, role, created_at)
SELECT id, user_id, organization_id, role, created_at
FROM memberships
WHERE NOT EXISTS (SELECT 1 FROM member m2 WHERE m2.id = memberships.id);
