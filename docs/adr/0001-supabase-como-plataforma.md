# ADR-0001: Supabase como plataforma única

**Status:** Proposta
**Data:** 19/10/2026
**Decisores:** João (com o grupo do Challenge)

## Contexto

O app é uma SPA (React + Vite) sem servidor de dados. Cada aparelho gera a própria base em memória (`src/domain/seed.ts`), então nada do que acontece numa tela aparece na outra. Para o ecossistema funcionar, as quatro interfaces (motorista, totem, franqueado, GoodWe) e o agente do ponto precisam compartilhar o mesmo estado, em tempo real e com controle de quem vê o quê.

Restrições:
- custo zero ou quase zero;
- prazo do Challenge;
- o `docs/schema.sql` já foi desenhado para Postgres;
- o João já opera Supabase em outros projetos.

## Decisão

Usar o Supabase como plataforma única:
- **Postgres** é a fonte da verdade e guarda as regras de negócio em funções SQL.
- **Auth** cuida do login e da identidade dos aparelhos.
- **Realtime** avisa as telas quando algo muda e transmite a telemetria.
- **Edge Functions** cuidam do pagamento e do pareamento.
- **pg_cron** roda as tarefas agendadas.

## Opções consideradas

### A: Supabase (escolhida)
| Dimensão | Avaliação |
|---|---|
| Complexidade | Baixa: banco, login e tempo real prontos |
| Custo | Free cobre a demo; limites listados abaixo |
| Escala | Suficiente para dezenas de pontos; Realtime e banco limitam antes |
| Familiaridade | Alta |

**Prós:** o app estático continua no GitHub Pages; RLS dá a separação por organização sem servidor próprio; o Realtime resolve totem ↔ app.
**Contras:** limites do plano Free (2 milhões de mensagens/mês, 500 MB, pausa após 7 dias, sem backup); alguns recursos em beta.

### B: Backend Node próprio (Express + Postgres + WebSocket)
| Dimensão | Avaliação |
|---|---|
| Complexidade | Alta: autenticação, WebSocket e deploy por conta própria |
| Custo | Servidor sempre ligado (Railway ou VPS) |
| Escala | A que o servidor aguentar |
| Familiaridade | Média |

**Prós:** controle total, sem limites de terceiros.
**Contras:** semanas a mais só de infraestrutura; não sobra tempo para o produto.

### C: Firebase
**Prós:** tempo real maduro.
**Contras:** banco de documentos, o que perde o modelo relacional, o livro-caixa com integridade e o `schema.sql` existente.

## Trade-offs

O Supabase troca controle por velocidade. O risco principal são os limites do Free, e a arquitetura se adapta a eles:
- telemetria transmitida a cada 5 s e gravada a cada 30 s ([ADR-0009](0009-telemetria-5s-30s.md));
- o agente grava direto no banco, sem Edge Function no caminho;
- o login é por e-mail e senha, porque o servidor de e-mail padrão manda só 2 por hora.

## Consequências

- **Fica mais fácil:** compartilhar estado, separar acesso por organização e manter o front estático.
- **Fica mais difícil:** depurar regra de negócio em SQL; manter o projeto ativo (ele pausa após 7 dias sem uso).
- **A revisitar:** plano pago se a cota de mensagens ou o tamanho do banco apertarem; backup automático.

## Itens de ação

1. [ ] Criar a organização e o projeto (pergunta Q2).
2. [ ] `supabase init` no repositório e migrations em `supabase/migrations/`.
3. [ ] Exportação semanal do banco (`supabase db dump`) guardada fora do Supabase.
