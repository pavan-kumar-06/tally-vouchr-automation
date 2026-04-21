import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { organization, user } from "./auth";

export const company = sqliteTable(
  "companies",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull().references(() => user.id),
    name: text("name").notNull(),
    tallyCompanyName: text("tally_company_name"),
    tallyCompanyRemoteId: text("tally_company_remote_id"),
    defaultBankLedgerName: text("default_bank_ledger_name"),
    connectorLastSyncedAt: integer("connector_last_synced_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull()
  },
  (table) => ({
    organizationIdx: index("companies_org_idx").on(table.organizationId),
    uniqueOrgCompanyName: uniqueIndex("companies_org_name_unique").on(table.organizationId, table.name)
  })
);

export const tallyMaster = sqliteTable(
  "tally_masters",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull().references(() => company.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["LEDGER", "VOUCHER_TYPE"] }).notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    /** BANK vs OTHER — set by Tally connector for LEDGER rows so we can filter bank accounts at upload. */
    ledgerKind: text("ledger_kind", { enum: ["BANK", "OTHER"] }),
    /** Raw PARENT from Tally XML, normalized to printable ASCII where possible. */
    sourceParent: text("source_parent"),
    /** Raw ISDEEMEDPOSITIVE from Tally XML. */
    sourceIsDeemedPositive: integer("source_is_deemed_positive", { mode: "boolean" }),
    isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
    sourceUpdatedAt: integer("source_updated_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull()
  },
  (table) => ({
    companyIdx: index("tally_masters_company_idx").on(table.companyId),
    uniquePerType: uniqueIndex("tally_masters_company_type_name_unique").on(table.companyId, table.type, table.normalizedName)
  })
);

export const statement = sqliteTable(
  "statements",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull().references(() => company.id, { onDelete: "cascade" }),
    uploadedByUserId: text("uploaded_by_user_id").notNull().references(() => user.id),
    filename: text("filename").notNull(),
    sourceR2Key: text("source_r2_key").notNull(),
    resultR2Key: text("result_r2_key"),
    status: text("status", {
      enum: ["UPLOADED", "PROCESSING", "REVIEW", "SYNCED", "FAILED", "ARCHIVED", "DELETED"]
    })
      .notNull()
      .default("UPLOADED"),
    bankLedgerName: text("bank_ledger_name"),
    passwordProtected: integer("password_protected", { mode: "boolean" }).default(false).notNull(),
    extractionPeriodFrom: text("extraction_period_from"),
    extractionPeriodTo: text("extraction_period_to"),
    entryCount: integer("entry_count").default(0).notNull(),
    processingError: text("processing_error"),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull()
  },
  (table) => ({
    companyStatusIdx: index("statements_company_status_idx").on(table.companyId, table.status),
    createdAtIdx: index("statements_created_idx").on(table.createdAt)
  })
);

export const mappingMemory = sqliteTable(
  "mapping_memory",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull().references(() => company.id, { onDelete: "cascade" }),
    narrationFingerprint: text("narration_fingerprint").notNull(),
    suggestedLedgerName: text("suggested_ledger_name").notNull(),
    suggestedVoucherType: text("suggested_voucher_type", { enum: ["Payment", "Receipt", "Contra"] }).notNull(),
    successCount: integer("success_count").notNull().default(1),
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull()
  },
  (table) => ({
    companyNarrationUnique: uniqueIndex("mapping_memory_company_narration_unique").on(
      table.companyId,
      table.narrationFingerprint
    )
  })
);

export const tallyDiscovery = sqliteTable(
  "tally_discovery",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    tallyCompanyName: text("tally_company_name").notNull(),
    tallyCompanyRemoteId: text("tally_company_remote_id").notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull()
  },
  (table) => ({
    orgRemoteIdUnique: uniqueIndex("tally_discovery_org_remote_id_unique").on(table.organizationId, table.tallyCompanyRemoteId)
  })
);

export const pendingSync = sqliteTable(
  "pending_syncs",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull().references(() => company.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    connectorId: text("connector_id").notNull(),
    type: text("type", { enum: ["SYNC_MASTERS", "SEND_VOUCHERS"] }).notNull(),
    status: text("status", { enum: ["PENDING", "COMPLETED", "FAILED"] }).notNull().default("PENDING"),
    payload: text("payload"),  // JSON string with task details
    result: text("result"),     // JSON string with connector's response
    error: text("error"),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull()
  },
  (table) => ({
    companyIdx: index("pending_syncs_company_idx").on(table.companyId),
    connectorIdx: index("pending_syncs_connector_idx").on(table.connectorId),
    statusIdx: index("pending_syncs_status_idx").on(table.status)
  })
);


export const companyRelations = relations(company, ({ many, one }) => ({
  owner: one(user, {
    fields: [company.ownerId],
    references: [user.id]
  }),
  organization: one(organization, {
    fields: [company.organizationId],
    references: [organization.id]
  }),
  tallyMasters: many(tallyMaster),
  statements: many(statement)
}));

export const statementRelations = relations(statement, ({ one }) => ({
  company: one(company, {
    fields: [statement.companyId],
    references: [company.id]
  })
}));
