# 08 · Qualidade, ambientes, segredos e entrega

## Ambientes

| Ambiente | Banco | Telas | Agente | Para quê |
|---|---|---|---|---|
| **Local** | Supabase local (`supabase start`, exige Docker), **ou** o projeto de dev na nuvem (pergunta Q3) | `npm run dev` | `npm run agente:simulador` | desenvolver e testar |
| **Demo** | projeto Supabase na nuvem (Free) | GitHub Pages (`/gs_goodwe/`) | notebook ou Railway (Q7) | pitch e banca |

O plano Free permite 2 projetos gratuitos no total. Com Docker, basta um projeto na nuvem (demo). Sem Docker, um para dev e um para demo.

## Variáveis e segredos

| Variável | Onde | Pública? | Observação |
|---|---|---|---|
| `VITE_SUPABASE_URL` | app (build) | sim | variável do repositório no GitHub Actions |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | app (build) | sim | chave publicável (`sb_publishable_...`); a RLS protege |
| `VITE_MODO_DEMO` | app (build) | sim | liga os botões "entrar como" (Q13) |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | agente | sim | — |
| `AGENTE_CREDENCIAIS` | agente (Railway) | **não** | identidade do aparelho; alternativa: `~/.pontow-agente/credenciais.json` |
| `SUPABASE_SECRET_KEY` | scripts de seed, local | **não** | só em `.env.local` (no `.gitignore`), digitada no terminal, nunca no chat |
| `PAGAMENTO_PROVEDOR` | Edge Functions | — | `simulado` no MVP |
| `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` | Edge Functions (F5) | **não** | segredos do Supabase |

A chave secreta do Supabase nunca vai para o app, para o agente nem para o repositório. Dentro das Edge Functions ela já vem do ambiente da plataforma.

## Seed

```
scripts/seed/
  gerar.ts      seed.ts corrigido: sorteia tudo antes de descartar o que é futuro, e o
                resultado não depende mais da hora em que roda (bug de 15/10); data âncora fixa
  carregar.ts   grava no banco com a chave secreta:
                  catálogos, parametros_rede v1, contas globais;
                  organização GoodWe + usuário admin de demonstração;
                  16 franqueados de demonstração (organização + usuário), pontos ATIVO, vagas,
                  regras de tarifa v1;
                  motoristas de demonstração com crédito inicial na carteira;
                  histórico de 90 dias: sessões PAGA + cobranças + transações (marcadas demo);
                  solicitações de exemplo (score recalculado);
                  usuário técnico "agente simulador" pareado com todos os pontos simulados
```

Para apagar a demonstração, use `supabase db reset` (local) ou um script privilegiado que desliga os gatilhos de imutabilidade. Lançamentos e eventos não podem ser apagados por um usuário comum, e é isso que garante o rastro. O seed cria a conta de recebível de **cada** ponto.

**Projeto de demo:** desligar "Confirm email" em Auth. O servidor de e-mail padrão manda só 2 e-mails por hora, e com a confirmação ligada os cadastros travam.

As senhas das contas de demonstração ficam em `.env.local` e no gerenciador de senhas do João.

## Testes

| Camada | Ferramenta | O que cobre | Fase |
|---|---|---|---|
| Motores | Vitest | demanda em ampères (casos de [04-agente.md](04-agente.md)), tarifa, viabilidade (Hub com 4 × 11 kW), Volt por palavra inteira, solar, estimativa de bateria, física do simulador | F0–F2 |
| Contrato TS × SQL | Vitest + banco | `fixtures/tarifa.json` e `fixtures/reparticao.json` dão o mesmo resultado nas duas versões | F0–F1 |
| Banco sem Docker | Vitest + PGlite (Postgres em WebAssembly) com stubs de `auth.users`, `auth.uid()` e dos papéis do Supabase | o mesmo roteiro abaixo; validado em 19/10/2026 contra este rascunho (45 verificações, ver nota) | F0 |
| Banco | pgTAP (`supabase test db`) | RLS por papel (franqueado A não vê B; operador não vê financeiro; motorista só o seu; aparelho só o seu ponto); invariantes (uma sessão aberta por vaga, soma zero, imutáveis); `vincular_sessao` concorrente; `registrar_fim_carga` idempotente; arredondamento da repartição | F0–F3 |
| Agente × banco | Vitest | roteiro: conectar → abrir → vincular → carregar → limite → encerrar → cobrança → lançamentos | F2–F3 |
| Ponta a ponta | roteiro manual com navegador e celular real | o roteiro da demo de cada fase ([plano](../plano/plano-de-execucao.md)) | toda fase |

**Nota (19/10/2026):** os três arquivos `sql/` foram aplicados num PGlite em memória, com stubs do Supabase. Nada foi criado em banco real. Passaram 45 verificações:
- fluxo abrir → vincular → encerrar;
- teto do débito;
- saldo reservado contra duas sessões;
- totem sem poderes de agente;
- limite negativo e preço nulo recusados;
- comandos;
- encerramento pelo suporte;
- soma zero e imutabilidade;
- autor e origem dos eventos;
- permissões de função;
- RLS por papel.

A validação e a revisão independente acharam e corrigiram bugs do rascunho (lista no fim de `sql/03-funcoes.sql`).

O que ela **não** cobre:
- Realtime, Edge Functions, pg_cron e o Auth do Supabase;
- concorrência real (o PGlite tem uma conexão só);
- a diferença de versão. O PGlite roda **Postgres 18**, e o Supabase, 15 ou 17. No 18, gatilho adiado roda com o papel de quem enfileirou; até o 17, com o papel ativo no commit. Por isso a soma zero foi declarada SECURITY DEFINER, e o teste no Supabase de verdade (pgTAP) continua obrigatório.

## CI (GitHub Actions)

O `deploy.yml` atual só publica. Entra um `ci.yml` em todo PR:

1. `npm ci`
2. `npm run lint` (oxlint)
3. `npm run typecheck` (`tsc -b`)
4. `npm test` (Vitest)
5. Banco: `supabase start` e `supabase test db` (o runner do GitHub tem Docker, mesmo que o notebook não tenha)

O `deploy.yml` passa a receber `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` das variáveis do repositório.

Migrations aplicadas por `supabase db push` no projeto de demo, manualmente, depois do merge. Nada de migration automática em produção.

## Pronto, para cada tarefa

- Tipos, lint e testes passando.
- Migration aplicada no ambiente de dev e testada.
- Verificado na tela de verdade (navegador e, para app e totem, celular).
- O evento esperado aparece na linha do tempo.
- Mudanças em migration, RLS ou dinheiro passam pelo agente **revisor** antes do PR.
- Documentação em `docs/` atualizada se o contrato mudou.

## Riscos de segurança aceitos (segurança mínima, registrar e revisitar)

| Risco | Por que foi aceito | Quando revisitar |
|---|---|---|
| `qr_token` das vagas visível a qualquer logado | o mapa precisa ler as vagas; o token só permite reservar por 5 min | antes de produção |
| Canal de telemetria público | não tem dado pessoal. **Atenção:** qualquer um com a chave publicável também pode **enviar** amostras falsas para as telas (só visual; a cobrança vem do banco) | canal privado com Realtime Authorization antes de produção |
| Contas de demonstração com senha no build (se `VITE_MODO_DEMO`) | agilidade na apresentação | desligar após o Challenge |
| Sem limite de tentativas no código de vínculo | código de 4 caracteres que expira em 10 min | antes de produção |
| Sem fluxo de LGPD (exportar e apagar dados) | fora do escopo | antes de produção |

## Observabilidade

- **Agente:** log em JSON no stdout (ciclo, comandos, erros, fila offline), que o Railway mostra.
- **Banco:** os logs do Supabase mais a tabela `alertas`, que é o painel operacional.
- **Saúde dos aparelhos:** a tela `/goodwe/aparelhos`.
- **Backup:** exportação semanal (`supabase db dump`), guardada fora do Supabase (F4; o caminho depende da pergunta Q2).
