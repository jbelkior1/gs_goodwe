# Arquitetura do Ponto W

Mapeamento completo para transformar o protótipo (base simulada no navegador) num ecossistema funcional, rastreável e gerenciável: GoodWe concede o ponto, o franqueado instala e pareia o totem, o motorista encontra o ponto no app e a recarga liga totem e celular.

**Status:** proposta, aguardando as respostas de [perguntas.md](perguntas.md). Nada foi implementado ainda.

Para apresentar:
- [Fluxograma do ecossistema](https://claude.ai/artifact/MJBXj92sbf5ERmWKb9bdHW)
- [Documento de arquitetura v2](https://claude.ai/artifact/7XJQ8Q2mF8rXudf294vTi9)

Os dois links são privados; para o grupo abrir, compartilhe pelo menu Share da página.

## Como ler

| Arquivo | O que tem |
|---|---|
| [01-dominio.md](01-dominio.md) | Glossário, papéis, máquinas de estado com tabelas de transição, invariantes e tempos |
| [02-dados.md](02-dados.md) | Grupos de tabelas, de onde vem cada dado de hoje, volume e retenção |
| [sql/01-esquema.sql](sql/01-esquema.sql) | Esquema completo (vira migration na F0) |
| [sql/02-rls.sql](sql/02-rls.sql) | Acesso por papel e matriz resumida |
| [sql/03-funcoes.sql](sql/03-funcoes.sql) | Eventos, tarifa, repartição, livro-caixa, abrir, vincular e encerrar sessão; assinaturas das demais funções; views; tarefas agendadas |
| [03-contratos.md](03-contratos.md) | Funções por fase, Edge Functions, canais de tempo real, payloads e erros `PWnnn` |
| [04-agente.md](04-agente.md) | Agente do ponto: estrutura, interfaces de driver, ciclo, controle de demanda em ampères, física do simulador, CLI e deploy |
| [05-telas.md](05-telas.md) | Rotas e telas por papel, camada `src/data`, bibliotecas |
| [06-pagamento-e-livro-caixa.md](06-pagamento-e-livro-caixa.md) | Conta, repartição, contas, transações, fluxos, adaptador de gateway, conciliação |
| [07-rastreio-e-gestao.md](07-rastreio-e-gestao.md) | Catálogo de eventos, linha do tempo, alertas, gestão por papel, fechamento, suporte |
| [08-qualidade-e-ambientes.md](08-qualidade-e-ambientes.md) | Ambientes, segredos, seed, testes, CI, critério de pronto, riscos aceitos |
| [../adr/](../adr/) | As 12 decisões de arquitetura |
| [../plano/plano-de-execucao.md](../plano/plano-de-execucao.md) | Tarefas por fase, dependências, critério de pronto e roteiro de demonstração |
| [perguntas.md](perguntas.md) | O que preciso de você, na ordem em que bloqueia |

## Decisões (ADRs)

| # | Decisão |
|---|---|
| [0001](../adr/0001-supabase-como-plataforma.md) | Supabase como plataforma única |
| [0002](../adr/0002-agente-do-ponto-com-driver.md) | Agente do ponto separado do totem, com driver de vaga trocável (simulado hoje) |
| [0003](../adr/0003-vinculo-totem-app-por-codigo.md) | Vínculo totem ↔ app por código de sessão em QR |
| [0004](../adr/0004-eventos-so-de-inclusao.md) | Eventos só de inclusão, gravados por gatilho |
| [0005](../adr/0005-livro-caixa-partidas-dobradas.md) | Livro-caixa em partidas dobradas |
| [0006](../adr/0006-regras-como-dados-versionados.md) | Regras de negócio como dados com vigência |
| [0007](../adr/0007-tarifa-e-cobranca-no-banco.md) | Tarifa, cobrança e repartição calculadas no banco |
| [0008](../adr/0008-pagamento-por-adaptador.md) | Pagamento por adaptador, simulado no MVP, carteira pré-paga |
| [0009](../adr/0009-telemetria-5s-30s.md) | Telemetria transmitida a cada 5 s, gravada a cada 30 s |
| [0010](../adr/0010-identidade-de-aparelho.md) | Identidade de aparelho por usuário técnico criado no pareamento |
| [0011](../adr/0011-bateria-estimada-em-ac.md) | Bateria do carro como estimativa em recarga AC |
| [0012](../adr/0012-camada-de-dados-do-front.md) | Camada de dados do front com hooks e views |

## Princípios

1. **Um banco, uma verdade:** toda tela lê e grava no mesmo Postgres.
2. **Cada fato tem um dono:**
   - o agente escreve o que é físico;
   - o banco decide o que é negócio;
   - o gateway confirma o pagamento.
3. **Tudo deixa rastro:** cada mudança vira evento, e dinheiro só entra por lançamento.
4. **Tudo se administra pela tela:** regras são dados com vigência.
5. **O hardware fica atrás de uma porta:** a interface de driver, hoje atendida pelo simulador.
6. **A IA muda uma decisão:** tarifa, alocação, homologação e alertas.
