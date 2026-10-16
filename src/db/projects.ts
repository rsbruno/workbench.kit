import { like, and, asc, sql, eq, ne } from "drizzle-orm";

import type { Db } from "./index";

import { type RepoFields, assertFields, expandPath } from "../lib/repo/fields";
import { type Project, projects } from "./schema";

const MAX_NAME = 100;

export type ProjectInput = RepoFields & { name: string };

export type ProjectPatch = Partial<ProjectInput>;

export function cleanName(input: string): string {
  const name = input.trim();
  if (!name) throw new Error("the project name is required");
  if (name.length > MAX_NAME) throw new Error(`the project name is longer than ${MAX_NAME} characters`);
  return name;
}

async function unique<T>(name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    const error = e as Error & { cause?: Error };
    if (/UNIQUE constraint failed/i.test(`${error.message} ${error.cause?.message ?? ""}`)) {
      throw new Error(`a project named "${name}" already exists`);
    }
    throw e;
  }
}

function normalize(input: ProjectInput): ProjectInput {
  const next = {
    path: input.path.trim() ? expandPath(input.path) : "",
    folderName: input.folderName.trim(),
    remote: input.remote.trim(),
    name: cleanName(input.name)
  };
  assertFields(next);
  return next;
}

export const listProjects = (db: Db) => db.select().from(projects).orderBy(asc(projects.id));

export async function assertNameFree(db: Db, input: string, exceptId?: string) {
  const name = cleanName(input);
  const taken = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(sql`lower(${projects.name}) = ${name.toLowerCase()}`, exceptId ? ne(projects.id, exceptId) : undefined))
    .get();
  if (taken) throw new Error(`a project named "${name}" already exists`);
}

export async function createProject(db: Db, input: ProjectInput): Promise<Project> {
  const values = normalize(input);
  const [row] = await unique(values.name, () => db.insert(projects).values(values).returning());
  return row!;
}

export async function updateProject(
  db: Db,
  current: Project,
  patch: ProjectPatch
): Promise<{ changed: boolean; project: Project }> {
  const incomplete = !current.path || !current.folderName || !current.remote;
  let next: ProjectInput;
  try {
    next = normalize({
      folderName: patch.folderName ?? current.folderName,
      remote: patch.remote ?? current.remote,
      path: patch.path ?? current.path,
      name: patch.name ?? current.name
    });
  } catch (e) {
    if (!incomplete) throw e;
    throw new Error(
      `${(e as Error).message}. The project "${current.name}" is incomplete: pass --path, --folder and --remote, or run update with no arguments`
    );
  }
  const changed = (["name", "path", "folderName", "remote"] as const).some((key) => next[key] !== current[key]);
  if (!changed) return { project: current, changed };

  const [row] = await unique(next.name, () =>
    db
      .update(projects)
      .set({ ...next, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(projects.id, current.id))
      .returning()
  );
  return { project: row!, changed };
}

export async function deleteProject(db: Db, id: string) {
  await db.delete(projects).where(eq(projects.id, id));
}

export async function findProject(db: Db, ref: string): Promise<Project> {
  const value = ref.trim().toLowerCase();

  const byId = await db.select().from(projects).where(eq(projects.id, value)).get();
  if (byId) return byId;

  const byName = await db
    .select()
    .from(projects)
    .where(sql`lower(${projects.name}) = ${value}`)
    .get();
  if (byName) return byName;

  if (/^[0-9a-f-]{4,}$/.test(value)) {
    const matches = await db
      .select()
      .from(projects)
      .where(like(projects.id, `${value}%`))
      .limit(2);
    if (matches.length === 1) return matches[0]!;
    if (matches.length > 1) throw new Error(`"${ref}" matches more than one project; use the full id or the name`);
  }
  throw new Error(`project not found: ${ref}`);
}
