# 07 · Rastreio e gestão

Decisões: [ADR-0004](../adr/0004-eventos-so-de-inclusao.md), [ADR-0006](../adr/0006-regras-como-dados-versionados.md).

## Catálogo de eventos

Cada evento grava ator (usuário, dispositivo, sistema ou gateway), origem, entidade, antes e depois, motivo e correlação. A correlação de tudo o que uma recarga gera é o id da sessão.

| Tipo | Entidade | Gerado quando | Origem típica |
|---|---|---|---|
| `SOLICITACAO_ENVIADA` | solicitacao | pedido enviado (com score) | app |
| `SOLICITACAO_<STATUS>` | solicitacao | VISTORIA, PENDENTE_DOC, APROVADO, REPROVADO | painel |
| `PONTO_CRIADO` | ponto | aprovação | painel |
| `PONTO_<STATUS>` | ponto | INSTALACAO, ATIVO, SUSPENSO, ENCERRADO | painel |
| `PONTO_CONFIG_ALTERADA` | ponto | campo de configuração mudou (só o que mudou) | painel |
| `TARIFA_NOVA_VERSAO` | regra_tarifa | nova regra | painel |
| `PARAMETROS_NOVA_VERSAO` | parametros | nova versão | painel |
| `APARELHO_PAREADO` / `APARELHO_REVOGADO` | dispositivo | pareamento / revogação | edge |
| `MEMBRO_ADICIONADO` / `MEMBRO_ALTERADO` | membro | convite, mudança de papel | painel |
| `VAGA_<ESTADO>` | vaga | qualquer mudança de estado | agente, cron, painel |
| `LIMITE_ALTERADO` | vaga | variação ≥ 2 A, no máximo 1 a cada 30 s por vaga | agente |
| `SESSAO_ABERTA` | sessao | cabo conectado | agente |
| `SESSAO_<ESTADO>` | sessao | AUTORIZADA, CARREGANDO, PAUSADA, ENCERRADA, PAGA, PENDENTE, EXPIRADA, CANCELADA | agente, app, totem, cron |
| `COMANDO_EMITIDO` / `COMANDO_<STATUS>` | comando | emissão e resposta | painel, app, agente, cron |
| `COBRANCA_GERADA` / `COBRANCA_<STATUS>` | cobranca | fim da carga, estorno | agente, painel |
| `PAGAMENTO_<STATUS>` | pagamento | AGUARDANDO, PAGO, EXPIRADO, FALHOU, ESTORNADO | edge, webhook, cron |
| `ALERTA_ABERTO` / `ALERTA_<STATUS>` | alerta | abertura, assunção, resolução | cron, agente, painel |
| `FECHAMENTO_<STATUS>` | fechamento | FECHADO, QUITADO | cron, painel |

## Linha do tempo

`linha_do_tempo(entidade, id)` devolve os eventos em ordem. Para uma sessão, junta os eventos da própria sessão e os de mesma correlação (vaga, comandos, cobrança, pagamento). A tela mostra:

```
14:30:02  Agente do Café Aurora   Vaga 2 conectada · sessão S-000123 aberta · código 7K4Q · R$ 1,92/kWh cotado
14:30:41  Ana Prado (app)         Sessão autorizada · R$ 1,92/kWh travado · limite R$ 48,00
14:30:43  Agente do Café Aurora   Comando INICIAR executado · vaga carregando
14:52:10  Agente do Café Aurora   Corrente reduzida para 16 A · "outra vaga começou a carregar"
15:41:03  Ana Prado (app)         Pedido de encerramento
15:41:05  Agente do Café Aurora   Sessão encerrada · 12,4 kWh · cobrança C-000088 R$ 23,81 · paga pela carteira
```

## Alertas

| Tipo | Regra | Severidade | Resolve sozinho quando |
|---|---|---|---|
| `APARELHO_OFFLINE` | agente ou totem sem sinal há > 2 min | CRÍTICO (agente) / ATENÇÃO (totem) | o sinal volta |
| `VAGA_FALHA` | agente informou FALHA | CRÍTICO | a vaga volta a DISPONIVEL |
| `SESSAO_SEM_MEDICAO` | sessão CARREGANDO sem medição há > 5 min | ATENÇÃO | chega medição |
| `COMANDO_SEM_RESPOSTA` | INICIAR ou PARAR expirou (INICIAR vencido também cancela a sessão) | ATENÇÃO | — (manual) |
| `COMANDO_FALHOU` | o agente respondeu que não conseguiu executar | ATENÇÃO | — (manual) |
| `PAGAMENTO_PENDENTE` | pagamento AGUARDANDO há > 30 min | INFO | pago ou expirado |
| `SESSAO_PENDENTE` | sessão PENDENTE há > 24 h | ATENÇÃO | quitada |
| `CONCILIACAO_DIVERGENTE` | conferência diária falhou | CRÍTICO | — (manual) |
| `ABAIXO_DO_LIMIAR` | ponto com uso < `limiar_viabilidade_h` no mês (IA) | INFO | o uso sobe |

A deduplicação é pela `chave` (por exemplo, `APARELHO_OFFLINE:<dispositivo>`): só existe um alerta aberto por chave.

## Gestão por papel

| O quê | GoodWe admin | GoodWe suporte | Franqueado admin | Operador |
|---|---|---|---|---|
| Decidir solicitações | ✔ | — | — | — |
| Suspender, reativar, encerrar ponto | ✔ | — | — | — |
| Configurar ponto, vagas, horário | — | — | ✔ | — |
| Nova versão de tarifa | — | — | ✔ | — |
| Parâmetros da rede, catálogo | ✔ | — | — | — |
| Parear e revogar aparelhos | ✔ | — | ✔ | — |
| Manutenção de vaga | — | — | ✔ | ✔ |
| Encerrar sessão à distância | ✔ | ✔ | ✔ | ✔ |
| Estornar | ✔ | ✔ | — | — |
| Ver financeiro do ponto | ✔ | ✔ | ✔ | — |
| Fechar e quitar mês | ✔ | — | ver | — |
| Convidar membros | ✔ (GoodWe) | — | ✔ (sua organização) | — |
| Alertas | rede | rede | ponto | ponto |
| Bancada de simulação | — | — | ✔ (ponto simulado) | — |

Toda ação que mexe em estado ou dinheiro pede **motivo** na tela (obrigatório em suspender, encerrar, estornar e ajustar), e o motivo vai para o evento.

## Fechamento mensal

- **Dia 1, 00:10 de Brasília:** `fechar_mes(mês anterior)` soma as cobranças de cada ponto (recargas, energia, bruto, royalty, fundo, processamento, custo de energia estimado), lança a `MENSALIDADE` e grava o fechamento `FECHADO`.
- **O mês corrente** aparece como `ABERTO`, recalculado na hora pela view.
- **A GoodWe quita** o fechamento: `REPASSE` de **líquido − mensalidade daquele mês**, nunca o saldo atual do recebível, que já inclui o mês seguinte. O fechamento vira `QUITADO`. Se o valor der negativo (mensalidade maior que o líquido), não há repasse e o saldo negativo abate no mês seguinte.
- **`fechar_mes` é idempotente:** rodar de novo pula os pontos já fechados.
- **Exportações em CSV:** fechamento, extrato do recebível e sessões do período.

## Suporte

Busca por código de sessão (S-000123), código de cobrança, e-mail do motorista ou ponto. A tela da sessão mostra a linha do tempo e as ações:

| Ação | O que faz |
|---|---|
| Encerrar sessão travada | Emite PARAR (`solicitar_encerramento`). Se o agente não responder em 30 s, `suporte_encerrar_sessao` encerra pelo banco com a última medição, motivo `SUPORTE` e a observação no evento. |
| Estornar | Total ou parcial, com motivo. Na carteira, o valor volta para o saldo; no visitante, é estornado no gateway. |
| Reenviar Pix | Gera um pagamento novo para uma pendência ou uma recarga de carteira que expirou. |
