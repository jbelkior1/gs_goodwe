# ADR-0008: Pagamento por adaptador, simulado no MVP, com carteira pré-paga

**Status:** Proposta (depende das perguntas Q9 e Q10)
**Data:** 19/10/2026
**Decisores:** João

## Contexto

Cobrar de verdade exige um gateway com CNPJ e uma definição fiscal ainda em disputa (ICMS × ISS). O projeto não tem CNPJ. O pitch precisa mostrar o fluxo completo.

Pesquisa de 18/10/2026:
- **Asaas:** split nativo por `walletId`, ambiente de teste gratuito com botão de confirmar, e o estorno desfaz o split. Subcontas só por conta PJ.
- **Mercado Pago:** 0,99%, mas o split é só de 2 partes.
- **Efí:** 1,19%, mas não estorna cobrança com split.
- **Mercado de recarga:** a Tupi usa carteira com mínimo de R$ 20 e garantia de R$ 150 no cartão; a EZVolt teve fraude com caução.

## Decisão

1. O sistema fala com uma interface `GatewayPagamento` (criar Pix, consultar, estornar, interpretar webhook). O MVP usa o adaptador **simulado**, que percorre o mesmo caminho do real: a confirmação chega pela mesma Edge Function de webhook.
2. Modelo de cobrança do MVP:
   - **Motorista com app:** carteira pré-paga. Saldo mínimo de R$ 20 para iniciar; o limite da sessão é o saldo disponível; débito exato no fim.
   - **Visitante:** Pix por valor no totem, antes de começar; a sobra é devolvida.
3. Gateway real (fase F5): adaptador Asaas, primeiro no ambiente de teste.

## Opções consideradas (modelo de cobrança)

| Opção | Experiência | Calote | Taxas | Fiscal |
|---|---|---|---|---|
| **Carteira pré-paga** (escolhida p/ app) | Início imediato após o QR | Nenhum | 1 por recarga de saldo | A plataforma guarda o saldo e repassa no fechamento; precisa de definição antes da produção |
| Pix por recarga, split na hora | Pagar antes de cada recarga | Nenhum | 1 por recarga | O comércio é o vendedor (mais limpo) |
| Pix pós-pago no fim | Mais simples | Alto | 1 por recarga | O comércio é o vendedor |

## Consequências

- **Fica mais fácil:** demo sem conta real; trocar de gateway sem mexer no resto.
- **Fica mais difícil:** a taxa do gateway acontece na recarga de saldo, e não em cada sessão. Proposta: manter a "taxa de processamento" de 1,5% por sessão, paga pelo comércio, numa conta que cobre as taxas do gateway (pergunta Q10).
- **A revisitar:** modelo e gateway de produção; emissão de nota.

## Itens de ação

1. [ ] Interface e adaptador simulado ([06-pagamento-e-livro-caixa.md](../arquitetura/06-pagamento-e-livro-caixa.md)).
2. [ ] Edge Functions `pagamento-criar` e `pagamento-webhook`, idempotentes.
