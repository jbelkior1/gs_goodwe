# 03 · Contratos: funções, Edge Functions, tempo real e erros

O código SQL de referência está em [sql/03-funcoes.sql](sql/03-funcoes.sql). Aqui fica o contrato que as telas e o agente usam.

## Convenções

- Chamadas pelo `supabase.rpc('<nome>', {...})`, sempre com usuário logado: pessoa, ou aparelho com identidade de pareamento.
- O PostgREST só expõe o esquema `public`. Funções chamadas só pelas Edge Functions também ficam em `public`, com EXECUTE **só para `service_role`**.
- `anon` não executa nada. `authenticated` executa as funções públicas, e cada uma confere o papel por dentro.
- Funções do **agente** recusam o totem (`pontos_do_agente`). O totem só lê e cria a sessão do visitante.
- Toda função que muda estado grava evento (ADR-0004) e devolve a linha atualizada.
- Erros de negócio têm código `PWnnn` no campo `code` da resposta. A mensagem já vem em português para a tela.
- ♻ marca as funções idempotentes: repetir a chamada com os mesmos dados não duplica nada.

## Catálogo de erros

| Código | Quando | O que a tela mostra |
|---|---|---|
| `PW001` | Vaga já tem sessão em aberto, ou está reservada para outra pessoa | "Esta vaga já está em uso." / "Esta vaga está reservada." |
| `PW002` | Código de vínculo inválido ou já usado, inclusive o segundo celular no mesmo QR | "Código inválido. Confira o código no totem." |
| `PW003` | Código de vínculo expirado | "O código venceu. Desconecte e conecte o cabo de novo." |
| `PW004` | Saldo abaixo do mínimo | "Saldo insuficiente. Recarregue pelo menos R$ X." + botão Recarregar |
| `PW005` | Ponto não está ATIVO, ou vaga em MANUTENCAO/FALHA | "Este ponto está indisponível agora." |
| `PW006` | Transição de estado inválida, sessão inexistente ou medição inválida | "Não foi possível concluir. Atualize a tela." |
| `PW007` | Sem permissão para a ação | "Você não tem permissão para isso." |
| `PW010` | Usuário sem cadastro de motorista | Leva ao cadastro do veículo |
| `PW011` | Recarga pendente de pagamento | "Há uma recarga pendente. Recarregue a carteira para continuar." |
| `PW012` | Preço mudou entre a tela e a confirmação (ou não foi enviado) | Recota e pede nova confirmação |
| `PW013` | Código de pareamento inválido ou vencido | "Código inválido ou vencido. Gere outro no painel." |
| `PW014` | Lista de verificação incompleta | Mostra os itens pendentes |
| `PW015` | Limite de valor ≤ 0 | "Informe um limite maior que zero." |
| `PW016` | Ação de suporte sem motivo | "Informe o motivo." |
| `PW020` | Ponto sem tarifa vigente | "Defina a tarifa antes de ativar." |
| `PW900`–`PW903` | Registro imutável, transação que não fecha, ponto sem recebível, lançamento sem conta | Erro interno, gera alerta |

## Funções por fase

### F0: fundação

| Função | Quem chama | Entrada | Saída |
|---|---|---|---|
| `meu_perfil` | qualquer logado | — | papéis, organizações, pontos, motorista, dispositivo |

### F1: concessão, ciclo de vida e aparelhos

| Função | Quem | Entrada | Saída | Efeito e eventos |
|---|---|---|---|---|
| `enviar_solicitacao` | candidato | dados do comércio | solicitação com score | `SOLICITACAO_ENVIADA` |
| `reenviar_solicitacao` | candidato | id, dados | solicitação | volta a ANALISE, novo score |
| `decidir_solicitacao` | GoodWe admin | id, decisão, motivo | `{ponto_id}` se aprovada | cria organização, membro, ponto PLANEJADO, vagas, tarifa padrão e **conta de recebível**; `SOLICITACAO_<STATUS>`, `PONTO_CRIADO` |
| `checklist_ativacao` | franqueado, GoodWe | ponto | `[{item, ok, detalhe}]` | — |
| `mudar_status_ponto` | franqueado admin (ativar) / GoodWe admin | ponto, novo status, motivo | ponto | `PONTO_<STATUS>`; `PW014` se faltar item |
| `gerar_codigo_pareamento` | franqueado admin | ponto, tipo | `{codigo, expira_em}` | — |
| `dispositivo_sinal` ♻ | **qualquer aparelho** (totem e agente), a cada 30 s | versão | agente: config das vagas (modelo, ligação, limites, driver) | último sinal em `dispositivos` (fora do tempo real); vagas saem de OFFLINE; resolve alerta |
| `definir_manutencao` | franqueado | vaga, ligar, motivo | vaga | `VAGA_MANUTENCAO` / `VAGA_DISPONIVEL` |
| `atualizar_regra_tarifa` | franqueado admin | ponto, regra, vigente_desde | regra | `TARIFA_NOVA_VERSAO` |
| `cotar_preco` | motorista, totem | vaga | `{tarifa_kwh, fatores, vagas_livres}` | — |
| `listar_pontos_mapa` | motorista | — | pontos ATIVO com vagas livres e preço agora | — |
| `linha_do_tempo` | franqueado, GoodWe | entidade, id | eventos em ordem | — |
| `consumir_codigo_pareamento` | **só service_role** (Edge Function) | código, usuário técnico, nome | dispositivo | `APARELHO_PAREADO` |

### F2: agente

| Função | Quem | Entrada | Saída | Efeito |
|---|---|---|---|---|
| `receber_comandos` ♻ | agente | — | comandos PENDENTE dos seus pontos | marca ENTREGUE. O Realtime só avisa; esta função também é a varredura periódica |
| `confirmar_comando` ♻ | agente | comando, sucesso, erro | comando | INICIAR ok → sessão CARREGANDO; INICIAR falhou → sessão CANCELADA + alerta `COMANDO_FALHOU`; vencido → nada (o agente desfaz) |
| `agente_atualizar_vagas` ♻ | agente | lote de mudanças de estado/limite | — | `VAGA_<ESTADO>`, `LIMITE_ALTERADO`; nunca potência a cada ciclo |
| `registrar_medicao` | agente | amostras (30 s), leitura da entrada (5 min) | — | telemetria, leituras, sessão; sem evento |
| `abrir_sessao` ♻ | agente | vaga, `conexao_id` (uuid gerado pelo agente) | sessão ABERTA com código | `SESSAO_ABERTA`, `VAGA_CONECTADO`; vaga reservada → sessão reservada para quem reservou |
| `registrar_desconexao` ♻ | agente | vaga, `conexao_id` | — | `SESSAO_EXPIRADA` ou `SESSAO_CANCELADA`; vaga DISPONIVEL |
| `sim_comando` | franqueado admin | ponto, tipo `SIM_*`, parâmetros | comando | só em ponto simulado |
| `sim_autorizar_demo` | agente simulador | sessão ABERTA | sessão AUTORIZADA | tráfego sintético, só ponto `demo`: motorista sorteado de um conjunto de demonstração, limite fixo |
| `assumir_alerta`, `resolver_alerta` | franqueado, GoodWe | alerta | alerta | `ALERTA_<STATUS>` |

### F3: recarga e pagamento

| Função | Quem | Entrada | Saída | Efeito |
|---|---|---|---|---|
| `previa_vinculo` | motorista | código do QR | ponto, vaga, `tarifa_kwh`, validade, saldo disponível, saldo mínimo | nenhum. **É a fonte do preço mostrado** na tela de confirmação |
| `vincular_sessao` | motorista | código, `tarifa_vista`, veículo, bateria informada, limite | sessão AUTORIZADA | trava a carteira e o preço, reserva o saldo e emite o INICIAR com a regra completa |
| `reservar_vaga` | motorista | `qr_token` do adesivo | `{vaga, reservado_ate}` | confere saldo; `VAGA_RESERVADO` |
| `confirmar_reserva` | motorista que reservou | sessão, `tarifa_vista`, bateria, limite | sessão AUTORIZADA | igual ao vínculo, sem código |
| `iniciar_visitante` | totem | vaga, valor | `{sessao_id, conta_id}` | origem VISITANTE, código anulado, validade = a do Pix, conta do visitante. **Não cria pagamento** |
| `sessao_totem` | totem | vaga | primeiro nome, números da sessão, resumo da cobrança | nenhum |
| `solicitar_encerramento` | motorista, totem, franqueado, suporte | sessão, origem | comando | comando PARAR com motivo |
| `registrar_fim_carga` ♻ | agente | sessão, energia, minutos de carga, minutos parados **brutos**, motivo, **hora do fim** | cobrança | cobrança, transação, lançamentos; `SESSAO_ENCERRADA` → `SESSAO_PAGA` / `SESSAO_PENDENTE`; sobra do visitante devolvida |
| `confirmar_pagamento` ♻ | **só service_role** (webhook) | provedor, id externo, status, corpo | pagamento | lançamentos; carteira: quita PENDENTE se o saldo voltou a ≥ 0; visitante: autoriza, ou devolve tudo se a sessão já não está ABERTA |

### F4: gestão

| Função | Quem | Efeito |
|---|---|---|
| `atualizar_parametros` | GoodWe admin | nova versão de `parametros_rede` |
| `suporte_encerrar_sessao` | GoodWe (suporte ou admin), com motivo | encerra pelo banco com a última medição, motivo SUPORTE. Usar quando o agente não respondeu a um PARAR |
| `estornar_cobranca` | GoodWe suporte | transação ESTORNO proporcional, com motivo |
| `fechar_mes` ♻ | tarefa agendada (ou GoodWe admin) | fechamentos FECHADO e MENSALIDADE; pontos já fechados são pulados |
| `quitar_fechamento` | GoodWe admin | REPASSE de (líquido − mensalidade) **daquele mês**; QUITADO |
| `buscar_suporte` | GoodWe suporte | busca por código de sessão, e-mail ou ponto |

## Edge Functions

| Função | Chamada por | Autenticação | O que faz |
|---|---|---|---|
| `parear-dispositivo` | totem / agente | `verify_jwt = false`; valida o código | confere o código (`PW013`); cria o usuário técnico; chama `consumir_codigo_pareamento`; devolve `{email, senha, ponto_id, tipo}` uma única vez |
| `revogar-dispositivo` | franqueado admin, GoodWe admin | JWT do usuário | marca `revogado_em` e desativa o usuário técnico |
| `pagamento-criar` | app (recarga de carteira), totem (visitante, depois de `iniciar_visitante`) | JWT | **único lugar que cria pagamento**: valida, grava `pagamentos`, chama o adaptador (simulado ou gateway), grava QR, copia-e-cola e validade (AGUARDANDO) |
| `pagamento-webhook` | gateway (ou o botão "Simular pagamento") | `verify_jwt = false`; confere a assinatura ou token do provedor (simulado: só aceito com `PAGAMENTO_PROVEDOR=simulado`) | normaliza o aviso e chama `confirmar_pagamento` com a chave secreta. Idempotente pelo par provedor + id externo |
| `pagamento-processar-estornos` | pg_cron a cada minuto (só gateway real) | chave secreta | envia ao gateway as devoluções e estornos pendentes |
| `convidar-membro` (F4) | franqueado admin, GoodWe admin | JWT | cria ou convida o usuário e grava `membros` |

As Edge Functions ficam pequenas: a regra de negócio está no SQL (ADR-0007). Usar o padrão de função que a documentação do Supabase recomendar no momento da implementação (`Deno.serve` ou `export default { fetch }`), porque o runtime está em transição.

## Tempo real

### Mudanças em tabela (Postgres Changes, respeita a RLS)

| Tela | Tabela | Filtro | Para quê |
|---|---|---|---|
| Totem | `carregadores` | `ponto_id=eq.<ponto>` | estado de cada vaga |
| Totem | `sessoes` | `ponto_id=eq.<ponto>` | código, vínculo, estado |
| Totem, app | `pagamentos` | `id=eq.<pagamento>` | QR emitido e pagamento confirmado |
| App | `sessoes` | `id=eq.<sessao>` | estado e números a cada 30 s |
| App (reserva) | `sessoes` | `reservada_para=eq.<eu>` | "seu carro conectou na Vaga 2: confirmar?" |
| App (detalhe do ponto) | `carregadores` | `ponto_id=eq.<ponto>` | vagas livres |
| Franqueado | `carregadores`, `sessoes`, `alertas` | `ponto_id=eq.<ponto>` | operação ao vivo |
| GoodWe | `alertas`, `pontos` | sem filtro (a RLS limita) | central de alertas, status |
| Agente | `comandos` | `ponto_id=eq.<ponto>` (um canal por ponto) | aviso de comando novo → `receber_comandos` |

Há um filtro por inscrição (limitação documentada). `carregadores` só muda em transição de estado ou de limite. Potência ao vivo e sinal de vida não passam por essa tabela, para não gastar a cota de mensagens.

### Telemetria (Broadcast, ADR-0009)

Tópico `telemetria:<ponto_id>`, transmitido pelo agente **só enquanto alguma tela estiver olhando**: as telas entram no canal com Presence, e o agente acompanha a presença.

Evento `amostra`, a cada 5 s por sessão ativa:

```json
{
  "sessao_id": "uuid",
  "vaga_id": "uuid",
  "ts": "2026-10-19T14:32:05.000Z",
  "estado_vaga": "CARREGANDO",
  "limite_a": 32,
  "corrente_a": 31.4,
  "tensao_v": 221.3,
  "potencia_kw": 6.95,
  "energia_kwh": 4.812,
  "custo_estimado": 9.24,
  "minutos_parados": 0
}
```

Evento `entrada`, a cada 10 s, só para o painel de demanda: `{ts, comercio_kw, solar_kw, bateria_kw, importacao_kw, corrente_por_fase_a: [..], limites: {vaga_id: A}}`.

A bateria **não** vai na amostra (ADR-0011): a tela estima a partir da bateria informada e da capacidade do veículo.

### Comandos (payload em `comandos.parametros`)

| Tipo | Parâmetros |
|---|---|
| `INICIAR` | `{limite_valor, tarifa_kwh, taxa_sessao, preco_minuto, tolerancia_ocioso_min, preco_minuto_ocioso, valor_minimo}`: tudo o que o agente precisa para estimar o custo e parar no limite |
| `PARAR` | `{motivo}` |
| `LIMITAR` | `{corrente_a}`: teto manual do franqueado; o motor de demanda continua valendo |
| `SIM_CONECTAR` | `{veiculo_id, soc_real}` |
| `SIM_DESCONECTAR` | `{}` |
| `SIM_CARGA_COMERCIO` | `{kw}` |
| `SIM_SOL` | `{fator}` (0 = noite, 1 = sol pleno) |
| `SIM_FALHA` | `{codigo}` |

Ciclo de um comando:
1. O agente pega o comando com `receber_comandos`, que o marca ENTREGUE.
2. Executa e responde com `confirmar_comando` em até 30 s.
3. Se a resposta for "vencido", ele desfaz a ação.
