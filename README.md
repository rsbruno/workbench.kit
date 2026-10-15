<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark-mode.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/logo-light-mode.svg">
  <img alt="Workbench Kit" src="assets/logo-light-mode.svg" height="92">
</picture>

# Workbench Kit

**Seu fluxo de trabalho em um comando.**

</div>

---

## O que é

CLI interativa que lê os **commits do repositório** em que você está e os organiza por dia, como base de um timesheet, e começa a reunir os **projetos** do seu fluxo de trabalho.

## Como funciona

1. Acha o projeto da pasta atual: compara a raiz do repositório com o `path` dos projetos e, se não achar, o nome da pasta com o `folderName`.
2. Mostra o nome do projeto e pede confirmação. Se você disser não (ou nenhum projeto casar), lista os projetos para você escolher, e o `explore` passa a usar o `path` do projeto escolhido.
3. Roda um único `git log` nesse repositório, sobre `--branches --remotes --no-merges`, filtrado pelo `git config user.email` dele, e agrupa os commits pela data local do autor.
   Cada commit é gravado na tabela `commits` do projeto (sem duplicar: o hash é único por projeto), com autor, committer, datas, mensagem completa, estatísticas (arquivos e linhas), tipo extraído da mensagem e a branch de origem.
   A branch é descoberta só com o git, lendo o grafo de commits (uma chamada extra e barata), pela melhor pista disponível: o título do squash (`[TIPO][ESCOPO][branch][CARD]`), a mensagem do merge (`Merge pull request #N from dono/branch`, `Merge branch 'x'`) ou a branch que ainda existe. A coluna `branch_source` diz de onde veio (`title`, `merge`, `ref` ou `mainline`). Commits direto na `main` ficam sem branch.
4. A busca é incremental: o `--since` do git é o último dia sincronizado do projeto no banco, então só os commits desde então são lidos. Na primeira sincronização (nada no banco) busca o repositório inteiro, com uma data opcional (`DD/MM/AAAA`; em branco = tudo). `--since DD/MM/AAAA` força reprocessar desde uma data. A busca usa `--since-as-filter` (git 2.36+), que não para em commits com data fora de ordem.

## Instalação

Precisa de Node.js 22.16 ou mais novo. Cada release do GitHub traz o `workbench.tgz` pronto.

**Rodar sem instalar:**

```bash
npx https://github.com/rsbruno/workbench.kit/releases/latest/download/workbench.tgz commits explore
```

```bash
pnpm dlx https://github.com/rsbruno/workbench.kit/releases/latest/download/workbench.tgz commits explore
```

**Instalar globalmente:**

```bash
npm install -g https://github.com/rsbruno/workbench.kit/releases/latest/download/workbench.tgz
workbench --help
```

## Comandos

Formato: `workbench <grupo> <comando>`. Sem argumentos, a CLI pergunta o que falta.

| Comando | O que faz |
| --- | --- |
| `workbench commits explore` | Lista seus commits do projeto da pasta atual (ou do escolhido), agrupados por dia. Grava os commits no banco. Com `--json` ou sem terminal não pergunta nada: usa o projeto que casa com a pasta ou o de `--project` |
| `workbench projects add [nome]` | Cria um projeto (o id é um UUIDv6). Sem o nome, pergunta |
| `workbench projects list` | Lista os projetos do mais antigo ao mais novo (`--json` imprime a lista crua) |
| `workbench projects update [nome\|id] [novo nome]` | Renomeia um projeto. Sem argumentos, escolhe numa lista |
| `workbench projects remove [nome\|id]` | Remove um projeto, pedindo confirmação (`--force` dispensa) |

Flags úteis: `--since <DD/MM/AAAA>`, `--until <DD/MM/AAAA>`, `--project <nome|id>` (commits explore), `--json`, `--force`, `-v, --version`. Um projeto pode ser indicado pelo nome, pelo id completo ou por um prefixo único do id.

## Desenvolvimento

```bash
bun install
bun run dev commits explore
bun run build
```

O banco é SQLite com Drizzle e fica em `~/.local/state/workbench/` (ou em `WORKBENCH_HOME`). Há dois arquivos: `workbench.db` (produção, usado pelo pacote instalado) e `workbench.dev.db` (desenvolvimento, usado ao rodar pelo código-fonte com `bun run dev`, e criado na **raiz do projeto**, ignorado pelo git), então testar não suja os seus dados reais. `WORKBENCH_ENV=dev|prod` força um dos dois, e `bun run db:reset` apaga só o de desenvolvimento. As migrações rodam sozinhas na primeira vez que um comando abre o banco depois de instalar ou atualizar o CLI (com bloqueio, então vários comandos ao mesmo tempo são seguros), e um banco mais novo que o CLI é recusado com um aviso para atualizar. Depois de mudar `src/db/schema.ts`, rode `bun run db:generate` para gerar a migração em `drizzle/`.

Contribuições entram por PR. O título segue o formato:

```
[TIPO][ESCOPO][branch][CARD]: descrição curta
```

Exemplo: `[FEAT][REPO][feat/explore][LP-42]: add explore command`. O `[CARD]` é opcional, e o `TIPO` define a versão (`FEAT` minor, `FIX` e `PERF` patch, `FEAT!` major). O check **PR Title** valida o formato.

Vulnerabilidades: veja [SECURITY.md](SECURITY.md).
