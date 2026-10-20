# ADR-0006: Regras de negócio como dados versionados

**Status:** Proposta
**Data:** 19/10/2026
**Decisores:** João

## Contexto

Royalty (6%), fundo (2%), processamento (1,5%), mensalidade da plataforma (R$ 180), limiar de viabilidade (2,3 h/dia) e os fatores de tarifa estão em constantes de `src/domain/catalogo.ts` e `src/domain/engine/tarifa.ts`. Mudar qualquer um exige deploy e reescreve o passado: um painel recalculado hoje mostraria a conta de ontem com a regra de hoje.

## Decisão

- `parametros_rede`: regras globais da franquia, com `vigente_desde`. A vigente é a linha mais recente com `vigente_desde <= agora`.
- `regras_tarifa`: regras de preço por ponto, com `vigente_desde`, editadas pelo franqueado.
- Catálogos (modelos de carregador, veículos, formatos de franquia, regiões) viram tabelas editáveis pela GoodWe.
- Toda sessão e toda cobrança guardam os ids da regra e dos parâmetros aplicados.

Alterar é sempre inserir uma versão nova; a anterior fica.

## Opções consideradas

### A: Linhas com vigência (escolhida)
**Prós:** histórico completo; dá para agendar mudança futura; cobrança auditável.
**Contras:** consultas precisam pegar "a vigente na data".

### B: Tabela de configuração com uma linha editável
**Prós:** simples.
**Contras:** perde o histórico e reescreve o passado.

## Consequências

- **Fica mais fácil:** administrar pela tela; explicar uma cobrança antiga.
- **Fica mais difícil:** toda função de cálculo recebe a data de referência.
- **A revisitar:** aprovação em duas etapas para mudanças de parâmetro da rede.

## Itens de ação

1. [ ] Funções `private.parametros_vigentes(ts)` e `private.regra_tarifa_vigente(ponto, ts)`.
2. [ ] Seed com os valores atuais de `catalogo.ts` como primeira versão.
