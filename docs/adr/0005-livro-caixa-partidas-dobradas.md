# ADR-0005: Livro-caixa em partidas dobradas

**Status:** Proposta
**Data:** 19/10/2026
**Decisores:** João

## Contexto

Dinheiro passa por várias mãos: carteira do motorista, comércio, royalties e fundo da GoodWe, tarifa de processamento, gateway. O sistema precisa fechar o mês por franqueado, estornar sem apagar e provar de onde veio cada centavo.

## Decisão

Um livro-caixa com:
- `contas`, por dono (carteira do motorista, recebível do ponto, royalties, fundo, tarifas, receita da plataforma, externo);
- `transacoes`, o fato de negócio (recarga de carteira, recarga de veículo, estorno, mensalidade, repasse);
- `lancamentos`, os valores com sinal: positivo entra na conta, negativo sai.

Regra: **a soma dos lançamentos de cada transação é zero** (gatilho de restrição adiado até o fim da transação). Lançamentos nunca são alterados nem apagados. Saldo é a soma dos lançamentos da conta. Estorno é uma transação nova, com os sinais invertidos, ligada à original por `estorno_de`.

## Opções consideradas

### A: Partidas dobradas (escolhida)
**Prós:** fecha sempre; auditável; estorno e ajuste sem perder histórico; o fechamento mensal é só uma soma.
**Contras:** mais tabelas; exige cuidado com arredondamento.

### B: Coluna de saldo atualizada
**Prós:** simples.
**Contras:** perde o histórico; uma condição de corrida corrompe o saldo; não explica de onde veio o número.

### C: Só a tabela de cobranças
**Prós:** já existe.
**Contras:** não representa carteira, estorno, mensalidade nem repasse.

## Consequências

- **Fica mais fácil:** extrato, fechamento, conciliação com o gateway e suporte.
- **Fica mais difícil:** arredondamento. A regra é calcular royalty, fundo e processamento com 2 casas (arredondamento comercial) e mandar o resto para o comércio, para a soma fechar.
- **A revisitar:** nota fiscal (ICMS ou ISS), fora do escopo agora.

## Itens de ação

1. [ ] Tabelas e gatilho de soma zero ([sql/01-esquema.sql](../arquitetura/sql/01-esquema.sql)).
2. [ ] Tipos de transação e exemplos ([06-pagamento-e-livro-caixa.md](../arquitetura/06-pagamento-e-livro-caixa.md)).
