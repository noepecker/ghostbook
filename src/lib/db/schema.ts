import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ModeTemplate, Values } from "../template";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    code: text("code").notNull(),
    passwordHash: text("password_hash").notNull(),
    isAdmin: boolean("is_admin").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_username_uq").on(t.username), uniqueIndex("users_code_uq").on(t.code)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const invites = pgTable(
  "invites",
  {
    id: serial("id").primaryKey(),
    token: text("token").notNull(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedBy: integer("used_by").references(() => users.id, { onDelete: "set null" }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("invites_token_uq").on(t.token)],
);

export const games = pgTable(
  "games",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    shortCode: text("short_code").notNull(),
    /** where world records come from, e.g. "mkwrs-mkworld"; null = none */
    wrSource: text("wr_source"),
    sort: integer("sort").notNull().default(100),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("games_slug_uq").on(t.slug)],
);

export const catalogs = pgTable(
  "catalogs",
  {
    id: serial("id").primaryKey(),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    nameEs: text("name_es"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("catalogs_game_key_uq").on(t.gameId, t.key)],
);

export const catalogItems = pgTable(
  "catalog_items",
  {
    id: serial("id").primaryKey(),
    catalogId: integer("catalog_id")
      .notNull()
      .references(() => catalogs.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    nameEs: text("name_es"),
    /** free-form: cup, split count, short label, quiet (hidden in compact labels) */
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    sort: integer("sort").notNull().default(1000),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("catalog_items_catalog_slug_uq").on(t.catalogId, t.slug)],
);

export const modes = pgTable(
  "modes",
  {
    id: serial("id").primaryKey(),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameEs: text("name_es"),
    slug: text("slug").notNull(),
    template: jsonb("template").$type<ModeTemplate>().notNull(),
    sort: integer("sort").notNull().default(100),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("modes_game_slug_uq").on(t.gameId, t.slug)],
);

export const records = pgTable(
  "records",
  {
    id: serial("id").primaryKey(),
    modeId: integer("mode_id")
      .notNull()
      .references(() => modes.id, { onDelete: "cascade" }),
    values: jsonb("values").$type<Values>().notNull(),
    /** derived from the template's board key fields, recomputed when the template changes */
    boardKey: text("board_key").notNull(),
    /** the template's score field, copied out for sorting */
    score: doublePrecision("score"),
    playedAt: timestamp("played_at", { withTimezone: true }).notNull(),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** last edit; null while the record is as it was logged */
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("records_mode_board_idx").on(t.modeId, t.boardKey), index("records_played_idx").on(t.playedAt)],
);

export const recordParticipants = pgTable(
  "record_participants",
  {
    id: serial("id").primaryKey(),
    recordId: integer("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    guestName: text("guest_name"),
    position: integer("position").notNull().default(0),
    stats: jsonb("stats").$type<Record<string, number>>(),
  },
  (t) => [index("participants_record_idx").on(t.recordId), index("participants_user_idx").on(t.userId)],
);

export const proofs = pgTable(
  "proofs",
  {
    id: serial("id").primaryKey(),
    recordId: integer("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    pathname: text("pathname").notNull(),
    url: text("url").notNull(),
    kind: text("kind").$type<"image" | "video">().notNull(),
    contentType: text("content_type"),
    size: bigint("size", { mode: "number" }).notNull().default(0),
    durationMs: integer("duration_ms"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("proofs_record_idx").on(t.recordId)],
);

export const worldRecords = pgTable(
  "world_records",
  {
    id: serial("id").primaryKey(),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    modeId: integer("mode_id")
      .notNull()
      .references(() => modes.id, { onDelete: "cascade" }),
    boardKey: text("board_key").notNull(),
    score: doublePrecision("score").notNull(),
    holder: text("holder").notNull(),
    holderCountry: text("holder_country"),
    playedOn: text("played_on"),
    character: text("character"),
    kart: text("kart"),
    splits: jsonb("splits").$type<number[]>(),
    sourceUrl: text("source_url"),
    videoUrl: text("video_url"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("world_records_mode_board_uq").on(t.modeId, t.boardKey)],
);

/** Small key/value store: WR refresh timestamps (rate limit). */
export const appState = pgTable("app_state", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});
