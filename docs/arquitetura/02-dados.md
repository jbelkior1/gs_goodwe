# 02 · Dados

O desenho completo está em SQL, para virar migration sem reinterpretação:

- [sql/01-esquema.sql](sql/01-esquema.sql): enums, tabelas, índices, restrições, imutabilidade, publicação de tempo real.
- [sql/02-rls.sql](sql/02-rls.sql): funções de papel e políticas de acesso, com a matriz resumida no fim.
- [sql/03-funcoes.sql](sql/03-funcoes.sql): eventos, tarifa, repartição, livro-caixa, abrir/vincular/encerrar sessão, assinaturas das demais funções, views e tarefas agendadas.

## Grupos de tabelas

| Grupo | Tabelas | Quem escreve |
|---|---|---|
| Catálogos | `regioes`, `modelos_carregador`, `veiculos`, `formatos_franquia` | GoodWe |
| Pessoas | `organizacoes`, `membros`, `motoristas` | cadastro e funções |
| Regras | `parametros_rede`, `regras_tarifa` | GoodWe / franqueado, sempre nova versão |
| Expansão | `solicitacoes` | candidato e GoodWe, por função |
| Rede | `pontos`, `carregadores`, `dispositivos`, `codigos_pareamento` | franqueado (cadastro), agente (estado), funções |
| Operação | `sessoes`, `telemetria`, `leituras_entrada`, `comandos` | agente e funções |
| Financeiro | `contas`, `transacoes`, `lancamentos`, `cobrancas`, `pagamentos`, `fechamentos` | só funções |
| Rastreio | `eventos`, `alertas` | gatilhos e funções |

## De onde vêm os dados de hoje

| Hoje (`src/domain/types.ts`) | Passa a ser | Observação |
|---|---|---|
| `Franqueado` | `organizacoes` (FRANQUEADO) + `membros` | um login por franqueado de demonstração |
| `Ponto` | `pontos` + `regras_tarifa` | `precoBaseKWh` vira a regra v1 do ponto; `limitePotenciaKW` vira `limite_corrente_a` (por fase) |
| `Carregador` | `carregadores` | `potenciaPermitidaKW` vira `limite_atual_a` |
| `Motorista` | `motoristas` + `auth.users` | e-mails de demonstração |
| `Sessao` (histórico FATURADO) | `sessoes` (PAGA) + `cobrancas` + `transacoes` | carregadas pelo seed, marcadas `demo` |
| `AmostraTelemetria` | `telemetria` | o histórico não traz telemetria; só sessões novas geram |
| `Cobranca` | `cobrancas` + `transacoes`/`lancamentos` | a carteira dos motoristas de demonstração recebe um crédito inicial pelo seed |
| `SolicitacaoHomologacao` | `solicitacoes` | score recalculado com a regra corrigida |
| `REGRAS` (catalogo.ts) | `parametros_rede` v1 | mesmos valores |

O seed corrigido (sem dependência do relógio na ordem dos sorteios) gera a rede uma vez, e um script grava no banco ([08-qualidade-e-ambientes.md](08-qualidade-e-ambientes.md)).

## Volume e retenção (plano Free, 500 MB)

| Tabela | Crescimento | Retenção |
|---|---|---|
| `telemetria` | 120 linhas por hora de recarga (1 a cada 30 s), ~150 B cada | 30 dias (`dias_retencao_telemetria`) |
| `leituras_entrada` | 12 linhas por hora por ponto com agente ligado (1 a cada 5 min; o painel ao vivo usa a telemetria) | 30 dias |
| `eventos` | ~10 a 20 por recarga, mais mudanças de cadastro | sem limpeza; particionar por mês se passar de alguns milhões |
| `lancamentos` | 4 ou 5 por recarga | permanente |

**Estimativa** com 16 pontos de demonstração, tráfego simulado de 6 h/dia por ponto e agente ligado 24 h:

| Tabela | Linhas por dia | Tamanho por dia | Nos 30 dias retidos |
|---|---|---|---|
| Telemetria | ~11,5 mil | ~1,7 MB | ~50 MB |
| Leituras da entrada | ~4,6 mil | ~0,7 MB | ~20 MB |

Cabe no Free. As mensagens de tempo real também cabem: a telemetria só é transmitida com tela olhando (Presence), e as tabelas publicadas só mudam em transição de estado.

## Convenções

- Chave `uuid` em tudo, mais um **código legível** onde o suporte precisa citar: `H-0001` solicitação, `P-0001` ponto, `V-00001` vaga, `S-000001` sessão, `C-000001` cobrança.
- Dinheiro em `numeric(12,2)`, energia em `numeric(10,3)`, corrente em `numeric(5,1)`. Nunca `float`.
- Horários em `timestamptz` (UTC no banco). Agregações por dia e mês usam `America/Sao_Paulo`.
- Marca `demo` em organizações, pontos, motoristas, sessões e cobranças da rede de demonstração, para filtrar ou apagar.
- `atualizado_em` mantido por gatilho nas tabelas mutáveis.
