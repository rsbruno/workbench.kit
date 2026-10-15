import { type RepoInfo, detectRepo, readEmail } from "../../lib/timesheet/git";
import { type Option, askConfirm, selectOne, askText } from "../../ui/prompt";
import { summary, info, warn } from "../../ui/summary";
import * as store from "../../lib/timesheet/store";
import { defineCommand } from "../../lib/command";

type Ctx = { repo: RepoInfo | null; db: store.Db; email: string };

const BACK = "back";
const NEW = "new";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const required = (label: string) => (v: string) => (v ? undefined : `${label} é obrigatório`);

function emailError(v: string) {
  return EMAIL.test(v) ? undefined : "e-mail inválido";
}

async function newClient({ db }: Ctx): Promise<number> {
  const name = await askText("Nome do cliente", {
    validate: (v) => required("nome")(v) ?? (store.clientByName(db, v) ? "já existe um cliente com esse nome" : undefined)
  });
  return store.createClient(db, name);
}

async function pickClient(ctx: Ctx, message: string, except?: number): Promise<number | null> {
  const clients = store.listClients(ctx.db).filter((c) => c.id !== except);
  const options: Option<string>[] = [
    ...clients.map((c) => ({ detail: plural(c.projects, "projeto", "projetos"), value: String(c.id), name: c.name })),
    { name: "+ Novo cliente", value: NEW },
    { name: "← Cancelar", value: BACK }
  ];
  const picked = await selectOne(message, options);
  if (picked === BACK) return null;
  return picked === NEW ? newClient(ctx) : Number(picked);
}

async function newProject(ctx: Ctx) {
  const clientId = await pickClient(ctx, "Cliente do projeto");
  if (clientId === null) return;
  const name = await askText("Nome do projeto", {
    validate: (v) =>
      required("nome")(v) ??
      (store.projectNameTaken(ctx.db, clientId, v) ? "esse cliente já tem um projeto com esse nome" : undefined)
  });
  const email = await askText("E-mail do autor nos commits", {
    validate: (v) => required("e-mail")(v) ?? emailError(v),
    initial: ctx.email
  });
  const id = store.createProject(ctx.db, { clientId, email, name });
  info(`projeto "${name}" criado`);
  await offerLink(ctx, id);
}

async function offerLink(ctx: Ctx, projectId: number) {
  if (!ctx.repo) return;
  const taken = store.repoByRoot(ctx.db, ctx.repo.root);
  if (taken) return warn(`este repo já está em ${taken.client} / ${taken.project}`);
  if (await askConfirm(`Vincular o repo atual (${ctx.repo.path})?`, true)) {
    store.linkRepo(ctx.db, projectId, ctx.repo.root, ctx.repo.path);
    info("repo vinculado");
  }
}

async function clientMenu(ctx: Ctx, id: number) {
  for (;;) {
    const client = store.listClients(ctx.db).find((c) => c.id === id);
    if (!client) return;
    const action = await selectOne(client.name, [
      { detail: plural(client.projects, "projeto", "projetos"), name: "Ver projetos", value: "projects" },
      { name: "Editar nome", value: "rename" },
      { name: "Remover", value: "remove" },
      { name: "← Voltar", value: BACK }
    ]);
    if (action === BACK) return;
    if (action === "projects") {
      const rows = store.listProjects(ctx.db, id).map((p) => ({ detail: plural(p.repos, "repo", "repos"), name: p.name }));
      if (rows.length) summary(client.name, rows);
      else info("nenhum projeto");
    }
    if (action === "rename") {
      const name = await askText("Novo nome", {
        validate: (v) =>
          required("nome")(v) ??
          (v.toLowerCase() !== client.name.toLowerCase() && store.clientByName(ctx.db, v) ? "já existe" : undefined),
        initial: client.name
      });
      store.renameClient(ctx.db, id, name);
    }
    if (action === "remove") {
      const projects = store.listProjects(ctx.db, id);
      if (projects.length) {
        warn(
          `não dá para remover: ${client.name} tem ${plural(projects.length, "projeto", "projetos")} (${projects.map((p) => p.name).join(", ")}). Mova ou remova antes.`
        );
      } else if (await askConfirm(`Remover o cliente "${client.name}"?`)) {
        store.deleteClient(ctx.db, id);
        return info("cliente removido");
      }
    }
  }
}

async function clientsMenu(ctx: Ctx) {
  for (;;) {
    const clients = store.listClients(ctx.db);
    const picked = await selectOne("Clientes", [
      ...clients.map((c) => ({ detail: plural(c.projects, "projeto", "projetos"), value: String(c.id), name: c.name })),
      { name: "+ Novo cliente", value: NEW },
      { name: "← Voltar", value: BACK }
    ]);
    if (picked === BACK) return;
    if (picked === NEW) await newClient(ctx);
    else await clientMenu(ctx, Number(picked));
  }
}

async function changeClient(ctx: Ctx, project: store.Project) {
  const clientId = await pickClient(ctx, "Novo cliente", project.clientId);
  if (clientId === null) return;
  if (store.projectNameTaken(ctx.db, clientId, project.name, project.id))
    return warn("esse cliente já tem um projeto com o mesmo nome");
  store.updateProject(ctx.db, project.id, { clientId });
}

async function unlink(ctx: Ctx, projectId: number) {
  const repos = store.reposOf(ctx.db, projectId);
  if (!repos.length) return info("nenhum repo vinculado");
  const picked = await selectOne("Desvincular qual repo?", [
    ...repos.map((r) => ({ value: String(r.id), name: r.path })),
    { name: "← Cancelar", value: BACK }
  ]);
  if (picked !== BACK) store.unlinkRepo(ctx.db, Number(picked));
}

async function projectMenu(ctx: Ctx, id: number) {
  for (;;) {
    const project = store.getProject(ctx.db, id);
    if (!project) return;
    const canLink = ctx.repo && !store.repoByRoot(ctx.db, ctx.repo.root);
    const options: Option<string>[] = [
      { detail: project.name, name: "Editar nome", value: "rename" },
      { name: "Editar e-mail do autor", detail: project.email, value: "email" },
      { name: "Trocar de cliente", detail: project.client, value: "client" },
      ...(canLink ? [{ name: "Vincular este repo", value: "link" }] : []),
      { detail: plural(project.repos, "repo", "repos"), name: "Desvincular repo", value: "unlink" },
      { name: "Remover", value: "remove" },
      { name: "← Voltar", value: BACK }
    ];
    const action = await selectOne(`${project.client} / ${project.name}`, options);
    if (action === BACK) return;
    if (action === "rename") {
      const name = await askText("Novo nome", {
        validate: (v) =>
          required("nome")(v) ??
          (store.projectNameTaken(ctx.db, project.clientId, v, id) ? "já existe nesse cliente" : undefined),
        initial: project.name
      });
      store.updateProject(ctx.db, id, { name });
    }
    if (action === "email") {
      const email = await askText("E-mail do autor", {
        validate: (v) => required("e-mail")(v) ?? emailError(v),
        initial: project.email
      });
      store.updateProject(ctx.db, id, { email });
    }
    if (action === "client") await changeClient(ctx, project);
    if (action === "link") await offerLink(ctx, id);
    if (action === "unlink") await unlink(ctx, id);
    if (
      action === "remove" &&
      (await askConfirm(`Remover "${project.name}" e desvincular ${plural(project.repos, "repo", "repos")}?`))
    ) {
      store.deleteProject(ctx.db, id);
      return info("projeto removido");
    }
  }
}

async function projectsMenu(ctx: Ctx) {
  for (;;) {
    const projects = store.listProjects(ctx.db);
    const picked = await selectOne("Projetos", [
      ...projects.map((p) => ({
        detail: plural(p.repos, "repo", "repos"),
        name: `${p.client} / ${p.name}`,
        value: String(p.id)
      })),
      { name: "+ Novo projeto", value: NEW },
      { name: "← Voltar", value: BACK }
    ]);
    if (picked === BACK) return;
    if (picked === NEW) await newProject(ctx);
    else await projectMenu(ctx, Number(picked));
  }
}

function printAll(db: store.Db) {
  const projects = store.listProjects(db);
  const empty = store.listClients(db).filter((c) => !c.projects);
  const rows = [
    ...projects.map((p) => {
      const repos = store.reposOf(db, p.id).map((r) => r.path);
      return { detail: [p.email, ...repos].join(" · "), name: `${p.client} / ${p.name}` };
    }),
    ...empty.map((c) => ({ detail: "sem projetos", name: c.name }))
  ];
  if (rows.length) summary("configuração desta sessão", rows);
  else info("nada configurado");
  warn("nada foi salvo: a configuração existe só nesta execução");
}

export const config = defineCommand({
  run: async () => {
    const cwd = process.cwd();
    const ctx: Ctx = { email: await readEmail(cwd).catch(() => ""), repo: await detectRepo(cwd), db: store.createDb() };
    for (;;) {
      const area = await selectOne("O que configurar?", [
        { name: "Clientes", value: "clients" },
        { value: "projects", name: "Projetos" },
        { name: "Sair", value: BACK }
      ]);
      if (area === BACK) break;
      await (area === "clients" ? clientsMenu(ctx) : projectsMenu(ctx));
    }
    printAll(ctx.db);
  },
  description: "manage clients and projects (interactive menu)",
  aliases: ["cfg"],
  name: "config"
});
