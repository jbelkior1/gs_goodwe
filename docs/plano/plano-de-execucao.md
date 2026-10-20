# Plano de execução

Ordem fechada para implementar a arquitetura de [docs/arquitetura](../arquitetura/README.md). Cada fase vira uma branch (`fase/f0-fundacao`, `fase/f1-concessao`...) e um PR. O site só muda no merge (pergunta Q4). Tamanho relativo: **P** (até meio dia), **M** (um dia), **G** (dois dias ou mais).

**Antes de começar:** responder as perguntas bloqueantes de [perguntas.md](../arquitetura/perguntas.md) (Q1 a Q6).

---

## F0 · Fundação

| ID | Tarefa | Arquivos | Depende | Tam. | Pronto quando |
|---|---|---|---|---|---|
| F0.1 | Ferramentas: Vitest, scripts `test` e `typecheck`, `ci.yml` (lint, tipos, testes) | `package.json`, `.github/workflows/ci.yml`, `vitest.config.ts` | — | P | CI verde num PR vazio |
| F0.2 | Corrigir motores com teste: homologação com a potência do modelo; Volt por palavra inteira e texto do conector (Tipo 2 AC); `server.js` responde 400 a URL malformada; seed independente do relógio | `src/domain/engine/ia.ts`, `assistente.ts`, `server.js`, `src/domain/seed.ts` | F0.1 | M | testes cobrindo os casos de 15/10 passam |
| F0.3 | `supabase init`; migration 0001: enums, catálogos, organizações, membros, motoristas, parâmetros, solicitações, pontos, regras de tarifa, vagas, aparelhos, códigos | `supabase/migrations/…_0001_base.sql` | Q2 | M | `supabase db reset` sobe sem erro |
| F0.4 | Migration 0002: contas, transações, lançamentos (soma zero, imutável), sessões, telemetria, leituras, comandos, cobranças, pagamentos, fechamentos, eventos, alertas, publicação de tempo real | `…_0002_operacao.sql` | F0.3 | M | teste pgTAP de soma zero e de imutabilidade |
| F0.5 | Migration 0003: funções de papel, RLS e grants | `…_0003_rls.sql` | F0.4 | M | testes pgTAP de acesso por papel passam; **revisor** |
| F0.6 | Migration 0004: contexto, `registrar_evento` e gatilhos de evento | `…_0004_eventos.sql` | F0.5 | M | mudança de estado gera evento com ator e origem |
| F0.7 | Migration 0005: `calcular_tarifa`, `repartir`, utilitários do livro-caixa, views dos painéis | `…_0005_regras.sql` | F0.6 | M | contrato TS × SQL com fixtures passa |
| F0.8 | Seed: `gerar.ts`, `carregar.ts`, `limpar.ts`; rede de demonstração e contas demo | `scripts/seed/` | F0.7 | G | banco com 16 pontos e 90 dias; saldos fecham |
| F0.9 | `src/data`: cliente, tipos gerados, `ProvedorPerfil`, guarda de rota, login e cadastro de motorista | `src/data/`, `src/pages/entrar/` | F0.8 | M | entrar com cada conta demo leva ao painel certo |
| F0.10 | Migrar `/goodwe` (Visão) e `/franqueado` (Painel) para as views | páginas correspondentes | F0.9 | M | mesma ordem de grandeza de hoje (os números mudam um pouco porque o seed corrigido muda a sequência de sorteios); conferidos contra o banco |

**Demonstração do F0:** entrar como GoodWe e ver a rede vinda do banco; entrar como franqueado e ver só o próprio ponto.

---

## F1 · Concessão e ciclo de vida do ponto

| ID | Tarefa | Depende | Tam. | Pronto quando |
|---|---|---|---|---|
| F1.1 | `/seja-goodwe`: formulário, `enviar_solicitacao` com `score_viabilidade` em SQL, acompanhamento | F0 | M | solicitação aparece com score e fatores |
| F1.2 | Homologação real: fila, detalhe, `decidir_solicitacao` (aprova → organização, membro, ponto, vagas, tarifa, conta) | F1.1 | M | aprovar cria o ponto PLANEJADO visível ao novo franqueado |
| F1.3 | Assistente de instalação (local no mapa, entrada elétrica, solar, vagas, tarifa com prévia, horário) | F1.2 | G | ponto passa a INSTALACAO com tudo preenchido |
| F1.4 | Pareamento: `gerar_codigo_pareamento`, `consumir_codigo_pareamento` (só service_role), Edge Functions `parear-dispositivo` e `revogar-dispositivo`, tela de pareamento do totem, **`dispositivo_sinal`** (totem e agente), `pontow-agente parear` (esqueleto que manda sinal e tira as vagas de OFFLINE) | F1.3 | M | totem e agente aparecem online em `/franqueado/aparelhos`; vagas saem de OFFLINE |
| F1.5 | `checklist_ativacao`, `mudar_status_ponto`; GoodWe: pontos por status, suspender e reativar com motivo | F1.4 | M | ativar só com tudo verde; suspender tira do mapa |
| F1.6 | Mapa do motorista (`listar_pontos_mapa`, `MapaRede`) e detalhe do ponto (`cotar_preco`) | F1.5 | M | ponto ativado aparece no mapa com preço e vagas |
| F1.7 | `linha_do_tempo` e tela da linha do tempo do ponto | F1.5 | P | todos os passos da F1 aparecem com autor e horário |

**Demonstração do F1:** comerciante pede a franquia → GoodWe aprova → franqueado configura e pareia → ativa → o ponto aparece no mapa do celular.

---

## F2 · Agente simulado e operação ao vivo

| ID | Tarefa | Depende | Tam. | Pronto quando |
|---|---|---|---|---|
| F2.1 | Pacote `agente/`: CLI, config, cliente com identidade, sinal de vida, assinatura de comandos, fila offline | F1.4 | M | agente roda, reconecta e não perde dados ao cair a rede |
| F2.2 | Drivers simulados: vaga, carro, entrada; física de [04-agente.md](../arquitetura/04-agente.md) | F2.1 | M | testes de física (7, 11, 22 kW; queda acima de 80%) passam |
| F2.3 | Motor de demanda em ampères (substitui `calcularDemanda`) | F0.2 | M | testes obrigatórios de demanda passam |
| F2.4 | Ciclo do ponto: transições, `abrir_sessao`, `registrar_desconexao`, `agente_atualizar_vagas`, `confirmar_comando` | F2.2, F2.3 | G | conectar um carro simulado abre sessão com código |
| F2.5 | Telemetria: Broadcast a 5 s, `registrar_medicao` a 30 s, leituras da entrada | F2.4 | M | tela recebe amostra a cada 5 s; banco a cada 30 s |
| F2.6 | Bancada de simulação (`/franqueado/simulador`, `sim_comando`) | F2.4 | M | conectar, desconectar, céu e carga do comércio pela tela |
| F2.7 | Tarefas agendadas: expirações, offline, alertas; `assumir_alerta` e `resolver_alerta`; telas de alertas | F2.4 | M | desligar o agente gera alerta em até 2 min, e ele se resolve ao religar |
| F2.8 | Totem: tela de vagas ao vivo; franqueado: vagas e demanda ao vivo | F2.5 | M | vaga muda de estado no totem e no painel em até 3 s |
| F2.9 | Modo simulador de todos os pontos; tráfego sintético opcional (`sim_autorizar_demo`) | F2.5 | M | pontos demo com chegadas pela curva de demanda |

**Demonstração do F2:** na bancada, "conectar um Dolphin com 30% na vaga 2" → o totem mostra a vaga conectada com o código; o painel do franqueado mostra a entrada elétrica e o limite da vaga.

---

## F3 · Recarga ponta a ponta

| ID | Tarefa | Depende | Tam. | Pronto quando |
|---|---|---|---|---|
| F3.1 | Totem: QR local (`qrcode`) e código na vaga ABERTA, com tempo restante | F2.8 | P | QR lido pela câmera abre o link certo |
| F3.2 | `/motorista/vincular`: confirmação pela `previa_vinculo` (preço, vaga, saldo), bateria e limite; `vincular_sessao` com `PW012` e `PW015` | F3.1 | M | sessão AUTORIZADA e comando INICIAR emitido com a regra completa |
| F3.3 | `useSessaoAoVivo` e a tela de recarga ao vivo no app, no totem e no painel | F3.2 | M | os três mostram os mesmos números |
| F3.4 | `solicitar_encerramento` (app, totem, painel); `registrar_fim_carga`; recibo | F3.3 | M | cobrança e lançamentos fecham; recibo nos três |
| F3.5 | Adaptador de pagamento, `pagamento-criar` e `pagamento-webhook` (simulado), BR Code de demonstração | F0 | M | Pix simulado confirma pelo webhook, sem repetir |
| F3.6 | Carteira: saldo, recarregar, extrato (`v_extrato`); `PW004` e `PW011` com ação na tela | F3.5 | M | recarregar R$ 50 e ver no extrato |
| F3.7 | Visitante no totem: valor, Pix, autorização, devolução da sobra | F3.5, F3.4 | M | visitante paga R$ 30, usa R$ 22,40 e recebe R$ 7,60 de volta |
| F3.8 | Começar pelo app: QR fixo da vaga, `reservar_vaga` (5 min, confere saldo), `confirmar_reserva`; `sessao_totem` para o nome e o recibo no totem | F3.2 | P | ao conectar o cabo, só quem reservou consegue confirmar |
| F3.9 | Volt com a sessão real (contexto do `useSessaoAoVivo`) | F3.3 | P | respostas com números da sessão em andamento |
| F3.10 | Linha do tempo da sessão (franqueado e suporte); ensaio do roteiro com celular real | F3.4 | P | roteiro completo sem intervenção manual |

**Demonstração do F3 (roteiro do pitch):** conectar o carro na bancada → o totem mostra o QR → um celular de verdade lê → confirma o preço → a recarga aparece no celular, no totem e no painel → controle de demanda reduz a corrente quando a segunda vaga conecta → encerrar no celular → recibo → extrato do franqueado e royalties da GoodWe atualizados.

---

## F4 · Gestão e números

| ID | Tarefa | Depende | Tam. |
|---|---|---|---|
| F4.1 | Painéis do franqueado (painel, financeiro com extrato) e da GoodWe (rede, royalties) sobre as views; remover `db.ts` | F3 | G |
| F4.2 | `fechar_mes`, `quitar_fechamento`, telas de fechamento, exportação em CSV | F4.1 | M |
| F4.3 | Suporte: `buscar_suporte`, `suporte_encerrar_sessao`, `estornar_cobranca`, reenviar Pix | F3 | M |
| F4.4 | Equipe: `convidar-membro`, papéis, operador sem financeiro | F0 | M |
| F4.5 | Parâmetros da rede e catálogo com histórico (`atualizar_parametros`) | F0 | M |
| F4.6 | Conciliação diária e alertas financeiros | F4.2 | P |
| F4.7 | IA sobre o histórico real: previsão (`v_perfil_horario`), recomendações, alerta `ABAIXO_DO_LIMIAR`, score com versão | F4.1 | M |
| F4.8 | Histórico e recibos do motorista | F3 | P |
| F4.9 | Backup semanal do banco | Q2 | P |

**Demonstração do F4:** a GoodWe fecha o mês de um franqueado; cada valor do fechamento abre os lançamentos e as recargas que o formaram.

---

## F5 · Rumo ao mercado (se houver tempo e CNPJ)

- Adaptador Asaas no ambiente de teste, com split por `walletId` em valor fixo; produção depois de CNPJ e definição fiscal.
- App instalável no celular (PWA).
- Pós-pago para frotas.
- Endurecer segurança: os riscos aceitos em [08](../arquitetura/08-qualidade-e-ambientes.md), limites de tentativa, LGPD.
- Driver de hardware real, quando a GoodWe liberar a integração.

---

## Caminho crítico

`F0.3 → F0.4 → F0.5 → F0.6 → F0.7 → F0.8 → F0.9 → F1.2 → F1.3 → F1.4 → F2.1 → F2.4 → F2.5 → F3.1 → F3.2 → F3.3 → F3.4`

Em paralelo ao caminho crítico:
- **Motores (F0.2, F2.3):** são TypeScript puro.
- **Pagamento (F3.5, F3.6):** só depende da F0.
- **Bancada de simulação (F2.6).**

Se o prazo apertar, o corte é na F4 e na F5: o pitch fecha com F0 a F3.
