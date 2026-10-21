# ADR-0007: Tarifa, cobrança e repartição calculadas no banco

**Status:** Proposta
**Data:** 19/10/2026
**Decisores:** João

## Contexto

O preço mostrado no totem e no app precisa ser exatamente o preço cobrado, e a repartição (royalty, fundo, processamento, comércio) precisa ser a mesma em todas as telas. Hoje `tarifa.ts` roda no navegador, e o histórico do `seed.ts` usa uma fórmula diferente da do motor (bug registrado em 15/10).

## Decisão

As funções que **decidem dinheiro** rodam no Postgres:
- `private.calcular_tarifa(ponto, ts, ocupacao)`: o porte de `calcularTarifa`;
- `private.encerrar_sessao(...)`: a conta da cobrança, com o teto do valor autorizado;
- `private.repartir(valor, parametros)`.

`cotar_preco`, `previa_vinculo`, `vincular_sessao`, `registrar_fim_carga` e `suporte_encerrar_sessao` usam essas funções. O `tarifa.ts` continua no front só para **prévias** (tabela de 24 horas na tela de tarifa, simulações). Um teste de contrato roda os mesmos casos nas duas versões e falha se divergirem.

## Opções consideradas

### A: Funções SQL (escolhida)
**Prós:** fonte única no lugar onde a cobrança é gravada; atômico com a transação; sem chamada extra.
**Contras:** lógica duplicada em TS para prévia, o que exige teste de contrato.

### B: Edge Function em TypeScript reaproveitando `tarifa.ts`
**Prós:** uma linguagem só.
**Contras:** o cálculo fica fora da transação do banco; gasta invocações (cota de 500 mil/mês); o futuro do runtime Deno está em mudança (anúncio de 10/10/2026).

### C: Cálculo no cliente, enviado ao banco
**Contras:** o cliente escolheria o próprio preço. Descartada.

## Consequências

- **Fica mais fácil:** cobrança auditável e idêntica em todas as telas.
- **Fica mais difícil:** manter TS e SQL iguais (mitigado pelo teste de contrato).

## Itens de ação

1. [ ] Portar `fatorHorario`, `fatorOcupacao`, `fatorEnergia` e `repartir` para SQL, lendo `regras_tarifa` e `parametros_rede`.
2. [ ] Fixtures compartilhadas `docs/arquitetura/fixtures/tarifa.json`, usadas pelo Vitest e pelos testes de banco.
