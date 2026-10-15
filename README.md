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

CLI interativa que lê os **commits do repositório** em que você está e os organiza por dia, como base de um timesheet. Também reúne a configuração de **clientes e projetos** do seu fluxo de trabalho.

## Como funciona

1. Roda um único `git log` no diretório atual, sobre `--branches --remotes --no-merges`, filtrado pelo seu `git config user.email`.
2. Agrupa os commits pela data local do autor e mostra hora, hash curto e assunto.
3. Se você não passar `--since`, pergunta uma data opcional (`DD/MM/AAAA`); em branco busca todo o histórico.

## Instalação

Precisa de Node.js. Cada release do GitHub traz o `workbench.tgz` pronto.

**Rodar sem instalar:**

```bash
npx https://github.com/rsbruno/workbench.kit/releases/latest/download/workbench.tgz timesheet explore
```

```bash
pnpm dlx https://github.com/rsbruno/workbench.kit/releases/latest/download/workbench.tgz timesheet explore
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
| `workbench timesheet explore` | Lista seus commits do repo atual, agrupados por dia (`--json` imprime a lista crua) |
| `workbench timesheet config` | Menu interativo de clientes e projetos. Por enquanto só imprime na tela: nada é salvo |

Flags úteis: `--since <DD/MM/AAAA>`, `--until <DD/MM/AAAA>`, `--json`, `-v, --version`.

## Desenvolvimento

```bash
bun install
bun run dev timesheet explore
bun run build
```

Estado local (quando existir) fica em `~/.local/state/workbench`, ou em `WORKBENCH_HOME`.

Contribuições entram por PR. O título segue o formato:

```
[TIPO][ESCOPO][branch][CARD]: descrição curta
```

Exemplo: `[FEAT][TIMESHEET][feat/explore][LP-42]: add explore command`. O `[CARD]` é opcional, e o `TIPO` define a versão (`FEAT` minor, `FIX` e `PERF` patch, `FEAT!` major). O check **PR Title** valida o formato.

Vulnerabilidades: veja [SECURITY.md](SECURITY.md).
