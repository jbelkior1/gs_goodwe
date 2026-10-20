# 01 · Domínio: termos, papéis, estados e regras

## Glossário

| Termo | Significado |
|---|---|
| **Organização** | A GoodWe (franqueadora) ou um franqueado (o comércio). Tem razão social e CNPJ. |
| **Membro** | Usuário ligado a uma organização, com papel (admin, operador, suporte). |
| **Solicitação** | Pedido de franquia de um comércio, com o score da IA e a decisão da GoodWe. |
| **Ponto** | O local de recarga dentro de um comércio. Tem status de ciclo de vida, entrada elétrica e vagas. |
| **Vaga** | Um carregador (tabela `carregadores`). Tem estado próprio, independente da sessão. |
| **Agente** | Programa que faz o papel das vagas e do medidor de um ou mais pontos. Hoje é simulado. |
| **Totem** | A tela de autoatendimento do ponto, pareada como aparelho. |
| **Dispositivo** | Totem ou agente pareado, com identidade própria (ADR-0010). |
| **Sessão** | Uma recarga, do cabo conectado até o pagamento. |
| **Código de vínculo** | 4 caracteres que ligam a sessão aberta à conta do motorista (ADR-0003). |
| **Código de pareamento** | 6 dígitos que ligam um aparelho a um ponto. |
| **Comando** | Ordem da plataforma para o agente: iniciar, parar, limitar, e comandos de simulação. |
| **Motorista** | Usuário do app, com veículo e carteira. |
| **Visitante** | Quem carrega pelo totem sem conta, com Pix pago antes. |
| **Carteira** | Conta do livro-caixa com o saldo pré-pago do motorista (ou do visitante, por sessão). |
| **Cobrança** | O valor de uma sessão encerrada, com composição e repartição. |
| **Transação / lançamento** | Fato financeiro e seus valores por conta; soma zero (ADR-0005). |
| **Fechamento** | O mês congelado de um ponto: totais, royalties, mensalidade, líquido. |
| **Regra de tarifa** | Preço e fatores de um ponto, com vigência (ADR-0006). |
| **Parâmetros da rede** | Royalty, fundo, processamento, mensalidade, limiar, saldo mínimo, com vigência. |
| **Evento** | Registro só de inclusão de qualquer mudança (ADR-0004). |
| **Alerta** | Pendência da operação, com severidade e responsável. |

## Papéis

O papel não fica no token do Supabase (o campo `role` do JWT é o papel do Postgres). Ele é lido das tabelas `membros`, `motoristas` e `dispositivos` por funções em `private`.

| Papel | Como a pessoa ou o aparelho chega a ele | Escopo |
|---|---|---|
| `GOODWE_ADMIN` | membro ADMIN da organização do tipo GOODWE | rede inteira, leitura e escrita |
| `GOODWE_SUPORTE` | membro SUPORTE da organização GOODWE | rede inteira em leitura; ações de suporte |
| `FRANQUEADO_ADMIN` | membro ADMIN de uma organização FRANQUEADO | pontos da organização, incluindo financeiro e configuração |
| `FRANQUEADO_OPERADOR` | membro OPERADOR de uma organização FRANQUEADO | vagas e sessões dos pontos, sem financeiro nem configuração |
| `MOTORISTA` | tem linha em `motoristas` | as próprias sessões, carteira e recibos; leitura do mapa |
| `CANDIDATO` | logado, sem organização, com solicitação enviada | as próprias solicitações |
| `TOTEM` | dispositivo TOTEM | o próprio ponto: vagas, sessões abertas, visitante |
| `AGENTE` | dispositivo AGENTE | os próprios pontos: estado das vagas, telemetria, comandos |

Uma pessoa pode ter mais de um papel (por exemplo, franqueado que também é motorista). O app pergunta qual painel abrir.

## Máquinas de estado

Toda transição passa por uma função do banco (seção de contratos), que confere quem pode, a pré-condição e grava o evento.

### Solicitação

| De | Para | Quem | Pré-condição | Efeito |
|---|---|---|---|---|
| (nova) | `ANALISE` | candidato | dados completos | score e fatores calculados e gravados com `versao_modelo` |
| `ANALISE` | `VISTORIA` | GoodWe admin | — | agenda vistoria (campo livre) |
| `ANALISE`, `VISTORIA` | `PENDENTE_DOC` | GoodWe admin | motivo | candidato vê o que falta |
| `PENDENTE_DOC` | `ANALISE` | candidato | reenvio | score recalculado |
| `ANALISE`, `VISTORIA` | `APROVADO` | GoodWe admin | — | cria a organização (ou usa a do candidato), o membro ADMIN, o ponto `PLANEJADO`, as vagas do formato, a regra de tarifa padrão e as contas do ponto |
| `ANALISE`, `VISTORIA`, `PENDENTE_DOC` | `REPROVADO` | GoodWe admin | motivo | — |

### Ponto

| De | Para | Quem | Pré-condição | Efeito |
|---|---|---|---|---|
| (aprovação) | `PLANEJADO` | sistema | solicitação aprovada | — |
| `PLANEJADO` | `INSTALACAO` | franqueado admin | primeiro salvamento do assistente | — |
| `INSTALACAO` | `ATIVO` | franqueado admin | lista de verificação: posição no mapa; entrada elétrica preenchida; agente com sinal há menos de 2 min; toda vaga com estado diferente de `OFFLINE`; totem pareado e com sinal; regra de tarifa vigente | aparece no mapa; `ativado_em` |
| `ATIVO` | `SUSPENSO` | GoodWe admin | motivo | sai do mapa; sessões em andamento terminam normalmente; novas sessões são recusadas |
| `SUSPENSO` | `ATIVO` | GoodWe admin | lista de verificação | volta ao mapa |
| `ATIVO`, `SUSPENSO` | `ENCERRADO` | GoodWe admin | nenhuma sessão em aberto; motivo | revoga os aparelhos; vagas em `MANUTENCAO` |

### Vaga (`carregadores.estado`)

Escrita só pelo agente, exceto `MANUTENCAO` (franqueado) e `OFFLINE` (tarefa agendada).

| De | Para | Gatilho | Observação |
|---|---|---|---|
| `DISPONIVEL` | `CONECTADO` | agente lê estado IEC A → B | o agente chama `abrir_sessao` |
| `DISPONIVEL` | `RESERVADO` | `reservar_vaga` pelo app (confere saldo) | expira em 5 min. A reserva vale por `reservado_para` e `reservado_ate`; o estado é só exibição, e o agente o substitui quando o cabo conecta |
| `RESERVADO` | `CONECTADO` | cabo conectado | a sessão nasce **reservada** para quem reservou. Essa pessoa confirma no app (`confirmar_reserva`); a sessão nunca autoriza sozinha, porque quem conectou pode ser outra pessoa |
| `CONECTADO` | `CARREGANDO` | comando INICIAR executado e corrente > 0 | se o carro não puxar corrente, a vaga vai para `SUSPENSO_EV` |
| `CONECTADO` | `DISPONIVEL` | cabo removido sem vínculo | sessão `EXPIRADA` |
| `CARREGANDO` | `PAUSADO` | demanda sem 6 A disponíveis | `motivo_pausa` |
| `PAUSADO` | `CARREGANDO` | folga voltou (histerese de 30 s) | — |
| `CARREGANDO` | `SUSPENSO_EV` | carro parou de puxar com o limite > 0: estado IEC C → B, **ou** corrente perto de zero por 60 s em C (muitos carros param em C) | bateria cheia ou carro programado. O agente conta os minutos parados **brutos**; só o banco desconta a tolerância |
| `SUSPENSO_EV` | `CARREGANDO` | carro voltou a puxar | — |
| `CARREGANDO`, `PAUSADO`, `SUSPENSO_EV` | `FINALIZADO` | comando PARAR executado | cabo ainda conectado |
| `FINALIZADO` | `DISPONIVEL` | cabo removido | — |
| qualquer | `FALHA` | agente lê estado IEC E/F ou erro do driver | alerta crítico |
| `FALHA` | `DISPONIVEL` | agente lê estado A sem erro | alerta resolvido |
| qualquer, exceto com sessão em aberto | `MANUTENCAO` | franqueado | some do mapa |
| `MANUTENCAO` | `DISPONIVEL` | franqueado | — |
| qualquer | `OFFLINE` | sem sinal do agente há mais de 2 min | tarefa agendada; alerta |
| `OFFLINE` | estado lido | sinal voltou | — |

### Sessão

| De | Para | Quem | Pré-condição | Efeito |
|---|---|---|---|---|
| (nova) | `ABERTA` | agente (`abrir_sessao`) | ponto `ATIVO`; vaga sem sessão em aberto | código de vínculo; preço cotado; `expira_em = +10 min` |
| `ABERTA` | `AUTORIZADA` | motorista (`vincular_sessao`, ou `confirmar_reserva` se a vaga era dele) | código válido; não reservada para outra pessoa; preço igual ao mostrado; saldo disponível ≥ saldo mínimo; limite > 0 | carteira travada durante a conta; preço travado; `limite_valor` = menor entre o saldo disponível e o limite escolhido; comando INICIAR com a regra de tarifa |
| `ABERTA` | `ABERTA` (visitante) | totem (`iniciar_visitante`) | vaga com sessão ABERTA | origem VISITANTE; código de vínculo anulado (ninguém mais vincula); validade estendida até a do Pix |
| `ABERTA` | `AUTORIZADA` | sistema, após Pix do visitante pago | pagamento confirmado e sessão ainda ABERTA (senão: devolução integral) | `limite_valor` = valor pago; comando INICIAR |
| `AUTORIZADA` | `CARREGANDO` | agente (`confirmar_comando`) | comando INICIAR executado, ou seja, vaga liberada | `inicio_carga`. Se o carro puxa corrente, a vaga é que mostra (`CARREGANDO` ou `SUSPENSO_EV`) |
| `AUTORIZADA` | `CANCELADA` | agente (INICIAR falhou) ou tarefa (INICIAR venceu) | — | motivo FALHA; alerta; visitante recebe a devolução integral |
| `CARREGANDO` | `PAUSADA` | agente | demanda | — |
| `PAUSADA` | `CARREGANDO` | agente | folga | — |
| `AUTORIZADA`, `CARREGANDO`, `PAUSADA` | `ENCERRADA` | agente (`registrar_fim_carga`) ou GoodWe suporte (`suporte_encerrar_sessao`, quando o agente não responde ao PARAR) | após PARAR, limite de valor atingido, cabo removido ou falha | cobrança, transação e lançamentos. Energia, taxa e tempo nunca passam do `limite_valor` |
| `ENCERRADA` | `PAGA` | sistema | carteira com saldo ≥ 0 depois do débito | — |
| `ENCERRADA` | `PENDENTE` | sistema | carteira negativa depois do débito; só a ociosidade pode passar do limite | bloqueia nova sessão do motorista (`PW011`) até quitar |
| `PENDENTE` | `PAGA` | sistema (`confirmar_pagamento`) | recarga de carteira deixa o saldo ≥ 0 | sessão e cobrança viram PAGA; alerta SESSAO_PENDENTE resolvido |
| `ABERTA` | `EXPIRADA` | tarefa agendada ou agente | 10 min sem vínculo (visitante: validade do Pix) ou cabo removido | vaga volta ao estado lido |
| `AUTORIZADA` | `CANCELADA` | agente | cabo removido antes de o INICIAR ser executado | visitante: devolução integral |

### Pagamento

`CRIADO` → `AGUARDANDO` (QR emitido) → `PAGO` | `EXPIRADO` | `FALHOU`; `PAGO` → `ESTORNADO` (total ou parcial, com valor).

### Comando

`PENDENTE` → `ENTREGUE` (agente recebeu) → `EXECUTADO` | `FALHOU`; `PENDENTE`/`ENTREGUE` → `EXPIRADO` após 30 s sem confirmação.

### Alerta

`ABERTO` → `EM_ANDAMENTO` (alguém assumiu) → `RESOLVIDO` (manual ou automático quando a condição some).

### Fechamento

`ABERTO` (mês corrente, recalculável) → `FECHADO` (congelado no dia 1) → `QUITADO` (repasse e royalties lançados).

## Invariantes

1. Uma vaga tem no máximo **uma** sessão em aberto (`ABERTA`, `AUTORIZADA`, `CARREGANDO`, `PAUSADA`). Garantido por índice único parcial.
2. O código de vínculo é único entre sessões `ABERTA`.
3. `tarifa_kwh`, `regra_tarifa_id` e `parametros_id` da sessão não mudam depois de `AUTORIZADA`.
4. Lançamentos e eventos nunca são alterados nem apagados.
5. A soma dos lançamentos de cada transação é zero.
6. Saldo disponível da carteira = saldo − soma dos `limite_valor` das sessões em aberto daquela carteira.
7. Nenhum aparelho e nenhuma tela grava direto em `sessoes`, `cobrancas`, `pagamentos`, `transacoes`, `lancamentos` ou `eventos`; tudo passa por função.
8. Corrente liberada para uma vaga é 0 (pausa) ou fica entre 6 A e o máximo do modelo.
9. As funções do agente (abrir, medir, encerrar, comandos) recusam o totem. O totem fica num lugar público e só lê e cria a sessão do visitante.
10. Na carteira do app, o débito de energia, taxa e tempo é limitado ao `limite_valor` autorizado. A ociosidade é a única parte que pode deixar a carteira negativa.

## Tempos

| O quê | Valor | Onde muda |
|---|---|---|
| Ciclo do agente | 2 s | config do agente |
| Telemetria ao vivo | 5 s | config do agente |
| Gravação de telemetria e sessão | 30 s | config do agente |
| Gravação da leitura da entrada elétrica | 5 min | config do agente |
| Carro "parou de puxar" em estado C | corrente perto de zero por 60 s | config do agente |
| Sinal de vida | 30 s | config do agente |
| Aparelho considerado offline | 2 min sem sinal | `parametros_rede` |
| Sessão aberta sem vínculo | 10 min | `parametros_rede` |
| Reserva pelo app | 5 min | `parametros_rede` |
| Validade do código de pareamento | 10 min | `parametros_rede` |
| Validade de comando | 30 s | `parametros_rede` |
| Histerese de retomada | 30 s com folga ≥ 8 A | config do agente |
| Retenção de telemetria bruta | 30 dias | `parametros_rede` |
