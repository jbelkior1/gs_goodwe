# Ponto W — Sistema

Plataforma de gestão de recarga elétrica comercial. Projeto do **EV Challenge 2026
(GoodWe × FIAP)** — trilha *ChargeGrid Intelligence* (setor comercial e varejo).

> **Tese do produto:** o carregador prende o cliente 1–2 h no local. O que se vende
> não é kWh — é **permanência**, que vira movimento e venda dentro do comércio.

## Rodando

```bash
npm install
npm run dev
```

## Como o mapeamento nasceu

Cada aba do sistema responde a um pedido explícito da GoodWe ou a um dos 4 pilares
do ChargeGrid.

| Pedido da GoodWe | Onde está no sistema |
|---|---|
| Gerenciamento inteligente de **demanda de potência** | `Lojista › Controle de demanda` |
| Sistema de **cobrança das recargas** | `Motorista › Recarga e pagamento` + `Lojista › Tarifas e financeiro` |
| Gestão inteligente da recarga **com interface para o usuário** | `Motorista › Recarga e pagamento` |

| Pilar ChargeGrid | Onde está |
|---|---|
| Controle de Demanda | `Lojista › Controle de demanda` (motor em `engine/demanda.ts`) |
| Protocolos Abertos | `Rede › Visão da rede` (Modbus; OCPP não suportado na linha HCA) |
| Tarifação e Pagamento | `Lojista › Tarifas e financeiro` + `Motorista › Recarga e pagamento` (`engine/tarifa.ts`) |
| IA Aplicada | `Rede › Homologação` (score de viabilidade) + resumo no `Painel` (`engine/ia.ts`) |

## Abas por persona (7 telas)

### 🚗 Motorista
| Aba | Função |
|---|---|
| Onde carregar | Pontos com vaga livre, preço do kWh agora e potência |
| Recarga e pagamento | SoC, potência, curva CC/CV, encerrar e pagar por Pix com a repartição do valor |

### 🏪 Lojista (franqueado)
| Aba | Função |
|---|---|
| Painel | Faturamento, energia, líquido, uso/dia vs. limiar de viabilidade, payback e resumo da IA |
| Controle de demanda | Distribui potência entre sessões, estado das vagas e proteção do disjuntor |
| Tarifas e financeiro | Preço dinâmico por faixa, cobranças, repartição e resultado da unidade |

### 🛰️ GoodWe (franqueadora)
| Aba | Função |
|---|---|
| Visão da rede | KPIs, faturamento por região, ranking de pontos, royalties e saúde da frota |
| Homologação | Score de viabilidade da IA que aprova ou reprova um ponto novo |

## Arquitetura

```
src/
  domain/
    types.ts          modelo de dados
    catalogo.ts       linha HCA G2, regiões, veículos, regras da franquia
    prng.ts           gerador com semente fixa
    seed.ts           BASE FALSA: 90 dias de histórico coerente
    db.ts             camada de acesso (troque por Supabase sem mexer na UI)
    engine/
      demanda.ts      pilar 1 — alocação de potência
      tarifa.ts       pilar 3 — preço dinâmico e repartição
      ia.ts           pilar 4 — previsão, viabilidade, recomendações
  ui/kit.tsx          componentes compartilhados
  app/               shell, rotas e troca de persona
  pages/             telas por persona
```

## Banco de dados

Hoje **não há banco real** — a base é gerada em memória por `seed.ts` com semente
fixa (não muda a cada F5) e é coerente entre si: energia × tarifa = custo, o SoC
final bate com a energia entregue e a capacidade do carro, a curva CC/CV reduz a
potência acima de 80%.

Volume gerado: ~16 pontos, ~33 carregadores, ~4.700 sessões, cobranças e telemetria
minuto a minuto das sessões ao vivo.

**Para plugar o banco real:** todo acesso passa por `src/domain/db.ts`. Basta
reescrever aquelas funções como consultas ao Postgres/Supabase — nenhuma tela muda.

## Nota sobre o hardware

A linha HCA G2 da GoodWe **não suporta OCPP** e a API dos carregadores não foi
liberada para o desafio. Por isso a arquitetura assume **Modbus RTU (RS-485)** como
caminho de integração real e uma camada própria de sessão, identidade e cobrança —
que é exatamente o que falta hoje para o carregador virar um negócio.
