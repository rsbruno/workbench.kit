type ClientRow = { name: string; id: number };
type ProjectRow = { clientId: number; email: string; name: string; id: number };

export type Client = { projects: number; name: string; id: number };

export type Project = {
  clientId: number;
  client: string;
  email: string;
  repos: number;
  name: string;
  id: number;
};

export type Repo = { projectId: number; rootHash: string; path: string; id: number };

export type Db = { projects: ProjectRow[]; clients: ClientRow[]; repos: Repo[]; seq: number };

export const createDb = (): Db => ({ projects: [], clients: [], repos: [], seq: 0 });

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
const nextId = (db: Db) => ++db.seq;

export const listClients = (db: Db): Client[] =>
  db.clients
    .map((c) => ({ projects: db.projects.filter((p) => p.clientId === c.id).length, name: c.name, id: c.id }))
    .sort(byName);

export const clientByName = (db: Db, name: string) => db.clients.find((c) => same(c.name, name));

export function createClient(db: Db, name: string) {
  const id = nextId(db);
  db.clients.push({ name: name.trim(), id });
  return id;
}

export function renameClient(db: Db, id: number, name: string) {
  const client = db.clients.find((c) => c.id === id);
  if (client) client.name = name.trim();
}

export function deleteClient(db: Db, id: number) {
  if (db.projects.some((p) => p.clientId === id)) throw new Error("client still has projects");
  db.clients = db.clients.filter((c) => c.id !== id);
}

function toProject(db: Db, p: ProjectRow): Project {
  return {
    client: db.clients.find((c) => c.id === p.clientId)?.name ?? "",
    repos: db.repos.filter((r) => r.projectId === p.id).length,
    clientId: p.clientId,
    email: p.email,
    name: p.name,
    id: p.id
  };
}

export const listProjects = (db: Db, clientId?: number) =>
  db.projects
    .filter((p) => clientId === undefined || p.clientId === clientId)
    .map((p) => toProject(db, p))
    .sort((a, b) => a.client.localeCompare(b.client) || a.name.localeCompare(b.name));

export function getProject(db: Db, id: number) {
  const project = db.projects.find((p) => p.id === id);
  return project ? toProject(db, project) : undefined;
}

export const projectNameTaken = (db: Db, clientId: number, name: string, exceptId = 0) =>
  db.projects.some((p) => p.clientId === clientId && p.id !== exceptId && same(p.name, name));

export function createProject(db: Db, input: { clientId: number; email: string; name: string }) {
  const id = nextId(db);
  db.projects.push({ email: input.email.trim(), clientId: input.clientId, name: input.name.trim(), id });
  return id;
}

export function updateProject(db: Db, id: number, patch: { clientId?: number; email?: string; name?: string }) {
  const project = db.projects.find((p) => p.id === id);
  if (!project) return;
  if (patch.name !== undefined) project.name = patch.name.trim();
  if (patch.email !== undefined) project.email = patch.email.trim();
  if (patch.clientId !== undefined) project.clientId = patch.clientId;
}

export function deleteProject(db: Db, id: number) {
  db.projects = db.projects.filter((p) => p.id !== id);
  db.repos = db.repos.filter((r) => r.projectId !== id);
}

export const reposOf = (db: Db, projectId: number) => db.repos.filter((r) => r.projectId === projectId);

export function repoByRoot(db: Db, rootHash: string) {
  const repo = db.repos.find((r) => r.rootHash === rootHash);
  const project = repo && db.projects.find((p) => p.id === repo.projectId);
  if (!repo || !project) return undefined;
  return { ...repo, client: db.clients.find((c) => c.id === project.clientId)?.name ?? "", project: project.name };
}

export function linkRepo(db: Db, projectId: number, rootHash: string, path: string) {
  db.repos.push({ id: nextId(db), projectId, rootHash, path });
}

export function unlinkRepo(db: Db, id: number) {
  db.repos = db.repos.filter((r) => r.id !== id);
}
