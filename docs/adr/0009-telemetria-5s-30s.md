# ADR-0009: Telemetria transmitida a cada 5 s e gravada a cada 30 s

**Status:** Proposta
**Data:** 19/10/2026
**Decisores:** João

## Contexto

O totem e o app precisam parecer vivos durante a recarga. O plano Free do Supabase tem 2 milhões de mensagens de Realtime por mês: cada envio conta 1, mais 1 por tela que recebe. O banco tem 500 MB.

## Decisão

- O agente transmite uma amostra por sessão ativa **a cada 5 s** num canal de Broadcast por ponto (`telemetria:<ponto_id>`), enviado pelo cliente do agente. Não usar "Broadcast from Database", que está em beta.
- O agente **só transmite quando há tela presente** no canal: as telas entram com Presence. Sem isso, 16 pontos de demonstração com 6 h/dia de recarga mandariam cerca de 2,07 milhões de mensagens por mês, acima da cota, mesmo sem ninguém olhando.
- Tabelas publicadas (`carregadores`, `sessoes`) só mudam em transição de estado ou a cada 30 s de medição; o sinal de vida fica em `dispositivos`, fora da publicação.
- O agente grava `telemetria` e atualiza `sessoes` **a cada 30 s**, em lote.
- As telas suavizam a curva entre amostras.
- Telemetria bruta é apagada após 30 dias (parâmetro); o resumo fica na sessão.
- A telemetria não carrega dado pessoal, por isso o canal pode ser público.

## Opções consideradas

| Opção | Mensagens/mês, 1 ponto com 1 tela, 6 h/dia de recarga | Sensação de tempo real |
|---|---|---|
| 1 s | ~1,3 milhão | Ótima, mas a cota estoura com 2 pontos |
| **5 s** (escolhida) | ~260 mil | Boa, com suavização |
| Só mudanças de tabela a cada 30 s | ~22 mil | Ruim |

## Consequências

- **Fica mais fácil:** cabe no Free com folga para a demo e vários pontos.
- **Fica mais difícil:** o gráfico ao vivo precisa de interpolação.
- **A revisitar:** canal privado com autorização quando a segurança entrar em foco.
