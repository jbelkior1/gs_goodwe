# 05 · Telas, rotas e camada de dados

Decisão: [ADR-0012](../adr/0012-camada-de-dados-do-front.md). O visual atual (`src/styles.css`, `src/ui/kit.tsx`) continua; muda a origem dos dados e entram as telas que faltam.

## Entrada e login

| Rota | Tela | Status |
|---|---|---|
| `/` | Portal: escolha do painel. No modo demonstração (`VITE_MODO_DEMO=true`), botões "entrar como" para as contas de demonstração (pergunta Q13) | ajustada |
| `/entrar`, `/cadastro` | Login por e-mail e senha; cadastro simples (nome, e-mail, senha). O perfil de motorista (veículo) é pedido na primeira vez que a pessoa usa o app do motorista; o comerciante que vai pedir a franquia não precisa de veículo | nova |
| `/seja-goodwe` | Pedido de franquia (formulário da solicitação, exige login) | substitui a tela "Seja Goodwe!!" |
| `/seja-goodwe/acompanhar` | Situação das minhas solicitações | nova |

Guarda de rota: `<RotaDoPapel papel="FRANQUEADO_ADMIN">` lê `meu_perfil()`. Sem o papel, leva ao login ou à escolha de painel. Quem tem mais de um papel escolhe no portal.

## Motorista (celular, moldura de celular no desktop)

| Rota | Tela | Dados | Tempo real |
|---|---|---|---|
| `/motorista` | **Mapa e lista** de pontos ativos (componente `MapaRede` volta), vagas livres, preço agora | `listar_pontos_mapa` | `carregadores` dos pontos visíveis |
| `/motorista/ponto/:id` | Detalhe: vagas, potência, preço por horário, como carregar | `cotar_preco`, vagas | `carregadores` do ponto |
| `/motorista/vincular?c=XXXX` | **Confirmação** (destino do QR): ponto, vaga, preço, bateria atual (opcional), limite em R$ (opcional), saldo | `previa_vinculo(codigo)`: o preço mostrado é o `p_tarifa_vista` do `vincular_sessao` | — |
| (cartão no app) | **Reserva conectada**: "seu carro conectou na Vaga 2, confirmar?" | `confirmar_reserva` | `sessoes` com `reservada_para=eq.<eu>` |
| `/motorista/recarga/:sessaoId` | **Recarga ao vivo**: kW, kWh, R$, tempo, bateria estimada, motivo de pausa, encerrar | sessão | `sessoes` id + Broadcast `telemetria:<ponto>` |
| `/motorista/recibo/:sessaoId` | Recibo com a composição e a repartição | cobrança | — |
| `/motorista/carteira` | Saldo, recarregar (Pix), extrato | `v_extrato`, `pagamento-criar` | `pagamentos` id |
| `/motorista/historico` | Recargas e recibos | sessões, cobranças | — |
| `/motorista/conta` | Dados e veículo | `motoristas` | — |
| `/motorista/assistente` | Volt com a sessão real | sessão ativa | Broadcast |

## Totem (moldura de totem 1080 × 1920 no desktop)

| Rota | Tela | Observação |
|---|---|---|
| `/totem` sem pareamento | **Pareamento**: campo de 6 dígitos | grava a sessão do usuário técnico no navegador |
| `/totem` pareado | **Vagas**: um cartão por vaga com o estado ao vivo; aviso de manutenção e de sem conexão | `carregadores` e `sessoes` do ponto |
| `/totem/vaga/:numero` com sessão ABERTA | **QR + código** de 4 caracteres, preço agora, "Carregar sem app" | QR gerado localmente (`qrcode`), tempo restante do código |
| `/totem/vaga/:numero` visitante | Escolha do valor (R$ 20 / 30 / 50 / outro), Pix, aguardando pagamento | `iniciar_visitante` + `pagamento-criar`; `pagamentos` id |
| `/totem/vaga/:numero` em carga | **Recarga ao vivo**: "Olá, Ana", kW, kWh, R$, curva, encerrar, Volt | Broadcast + `sessoes`; o nome vem de `sessao_totem` (o totem não lê `motoristas`) |
| `/totem/vaga/:numero` encerrada | Recibo e "pode desconectar" | `sessao_totem` (o totem não lê `cobrancas`) |

O totem atual (`src/pages/totem/Totem.tsx`) vira a tela de recarga ao vivo de uma vaga; a simulação local de potência (até 34 kW) é removida.

## Franqueado

| Rota | Tela | Papel |
|---|---|---|
| `/franqueado` | Painel: faturamento, energia, uso/dia, payback, resumo da IA | admin (`v_kpis_ponto_mes`); operador vê só uso e energia (`v_uso_ponto_mes`, sem valores) |
| `/franqueado/instalacao` | **Assistente de instalação** (passos: local, entrada elétrica, solar, vagas, tarifa, horário, aparelhos, ativação) | admin |
| `/franqueado/vagas` | Vagas ao vivo, manutenção, QR fixo para imprimir | admin, operador |
| `/franqueado/sessoes` e `/:id` | Sessões ao vivo e histórico; encerrar à distância; **linha do tempo** | admin, operador |
| `/franqueado/demanda` | Controle de demanda ao vivo (entrada, comércio, sol, limite por vaga) | admin, operador |
| `/franqueado/tarifa` | Regra vigente, prévia por horário, nova versão com vigência | admin |
| `/franqueado/financeiro` | Extrato do recebível, cobranças, fechamentos | admin |
| `/franqueado/equipe` | Membros e convites (F4) | admin |
| `/franqueado/aparelhos` | Totens e agentes: online, versão, gerar código, revogar | admin |
| `/franqueado/alertas` | Alertas do ponto | admin, operador |
| `/franqueado/simulador` | **Bancada de simulação** (só ponto simulado): conectar carro (modelo e bateria), desconectar, carga do comércio, céu, falha | admin |

## GoodWe

| Rota | Tela |
|---|---|
| `/goodwe` | Visão da rede (KPIs, regiões, ranking, solar) sobre `v_kpis_rede` |
| `/goodwe/homologacao` | Fila de solicitações com score, fatores e parecer; aprovar, reprovar, vistoria, pedir documentos |
| `/goodwe/pontos` e `/:id` | Pontos por status; suspender, reativar, encerrar; linha do tempo |
| `/goodwe/organizacoes` | Franqueados e usuários |
| `/goodwe/aparelhos` | Todos os aparelhos e o último sinal |
| `/goodwe/parametros` | Parâmetros da rede com histórico de versões |
| `/goodwe/catalogo` | Modelos de carregador, veículos, formatos, regiões |
| `/goodwe/financeiro` | Royalties e fundo por mês; fechamentos; quitar |
| `/goodwe/alertas` | Central de alertas da rede |
| `/goodwe/suporte` e `/sessao/:id` | Busca, linha do tempo, encerrar sessão travada, estornar, reenviar Pix |

## Camada `src/data`

```
src/data/
  cliente.ts          createClient(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)
  tipos.gerados.ts    saída de `supabase gen types typescript`
  perfil.tsx          ProvedorPerfil + usePerfil(): papéis, organizações, pontos, dispositivo
  consultas.ts        QueryClient (TanStack Query) e chaves padronizadas
  tempo-real.ts       useCanalTabela(tabela, filtro, aoMudar) e useTelemetria(pontoId)
  hooks/
    usePontosMapa.ts  useVagasDoPonto.ts  useSessaoAoVivo.ts  useCotacao.ts
    useCarteira.ts    useExtrato.ts       useKpisPonto.ts     useSerieDiaria.ts
    useSolicitacoes.ts useAlertas.ts      useLinhaDoTempo.ts  useFechamentos.ts
  acoes.ts            mutações: vincularSessao, encerrar, iniciarVisitante, recarregarCarteira...
  erros.ts            tradução de PWnnn para mensagem e ação (ver 03-contratos)
```

**Regras:**
- Tela nunca chama `supabase` direto: usa hook ou ação.
- Toda tela tem estado de carregando, vazio e erro.
- O Realtime **invalida** a consulta do TanStack Query, e a consulta busca de novo. A telemetria é exceção: vai direto para o estado local da tela, que suaviza a curva entre amostras.
- O `useSessaoAoVivo(id)` junta a linha da sessão (a cada transição e a cada 30 s) e a telemetria (a cada 5 s). A bateria estimada é calculada no hook (ADR-0011).
- Os motores puros continuam em `src/domain/engine` e recebem dados já buscados (previsão, recomendações, Volt, prévias de tarifa).
- `src/domain/db.ts` e `seed.ts` saem do app quando a última tela migrar. O `seed.ts` vai para `scripts/seed/`.
- `src/app/estado.tsx` perde `pontoId` e `tick` fixos: o ponto selecionado vem do perfil, e a página atualiza pelo tempo real.

## Bibliotecas novas (versões a confirmar na implementação)

| Pacote | Para quê |
|---|---|
| `@supabase/supabase-js` (v2) | banco, login, tempo real |
| `@tanstack/react-query` (v5) | cache e estado das consultas |
| `qrcode` | QR do totem e do adesivo, sem serviço externo |
| `vitest` | testes |
| `tsx` (já existe) | rodar o agente e os scripts |
