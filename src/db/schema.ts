import { uniqueIndex, sqliteTable, integer, index, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { v6 } from "uuid";

import { TimeKind } from "../lib/repo/clock";

export const projects = sqliteTable(
  "projects",
  {
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => v6()),
    folderName: text("folder_name").notNull(),
    remote: text("remote").notNull(),
    path: text("path").notNull(),
    name: text("name").notNull()
  },
  (t) => [uniqueIndex("projects_name_nocase").on(sql`lower(${t.name})`)]
);

export type Project = typeof projects.$inferSelect;

export const commits = sqliteTable(
  "commits",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    isBreaking: integer("is_breaking", { mode: "boolean" }).notNull().default(false),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => v6()),
    filesChanged: integer("files_changed").notNull().default(0),
    insertions: integer("insertions").notNull().default(0),
    deletions: integer("deletions").notNull().default(0),
    committerEmail: text("committer_email").notNull(),
    committerName: text("committer_name").notNull(),
    committedAt: text("committed_at").notNull(),
    authorEmail: text("author_email").notNull(),
    authorName: text("author_name").notNull(),
    authoredAt: text("authored_at").notNull(),
    body: text("body").notNull().default(""),
    treeHash: text("tree_hash").notNull(),
    branchSource: text("branch_source"),
    subject: text("subject").notNull(),
    hash: text("hash").notNull(),
    day: text("day").notNull(),
    branch: text("branch"),
    type: text("type")
  },
  (t) => [uniqueIndex("commits_project_hash").on(t.projectId, t.hash), index("commits_project_day").on(t.projectId, t.day)]
);

export type CommitRow = typeof commits.$inferSelect;

export const dailies = sqliteTable(
  "dailies",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => v6()),
    day: integer("day", { mode: "timestamp" }).notNull(),
    content: text("content").notNull()
  },
  (t) => [uniqueIndex("dailies_project_day").on(t.projectId, t.day)]
);

export type Daily = typeof dailies.$inferSelect;

export const timeEntries = sqliteTable(
  "time_entries",
  {
    dailyId: text("daily_id")
      .notNull()
      .references(() => dailies.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    kind: integer("kind").$type<TimeKind>().notNull().default(TimeKind.REGULAR),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => v6()),
    description: text("description").notNull().default(""),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull()
  },
  (t) => [index("time_entries_daily").on(t.dailyId)]
);

export type TimeEntry = typeof timeEntries.$inferSelect;
