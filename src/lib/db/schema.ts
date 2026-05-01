import {
  pgSchema,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const dataDimensions = pgSchema("data_dimensions");

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// services (通常 master、soft delete)
// =============================================================================

export const services = dataDimensions.table("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  sourceKind: text("source_kind").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  deleted: boolean("deleted").notNull().default(false),
  ...timestamps(),
}, (t) => [
  uniqueIndex("services_code_key").on(t.code),
]);

// =============================================================================
// target_masters (bitemporal append-only)
// =============================================================================

export const targetMasters = dataDimensions.table("target_masters", {
  id: uuid("id").notNull(),
  revision: integer("revision").notNull(),
  serviceId: uuid("service_id").notNull().references(() => services.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),
  deleted: boolean("deleted").notNull().default(false),
  purged: boolean("purged").notNull().default(false),
}, (t) => [
  primaryKey({ columns: [t.id, t.revision] }),
  index("target_masters_service_id_idx").on(t.serviceId, t.id, t.revision),
]);

// =============================================================================
// mappings (bitemporal append-only)
// =============================================================================

export const mappings = dataDimensions.table("mappings", {
  id: uuid("id").notNull(),
  revision: integer("revision").notNull(),
  serviceId: uuid("service_id").notNull().references(() => services.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  sourceType: text("source_type").notNull(),
  sourceValue: text("source_value").notNull(),
  targetId: uuid("target_id").notNull(),
  deleted: boolean("deleted").notNull().default(false),
  purged: boolean("purged").notNull().default(false),
}, (t) => [
  primaryKey({ columns: [t.id, t.revision] }),
  index("mappings_service_source_idx").on(t.serviceId, t.sourceType, t.sourceValue, t.revision),
  index("mappings_service_target_idx").on(t.serviceId, t.targetId, t.revision),
]);

// =============================================================================
// _current views (drizzle 管理外、CREATE VIEW は drizzle/0001_views.sql 参照)
// =============================================================================

export const targetMastersCurrent = dataDimensions
  .view("target_masters_current", {
    id: uuid("id").notNull(),
    revision: integer("revision").notNull(),
    serviceId: uuid("service_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    name: text("name").notNull(),
    parentId: uuid("parent_id"),
    deleted: boolean("deleted").notNull(),
    purged: boolean("purged").notNull(),
  })
  .existing();

export const mappingsCurrent = dataDimensions
  .view("mappings_current", {
    id: uuid("id").notNull(),
    revision: integer("revision").notNull(),
    serviceId: uuid("service_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    sourceType: text("source_type").notNull(),
    sourceValue: text("source_value").notNull(),
    targetId: uuid("target_id").notNull(),
    deleted: boolean("deleted").notNull(),
    purged: boolean("purged").notNull(),
  })
  .existing();

// =============================================================================
// user (Clerk と紐付け、emailで lookup)
// =============================================================================

export const user = dataDimensions.table("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  externalId: text("external_id"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
}, (t) => [
  uniqueIndex("user_email_key").on(t.email),
]);

// =============================================================================
// api_key (Phase 3 で使う、外部公開 API 用)
// =============================================================================

export const apiKey = dataDimensions.table("api_key", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
