# ADR-0004: Rastreabilidade por eventos só de inclusão, gravados por gatilho

**Status:** Proposta
**Data:** 19/10/2026
**Decisores:** João

## Contexto

O sistema precisa ser rastreável: responder "o que aconteceu com esta recarga?" ou "quem mudou este preço?" sem abrir o banco. Se cada função tiver de lembrar de gravar o evento, alguma vai esquecer.

## Decisão

Uma tabela `eventos` que só aceita INSERT (UPDATE e DELETE são bloqueados por gatilho e por permissão). Gatilhos `AFTER INSERT OR UPDATE` nas tabelas que mudam de estado (pontos, carregadores, sessoes, solicitacoes, pagamentos, cobrancas, regras_tarifa, parametros_rede, dispositivos, membros, alertas) gravam o evento com antes e depois. As funções passam o contexto (ator, origem, motivo, correlação) por `set_config('pontow.*', valor, true)`, que vale só na transação; o gatilho lê com `current_setting('pontow.*', true)`. O ator vem de `auth.uid()` (usuário ou aparelho), ou de `pontow.ator_tipo = 'GATEWAY'` no webhook; sem usuário, o ator é SISTEMA.

## Opções consideradas

### A: Gatilhos com contexto pela transação (escolhida)
**Prós:** nada escapa, porque qualquer mudança gera evento; o contexto vem das funções sem acoplar código.
**Contras:** gatilho custa um pouco em cada gravação; mudanças de alta frequência precisam ser filtradas (ver abaixo).

### B: A aplicação grava os eventos explicitamente
**Prós:** controle fino do que vira evento.
**Contras:** depende de disciplina; uma função esquecida apaga o rastro.

### C: Auditoria genérica (extensão tipo `supa_audit`)
**Prós:** pronta.
**Contras:** registra linha por linha sem semântica de negócio (`SESSAO_VINCULADA` vira "update em sessoes"), o que ajuda pouco a linha do tempo.

## Consequências

- **Fica mais fácil:** linha do tempo por sessão, vaga, ponto e aparelho; suporte e auditoria.
- **Fica mais difícil:** o volume. Mudanças de telemetria (energia e potência a cada 30 s) **não** geram evento; o gatilho só registra quando muda estado, limite de corrente (variação de 2 A ou mais, no máximo 1 a cada 30 s por vaga) ou um campo de negócio.
- **A revisitar:** particionar `eventos` por mês se passar de alguns milhões de linhas.

## Itens de ação

1. [ ] Função `private.registrar_evento(...)` e gatilhos por tabela ([sql/03-funcoes.sql](../arquitetura/sql/03-funcoes.sql)).
2. [ ] Catálogo de tipos de evento ([07-rastreio-e-gestao.md](../arquitetura/07-rastreio-e-gestao.md)).
