const fs = require('fs');

async function run() {
  const accountId = "627f168e835fb675f1c5be47f5763ffd";
  const databaseId = "94af87cf-fa2d-4e65-b18b-e35442d1ac71";
  const apiToken = "cfat_BKZ4RtiiAPCkPxMVtsJqnOfsWp34143yOvFuGIFS978e0f6f";
  
  const sql = `
  CREATE TABLE IF NOT EXISTS \`tally_discovery\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`organization_id\` text NOT NULL,
    \`tally_company_name\` text NOT NULL,
    \`tally_company_remote_id\` text NOT NULL,
    \`last_seen_at\` integer NOT NULL
  );
  `;

  const sql2 = `
  CREATE UNIQUE INDEX IF NOT EXISTS \`tally_discovery_org_remote_id_unique\` ON \`tally_discovery\` (\`organization_id\`,\`tally_company_remote_id\`);
  `;

  for (const q of [sql, sql2]) {
    const res = await fetch(\`https://api.cloudflare.com/client/v4/accounts/\${accountId}/d1/database/\${databaseId}/query\`, {
      method: "POST",
      headers: {
        Authorization: \`Bearer \${apiToken}\`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql: q, params: [] }),
    });
    const d = await res.json();
    console.log(JSON.stringify(d, null, 2));
  }
}

run();
