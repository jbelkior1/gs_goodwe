# ADR-0012: Camada de dados do front com hooks e views

**Status:** Proposta
**Data:** 19/10/2026
**Decisores:** João

## Contexto

As telas chamam funções síncronas de `src/domain/db.ts` (por exemplo, `kpisDoPonto(id)`) sobre uma base em memória. Com o banco real, os dados são assíncronos, mudam em tempo real e precisam respeitar o papel do usuário.

## Decisão

- Nova camada `src/data/`: cliente Supabase, tipos gerados (`supabase gen types`), hooks por assunto (`usePontosMapa`, `useVagasDoPonto`, `useSessaoAoVivo`, `useKpisPonto`, `useExtrato` etc.) sobre o **TanStack Query**, com invalidação disparada pelo Realtime.
- Os números dos painéis vêm de **views** no banco (`v_kpis_ponto_mes`, `v_serie_diaria`, `v_perfil_horario`, `v_kpis_rede`, `v_royalties_mes`).
- As telas migram uma a uma. O `db.ts` é apagado quando a última tela sair dele.
- Os motores puros (`src/domain/engine`) continuam e recebem dados já buscados.

## Opções consideradas

### A: Hooks + views (escolhida)
**Prós:** cada tela busca só o que precisa; números calculados uma vez no banco; escala.
**Contras:** reescrever a parte de dados de cada tela.

### B: Carregar tudo num store em memória e manter as funções síncronas
**Prós:** quase nenhuma tela muda.
**Contras:** baixa a rede inteira em cada aparelho; furaria a separação por organização no motorista e no totem; não escala.

## Consequências

- **Fica mais fácil:** tempo real por tela, carregamento e erro tratados de forma padrão.
- **Fica mais difícil:** a migração é tela por tela, e todas têm de ganhar estado de carregando e vazio.
