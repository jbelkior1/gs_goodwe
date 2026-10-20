# 06 · Pagamento e livro-caixa

Decisões: [ADR-0005](../adr/0005-livro-caixa-partidas-dobradas.md), [ADR-0007](../adr/0007-tarifa-e-cobranca-no-banco.md), [ADR-0008](../adr/0008-pagamento-por-adaptador.md). Depende das perguntas Q9 a Q11.

## Como a conta é montada

Regra de tarifa do ponto (`regras_tarifa`):

```
tarifa_kwh  = round(preco_base_kwh × fator_hora[h] × fator_ocupacao × fator_energia, 2)
                (travada na autorização; h = hora em America/Sao_Paulo)
valor_bruto = round(energia_kwh × tarifa_kwh, 2)
            + taxa_sessao                                   (se houve energia)
            + round(minutos_carga × preco_minuto, 2)
            + round(max(0, minutos_ociosos − tolerancia) × preco_minuto_ocioso, 2)
            com piso em valor_minimo (a diferença entra como taxa de sessão)
```

- **Valores do MVP** (pergunta Q11): taxa de sessão 0, preço por minuto 0, tolerância de 10 min, ociosidade de R$ 0,50/min, mínimo 0.
- **Fator de energia da região:** `1 + (custo da distribuidora / 0,85 − 1) × 0,6`, como hoje.
- **Por que tantos componentes:** o Inmetro ainda não publicou o regulamento de medição para eletropostos (previsão do grupo de trabalho: dezembro de 2026). Se a cobrança só por kWh tiver de mudar, muda a regra, não o código.

## Repartição (sobre o bruto)

```
royalty       = round(bruto × royalty_pct, 2)         6%
fundo         = round(bruto × fundo_pct, 2)           2%
processamento = round(bruto × processamento_pct, 2)   1,5% (Q10)
liquido       = bruto − royalty − fundo − processamento   (o resto vai para o comércio: a soma sempre fecha)
```

O **custo de energia** (`energia × custo da distribuidora`) fica gravado na cobrança como estimativa: o comércio paga essa energia na conta de luz, então ele não é um lançamento.

O resultado do franqueado no painel é `líquido − custo de energia estimado − mensalidade da plataforma`. É a mesma conta de hoje (`liquidoLojista − plataformaMes`), só que separada em partes auditáveis.

## Contas do livro-caixa

| Conta | Dono | Saldo representa |
|---|---|---|
| `CARTEIRA` (motorista) | motorista | crédito pré-pago disponível (pode ficar negativo por ociosidade, o que bloqueia nova sessão) |
| `CARTEIRA` (visitante) | sessão do visitante | o Pix pago antes, até devolver a sobra |
| `RECEBIVEL_PONTO` | ponto | quanto a rede deve ao comércio até o repasse |
| `ROYALTIES` | GoodWe | royalties acumulados |
| `FUNDO_MARKETING` | GoodWe | fundo acumulado |
| `TARIFAS` | rede | processamento recebido menos tarifas de gateway pagas |
| `RECEITA_PLATAFORMA` | GoodWe | mensalidades |
| `EXTERNO` | mundo de fora | contrapartida de dinheiro que entra (Pix) e sai (repasse, devolução) |

## Transações (cada uma soma zero)

| Tipo | Quando | Lançamentos |
|---|---|---|
| `RECARGA_CARTEIRA` | Pix de recarga confirmado | EXTERNO −v · CARTEIRA(motorista) +v |
| `PRE_PAGO_VISITANTE` | Pix do visitante confirmado | EXTERNO −v · CARTEIRA(visitante) +v |
| `RECARGA_VEICULO` | fim da carga | CARTEIRA −bruto · RECEBIVEL_PONTO +líquido · ROYALTIES +royalty · FUNDO +fundo · TARIFAS +processamento |
| `DEVOLUCAO_SOBRA` | visitante pagou mais do que usou | CARTEIRA(visitante) −sobra · EXTERNO +sobra |
| `TARIFA_GATEWAY` | gateway informa a taxa cobrada | TARIFAS −taxa · EXTERNO +taxa |
| `MENSALIDADE` | fechamento do mês | RECEBIVEL_PONTO −180 · RECEITA_PLATAFORMA +180 |
| `REPASSE` | GoodWe quita o fechamento | RECEBIVEL_PONTO −saldo · EXTERNO +saldo |
| `ESTORNO` | suporte estorna | lançamentos da original com sinal invertido (proporcional se parcial) |
| `AJUSTE` | correção manual da GoodWe, com motivo | livre, desde que some zero |

**Exemplo** (o mesmo do documento de arquitetura, agora com o processamento): recarga de 20 kWh a R$ 2,00 = R$ 40,00.

| Conta | Lançamento |
|---|---|
| Carteira de Ana | −40,00 |
| Recebível do Café Aurora | +36,20 |
| Royalties GoodWe (6%) | +2,40 |
| Fundo de marketing (2%) | +0,80 |
| Tarifas (1,5%) | +0,60 |
| **Soma** | **0,00** |

## Fluxos

### Recarga de carteira (app)
1. O app chama `pagamento-criar` `{finalidade: RECARGA_CARTEIRA, valor}`.
2. A Edge Function cria o pagamento `CRIADO`, chama o adaptador, grava QR, copia-e-cola e validade, e marca `AGUARDANDO`.
3. O app mostra o QR e escuta `pagamentos` id.
4. O gateway (ou o botão "Simular pagamento") chama `pagamento-webhook`, que aciona `confirmar_pagamento` e gera a transação `RECARGA_CARTEIRA`. O status vira `PAGO` e o saldo atualiza.

### Recarga do veículo com carteira
`vincular_sessao`:
- trava a carteira durante a conta, para que duas autorizações simultâneas não reservem o mesmo saldo;
- confere se o saldo disponível é de pelo menos R$ 20;
- define `limite_valor` = menor entre o saldo disponível e o limite escolhido. O limite precisa ser maior que zero (`PW015`).

O agente para sozinho ao atingir o limite. No fim, `registrar_fim_carga` debita o valor real, com **teto**: energia, taxa e tempo nunca passam do `limite_valor` (o atraso de um ciclo do agente fica por conta da rede). Só a ociosidade pode passar do limite.

### Visitante (totem)
1. `iniciar_visitante(vaga, valor)`:
   - marca a sessão como VISITANTE;
   - **anula o código de vínculo**, para que ninguém mais vincule;
   - estende a validade até a do Pix;
   - cria a conta do visitante.
2. `pagamento-criar` `{finalidade: VISITANTE, sessao_id, valor}` cria o pagamento. É o único lugar que cria pagamento. O totem mostra o QR.
3. O pagamento é confirmado (`PRE_PAGO_VISITANTE`):
   - se a sessão ainda está ABERTA, ela é autorizada com `limite_valor = valor`;
   - se não está (o cabo saiu ou a sessão expirou), a **devolução é integral**.
4. No fim, a cobrança nunca passa do valor pago (nem a ociosidade), e a sobra é devolvida (`DEVOLUCAO_SOBRA` + estorno parcial no gateway).

### Pendência
Se a ociosidade deixar a carteira negativa, a sessão e a cobrança ficam `PENDENTE`, e o motorista não abre outra (`PW011`) até recarregar. Quando a recarga deixa o saldo ≥ 0, `confirmar_pagamento` marca essas sessões e cobranças como `PAGA` e resolve o alerta.

## Adaptador de gateway

```ts
export interface CobrancaPix {
  idExterno: string;
  qrPayload: string;        // conteúdo do QR (BR Code)
  copiaECola: string;
  expiraEm: string;         // ISO
}

export interface AvisoNormalizado {
  idExterno: string;
  status: 'PAGO' | 'EXPIRADO' | 'FALHOU' | 'ESTORNADO';
  valorPago?: number;
  taxaGateway?: number;
  bruto: unknown;           // corpo original, guardado em pagamentos.ultima_resposta
}

export interface GatewayPagamento {
  readonly nome: 'simulado' | 'asaas';
  criarPix(p: { referencia: string; valor: number; descricao: string; split?: { walletId: string; valor: number }[] }): Promise<CobrancaPix>;
  consultar(idExterno: string): Promise<AvisoNormalizado>;
  estornar(idExterno: string, valor: number): Promise<void>;
  interpretarWebhook(req: Request): Promise<AvisoNormalizado>;   // valida assinatura/token do provedor
}
```

- **Simulado:**
  - gera um BR Code de demonstração (com CRC correto, mas chave fictícia, sem valor de pagamento);
  - "Simular pagamento" envia um aviso `PAGO` para o próprio webhook;
  - aceito só com `PAGAMENTO_PROVEDOR=simulado`.
- **Asaas (F5):**
  - cobrança Pix pela API, webhook com token de autenticação;
  - split com `walletId` em **valor fixo**, calculado pelo sistema sobre o bruto. No Asaas o percentual incide sobre o líquido.
- **Idempotência:** `unique (provedor, id_externo)`, e `confirmar_pagamento` ignora aviso repetido. A documentação do Asaas recomenda não concluir nada pela resposta inicial da API, só pelo webhook.

## Conciliação diária

Para cada cobrança: existe a transação `RECARGA_VEICULO` com a soma igual ao bruto.
Para cada pagamento `PAGO`: existe a transação correspondente.
Para o gateway real: o total `PAGO` do dia confere com o extrato do gateway.

Qualquer diferença abre o alerta `CONCILIACAO_DIVERGENTE`.

## Fora do escopo agora

- Nota fiscal da recarga. Estados cobram ICMS com NF-e (SEFAZ-SP, Resposta à Consulta 31007/2024); prefeituras defendem ISS; o Convênio ICMS 182/2025 permite substituição tributária pela distribuidora. A cobrança guarda o que uma nota precisaria.
- Cartão com pré-autorização e pós-pago para frotas (F5).
