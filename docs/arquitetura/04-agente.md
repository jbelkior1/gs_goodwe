# 04 · Agente do ponto e simulador

Decisões: [ADR-0002](../adr/0002-agente-do-ponto-com-driver.md), [ADR-0009](../adr/0009-telemetria-5s-30s.md), [ADR-0010](../adr/0010-identidade-de-aparelho.md), [ADR-0011](../adr/0011-bateria-estimada-em-ac.md).

## O que é

Um programa Node + TypeScript em `agente/`. Para cada ponto que atende, ele faz o papel das vagas e do medidor da entrada elétrica, aplica o controle de demanda e conversa com a plataforma. Hoje todas as vagas são **simuladas**. O hardware real entra escrevendo um novo driver, sem mexer no resto.

## Estrutura

```
agente/
  package.json            scripts: parear, rodar, simulador (roda com tsx)
  src/
    cli.ts                comandos de linha: parear | rodar | simulador
    config.ts             leitura de variáveis e arquivo de credenciais
    plataforma/
      cliente.ts          supabase-js com a identidade do aparelho
      rpc.ts              dispositivo_sinal, abrir_sessao, receber_comandos, confirmar_comando,
                          agente_atualizar_vagas, registrar_medicao, registrar_fim_carga...
      comandos.ts         aviso pelo Realtime + varredura com receber_comandos; confirmação; expiração
      telemetria.ts       canal telemetria:<ponto> com Presence (só transmite se houver tela olhando)
      fila-offline.ts     fila em arquivo (JSON por linha) e reenvio em ordem
    ponto/
      ciclo.ts            o laço de 2 s de um ponto
      transicoes.ts       leitura → eventos (cabo conectado, carro parou, cabo removido, falha)
      sessao-local.ts     sessão em andamento: energia, custo estimado, limite de valor, minutos parados
    demanda/              usa src/domain/engine/demanda.ts (motor puro, compartilhado com o app)
    drivers/
      tipos.ts            interfaces DriverVaga e DriverEntrada
      simulado/vaga.ts    física da vaga
      simulado/carro.ts   carro simulado (capacidade, carregador de bordo, bateria real oculta)
      simulado/entrada.ts carga do comércio, sol e bateria do ponto
      simulado/trafego.ts chegadas aleatórias pela curva de demanda (opcional, só demo)
      modbus-hca.ts       esqueleto, lança "não implementado"
```

O agente importa `src/domain/engine/*` direto (TypeScript puro, sem React), o que mantém um motor de demanda só para o app e para o agente.

## Interfaces de driver

```ts
export type EstadoIEC = 'A' | 'B' | 'C' | 'E' | 'F';   // A sem carro, B conectado, C carregando; E/F erro
                                                        // (F é gerado pelo próprio carregador)
export type Ligacao = 'L1-N' | 'L2-N' | 'L3-N' | 'L1-L2' | 'L2-L3' | 'L1-L3' | 'L1-L2-L3';

export interface LeituraVaga {
  iec: EstadoIEC;
  correnteA: number;          // corrente em cada condutor de fase usado pela vaga
  tensaoV: number;            // tensão aplicada ao carregador (ver "Rede elétrica")
  ligacao: Ligacao;           // de carregadores.ligacao
  potenciaKW: number;
  energiaSessaoKWh: number;   // acumulada desde autorizar()
  falha?: string;
}

export interface DriverVaga {
  readonly vagaId: string;
  ler(): Promise<LeituraVaga>;
  autorizar(): Promise<void>;             // libera a carga
  interromper(): Promise<void>;           // encerra a carga (o cabo pode continuar conectado)
  limitarCorrente(a: number): Promise<void>;   // 0 = pausa; senão entre 6 A e o máximo do modelo
}

export interface LeituraEntrada {
  cargaComercioKW: number;
  solarKW: number;
  bateriaKW: number;          // + descarregando, − carregando
  importacaoKW: number;       // o que passa pelo disjuntor (líquido)
  correntePorFaseA: number[]; // L1, L2, L3 (ou só L1), já incluindo a recarga
}

export interface DriverEntrada {
  ler(): Promise<LeituraEntrada>;
}
```

## Rede elétrica

O Brasil tem duas redes de baixa tensão. O ponto guarda as duas tensões (`tensao_fn_v`, `tensao_ff_v`) e cada vaga guarda a ligação.

| Rede | Onde (exemplos) | Carregador "monofásico" (7 kW) | Trifásico de 11 kW (16 A) | Trifásico de 22 kW (32 A) |
|---|---|---|---|---|
| **127/220 V** | Enel SP, Light, CEMIG, Copel, CPFL | ligado entre **duas fases** (`L1-L2`) a 220 V: 32 A em L1 e em L2, ~7,0 kW | 220 V entre fases: √3 × 220 × 16 ≈ **6,1 kW** | √3 × 220 × 32 ≈ **12,2 kW** |
| **220/380 V** | DF, parte do Nordeste e do Sul | fase-neutro (`L1-N`) a 220 V: 32 A em L1, ~7,0 kW | √3 × 380 × 16 ≈ **10,5 kW** | √3 × 380 × 32 ≈ **21,1 kW** |

O formato **Hub** (4 × GW11K) entrega bem menos numa rede 127/220. O score de viabilidade e o assistente de instalação usam a potência **efetiva** da rede do ponto, não a nominal.

## O ciclo de um ponto (a cada 2 s)

1. `ler()` em cada vaga e na entrada.
2. **Transições** comparando com a leitura anterior:
   - **A → B sem sessão em aberto:** `abrir_sessao(vaga, conexaoId)`. O agente gera o `conexaoId` e guarda localmente, para repetir com segurança.
   - **B → A antes de autorizar:** `registrar_desconexao`.
   - **Carro parou de puxar com limite > 0:** vaga `SUSPENSO_EV`. Vale tanto C → B quanto corrente perto de zero por 60 s ainda em C, porque muitos carros param assim. O agente conta os minutos parados **brutos**; a tolerância só é descontada no banco.
   - **Cabo removido com sessão em carga:** `interromper()` e `registrar_fim_carga(..., 'CABO_REMOVIDO', horaDoFim)`.
   - **E/F:** vaga `FALHA`. Se havia sessão, encerra com `FALHA`.
3. **Comandos:**
   - O aviso do Realtime (ou uma varredura a cada 10 s) dispara `receber_comandos`, que marca ENTREGUE.
   - `INICIAR`: chama `autorizar()`, guarda limite, tarifa e regra (vêm no comando) e confirma.
   - `PARAR`: chama `interromper()`, faz `registrar_fim_carga` com a energia lida e a hora real do fim, e confirma.
   - `LIMITAR`: aplica um teto manual na vaga.
   - `SIM_*`: só no driver simulado.
   - Se `confirmar_comando` responder "vencido", o agente desfaz a ação.
4. **Limite de valor:** o custo estimado da sessão é `energia × tarifa + taxa + minutos × preço/min + ociosidade após tolerância`, a mesma conta do banco. Quando ele chega ao `limite_valor`, o agente para com `LIMITE_VALOR`. O banco também limita o débito ao valor autorizado, então o atraso de um ciclo não vira cobrança extra.
5. **Controle de demanda** (abaixo): calcula o limite de cada vaga, aplica com `limitarCorrente` só onde mudou e manda em lote **só as mudanças de estado ou de limite** (`agente_atualizar_vagas`).
6. **Envios periódicos:**

   | O quê | Frequência | Quando |
   |---|---|---|
   | Broadcast da `amostra` (por sessão ativa) | 5 s | só se houver tela presente no canal |
   | Broadcast da `entrada` | 10 s | só se houver tela presente no canal |
   | `registrar_medicao` com as amostras | 30 s | sempre |
   | `registrar_medicao` com a leitura da entrada | 5 min | sempre |
   | `dispositivo_sinal` | 30 s | sempre |

Se uma chamada falhar por rede, ela vai para a **fila offline**. A exceção é `abrir_sessao`, que precisa da resposta para mostrar o código. A fila reenvia em ordem quando a conexão volta, e o fim de carga leva a hora real.

Sem conexão:
- a carga em andamento continua com a tarifa já travada;
- nenhuma sessão nova é aberta;
- o totem mostra "sem conexão".

## Controle de demanda em ampères

Substitui `calcularDemanda` em `src/domain/engine/demanda.ts`. O motor atual distribui kW, ignora o solar e não respeita 6 A.

**Entrada:**
- **Disjuntor:** `limiteA` por fase.
- **Margem:** 0,92.
- **Corrente medida por fase sem a recarga:** `base[f] = correntePorFase[f] − recarga[f]`. Ela pode ser negativa quando o sol gera mais que o comércio consome, e isso libera corrente para a recarga.
- **Vagas ativas:** com sessão `AUTORIZADA`, `CARREGANDO`, `PAUSADA` ou `SUSPENSO_EV`. Cada uma informa:
  - **as fases que usa**, pela ligação: `L1-N` usa L1; `L1-L2` usa L1 e L2; trifásico usa as três;
  - **`pedidoA`:** o máximo do modelo, limitado pelo carregador de bordo do veículo informado. Só baixa para o "máximo observado" quando o carro puxa visivelmente menos que o limite dado (abaixo de 80% do limite) por 30 s. Ele é reavaliado sempre que o limite sobe, porque um carro que recebeu só 6 A naturalmente só puxa 6 A;
  - **prioridade:** primeiro quem está pausado há mais tempo (justiça), depois a menor bateria estimada (quando informada), depois a chegada mais antiga.

**Algoritmo:**
```
disponivel[f] = limiteA × margem − base[f]                 (para cada fase f)
rodada 1: para cada vaga, em ordem de prioridade
   se disponivel[f] ≥ 6 em todas as fases que a vaga usa
       aloca 6 A; disponivel[f] −= 6 nessas fases
   senão
       vaga pausada (limite 0, motivo "sem 6 A disponíveis na entrada")
rodada 2: enquanto sobrar corrente e alguma vaga ativa não estiver no pedido
   percorre as vagas ativas em ordem de prioridade, +1 A por vez,
   respeitando disponivel[f] em todas as fases da vaga e o pedidoA
saída: limite em A por vaga (0 ou de 6 até o pedido)
```

**Histerese e segurança:**
- Reduções valem na hora; aumentos, no máximo a cada 10 s por vaga.
- Uma vaga pausada só volta quando a folga passa de 8 A (6 A + 2 A de margem) por 30 s seguidos.
- **Emergência:** se a corrente medida passar de `limiteA` em qualquer fase, todas as vagas descem para 6 A no mesmo ciclo e a de menor prioridade pausa.
- Quando houver hardware, o controle dinâmico nativo do carregador continua ligado como última proteção do disjuntor.

**Testes obrigatórios:**
- nunca passa do limite em nenhuma fase;
- nunca entrega entre 0 e 6 A;
- o sol libera corrente;
- vaga `L1-L2` consome de L1 e de L2;
- vaga `L1-N` só de L1;
- a histerese não deixa ligar e desligar;
- quem está pausado há mais tempo volta primeiro;
- carro limitado a 6 A volta a receber mais quando sobra corrente (o pedido não trava para baixo).

## Física do simulador

Cada carro simulado tem:
- `capacidadeKWh`;
- `obcKW` e `fasesObc` (carregador de bordo);
- `socReal`, que fica escondido do sistema (ADR-0011).

A cada ciclo de `Δt = 2 s × aceleração`:

```
V             = tensão da ligação: fase-neutro (L1-N) ou fase-fase (L1-L2) para monofásico;
                fase-fase para trifásico (com √3)
iMaxCarro     = obcKW × 1000 / (V × (trifásico ? √3 : 1))
iOferta       = min(limite alocado, corrente máxima do modelo)
taper         = socReal ≤ 80 ? 1 : max(0,12; 1 − (socReal − 80) / 20 × 0,88)   (o mesmo de hoje)
i             = socReal ≥ 100 ? 0 : min(iOferta, iMaxCarro) × taper
tensao        = V × (1 ± 1% de ruído)
potenciaKW    = tensao × i × (trifásico ? √3 : 1) / 1000
energia      += potenciaKW × Δt_horas
socReal      += potenciaKW × Δt_horas × 0,92 / capacidadeKWh × 100
iec           = sem carro ? A : (i > 0 ? C : B)
```

A tabela "Rede elétrica" acima confere as potências. O totem deixa de mostrar valores impossíveis (os 34 kW de hoje).

**Entrada simulada:**

| Componente | Como é calculado |
|---|---|
| Carga do comércio | `carga_base_kw × perfil da hora` (a curva de `cargaComercioNaHora`), distribuída pelas fases |
| Solar | `potencia_fv_kwp × CURVA_SOLAR_HORA × 0,78 × fator do céu` (o `SIM_SOL` muda o fator do céu) |
| Bateria do ponto | conforme `mixDoDia` |
| Corrente por fase | carga do comércio + recarga − solar − bateria, em cada fase |

**Tráfego sintético** (opcional, só pontos `demo`):
- Chegadas por processo de Poisson, com taxa proporcional a `CURVA_DEMANDA_HORA` e à qualidade do ponto.
- O carro chega e conecta (`SIM_CONECTAR` interno). Como não há celular, `sim_autorizar_demo` autoriza com um motorista **sorteado de um conjunto** de demonstração e um **limite fixo** (por exemplo, R$ 60).
- Uma tarefa diária repõe o saldo dessas carteiras.
- Essas sessões não fazem Broadcast se ninguém estiver olhando, então não gastam a cota de mensagens.

**Aceleração:** padrão 1×; para a apresentação, 10× (configurável por ponto). A tarifa por hora usa o horário real, não o acelerado.

## Comandos de linha

```
pontow-agente parear <codigo> [--nome "Agente do Café Aurora"]
    → chama a Edge Function parear-dispositivo e grava as credenciais em ~/.pontow-agente/credenciais.json

pontow-agente rodar [--ponto <id>]
    → roda o ciclo dos pontos pareados

pontow-agente simulador --todos-simulados [--aceleracao 10] [--trafego]
    → identidade de "agente simulador" pareada com todos os pontos simulados (criada pelo seed)
```

Configuração por variáveis de ambiente (Railway ou `.env.local`, nunca no repositório):

| Variável | O que é |
|---|---|
| `SUPABASE_URL` | endereço do projeto |
| `SUPABASE_PUBLISHABLE_KEY` | chave publicável |
| `AGENTE_CREDENCIAIS` | JSON das credenciais, alternativa ao arquivo |
| `AGENTE_ACELERACAO` | velocidade da simulação |
| `AGENTE_TRAFEGO` | liga o tráfego sintético |

## Deploy

| Onde | Para quê | Como |
|---|---|---|
| Notebook | desenvolvimento e ensaio do pitch | `npm run agente:simulador` |
| Railway | sempre ligado antes da banca (pergunta Q7) | serviço Node com `npm run agente:simulador`; variáveis acima |
| Mini-PC no comércio | futuro, com hardware | `pontow-agente rodar`, um por ponto, driver Modbus |

O `server.js` atual (site estático no Railway) continua opcional; o GitHub Pages segue como hospedagem das telas.
