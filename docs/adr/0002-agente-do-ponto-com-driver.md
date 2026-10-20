# ADR-0002: Agente do ponto separado do totem, com driver de vaga trocável

**Status:** Proposta
**Data:** 19/10/2026
**Decisores:** João

## Contexto

Alguém precisa fazer o papel das vagas: detectar o carro conectado, liberar e limitar a corrente, medir a energia e aplicar o controle de demanda entre as vagas. A integração com o hardware da GoodWe (HCA G2) **não é foco agora** (decisão do João em 18/10/2026), mas pode vir no futuro. Esse papel precisa rodar mesmo com nenhuma tela aberta e não pode depender da aba do totem.

## Decisão

Criar um **agente do ponto**: um processo Node + TypeScript em `agente/`, que conversa com as vagas por uma interface única (`DriverVaga`) e com a plataforma pelo Supabase. A primeira implementação do driver é **simulada**, com física coerente. Um único processo pode rodar os agentes de todos os pontos marcados como simulados.

## Opções consideradas

### A: Agente Node separado com driver trocável (escolhida)
| Dimensão | Avaliação |
|---|---|
| Complexidade | Média: um processo a mais |
| Custo | Notebook (zero) ou Railway (custo mensal pequeno) |
| Escala | Um processo simula dezenas de pontos |
| Familiaridade | Alta: reaproveita `src/domain/engine/demanda.ts` |

**Prós:** reaproveita os motores em TypeScript; é o mesmo desenho que receberá o hardware; o pitch mostra um fluxo de dados real.
**Contras:** precisa estar ligado para os pontos "andarem".

### B: Simulação dentro do banco (pg_cron a cada 10 s)
**Prós:** nenhuma infraestrutura extra; sempre ligado enquanto o projeto não pausa.
**Contras:** reescrever física e demanda em PL/pgSQL; granularidade de 10 s; se afasta do desenho que receberá o hardware.

### C: Simulação dentro do totem (navegador)
**Prós:** zero infraestrutura.
**Contras:** só funciona com a aba aberta; duas abas brigam pelo mesmo estado; mistura tela com controle.

## Trade-offs

A opção A custa um processo ligado, mas mantém uma fonte só para a lógica de demanda e prepara o encaixe do hardware. A opção B seria mais barata em infraestrutura, mas duplicaria a lógica em SQL.

## Consequências

- **Fica mais fácil:** trocar o simulado pelo Modbus do HCA G2 ou por OCPP, escrevendo só um driver.
- **Fica mais difícil:** mais um deploy, com o agente rodando no notebook ou no Railway (pergunta Q7).
- **A revisitar:** quando houver hardware, o agente roda num mini-PC no comércio, um por ponto.

## Itens de ação

1. [ ] Interface `DriverVaga` e `DriverEntrada` ([04-agente.md](../arquitetura/04-agente.md)).
2. [ ] Driver simulado com física e bancada de simulação.
3. [ ] Driver Modbus fica como esqueleto, sem implementação.
