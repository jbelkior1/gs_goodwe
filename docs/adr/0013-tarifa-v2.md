# ADR-0013: Tarifa dinâmica v2, preço travado na cotação e piso/teto por ponto

**Status:** Aceita no MVP (pendências tributárias abaixo)
**Data:** 20/10/2026
**Decisores:** João

## Contexto

A tarifa v1 (`engine/tarifa.ts`) tinha problemas que apareceram ao revisar o fluxo de ponta a ponta:

1. "Ponto vazio −5%" ficava quase sempre ligado e "+15%" nunca disparava: a sessão ainda aberta (carro no cabo, aguardando o QR) não entrava na ocupação e o denominador contava vagas OFFLINE e em MANUTENCAO.
2. O preço mudava entre o QR e a confirmação: o simulador gravava o preço na sessão aberta e o totem o mostrava, mas `vincularSessao` e `iniciarVisitante` recalculavam e sobrescreviam. O motorista via um preço e pagava outro.
3. Preço base vazio virava 0 (`Number('')`), `salvarPonto` não validava e a coluna não tinha restrição. Resultado: preço 0, recarga fechada como FATURADO sem cobrança. Tarifa nula virava custo 0 no simulador. Base baixa no RJ de madrugada vendia abaixo do custo.
4. O fator de energia contava o custo da região duas vezes (RJ +19% sobre a base digitada, Sul −8%) e o preço não tinha piso nem teto.
5. A "margem" exibida ignorava royalty (6%), fundo (2%) e gateway (1,5%).
6. A hora vinha do aparelho (`getHours()`), não de Brasília. Arredondamento com `toFixed` (1,805 dava 1,80).
7. O histórico do `seed.ts` usava outra fórmula; a pizza do financeiro ignorava a mensalidade da plataforma; o gráfico de 24 h usava a ocupação de agora em todas as horas e se dizia "calculado pela IA" sendo uma tabela fixa.

## Decisão

**Preço = base × faixa de horário × (1 + escassez) − desconto do sol, limitado entre o piso e o teto do ponto.** A energia da região **não** entra no preço: ela define só o piso e o preço base sugerido.

- **Faixa de horário** (hora local de Brasília): dia útil com vale 22h–8h (×0,90), normal (×1,00) e pico 17h–19h (×1,12); fim de semana sem pico. As horas de borda 8h, 16h, 20h e 22h são rampas no meio do caminho (×0,95 e ×1,06), então o preço nunca salta mais que 6% de uma hora para a seguinte por causa do horário.
- **Escassez**: só em ponto com 2 vagas operantes ou mais (fora OFFLINE e MANUTENCAO). Ocupação = (vagas ocupadas por outros + 1 da própria sessão) / operantes, limitada a 1; sessão ABERTA e CONCLUIDO contam como ocupadas. Adicional = 8% × clamp((ocupação − 0,5)/0,5, 0, 1).
- **Sol**: ponto com solar e excedente de geração (geração − carga do comércio) leva desconto = min(8% do preço, 50% da economia de custo). Economia = (custo da região − R$ 0,70) × cobertura. A cobertura é o excedente dividido por 7 kW (um carro inteiro), limitado a 1, em média móvel de 5 horas para o desconto não ligar e sumir de uma hora para a outra. Custo efetivo = custo da região − economia.
- **Piso** = max(⌈(custo efetivo + R$ 0,20) / (1 − royalty − fundo − gateway)⌉ ao centavo, base × 0,85). **Teto** = max(piso, base × 1,30). Nunca vende abaixo do custo, das taxas e de R$ 0,20 líquidos por kWh.
- **Arredondamento** `cent()`: meio para cima com correção de ponto flutuante (`Math.round(Number((v*100).toPrecision(12)))/100`), usado também em `repartir`. Piso arredonda para cima, teto para baixo.
- **Base inválida** (0, negativa, NaN, vazia) nunca gera preço 0: o motor usa o preço sugerido da região (`sugerirPrecoBase` = (custo + R$ 0,85)/0,905 em degraus de R$ 0,05; SP dá R$ 1,90). A tela de configuração recusa base ≤ 0 ou abaixo do piso de custo da região e avisa quando está abaixo do sugerido. `salvarPonto` valida igual, e `ativarPonto` exige base válida.
- **Explicação** em linhas somáveis ("Horário de pico (+12%) +R$ 0,23", "Últimas vagas (+8%) +R$ 0,16", "Energia do sol do ponto (−6%) −R$ 0,12", "Preço mínimo do ponto aplicado +R$ 0,10"): cada linha é a diferença entre valores acumulados e arredondados, então base + linhas = preço final, sem sobrar centavo.
- **Preço travado na cotação**: o simulador grava `tarifaAplicadaKWh` na sessão ABERTA (mesmo motor, hora local, ocupação com a própria vaga) e registra a composição no evento `SESSAO_COTADA`. A cotação vale `REGRAS.codigoValidadeMin` (10 min) a partir de `sessao.inicio`. `vincularSessao` e `iniciarVisitante` **usam o preço da sessão** dentro da validade, sem recalcular. Fora da validade, ou com preço nulo ou ≤ 0, recotam, e o app mostra o preço novo antes de confirmar. A tela envia o preço que mostrou (`precoEsperado`); se o preço de gravação for outro, a ação falha com "O preço mudou" e nada é gravado.
- **Simulador**: tarifa nula ou ≤ 0 nunca vira FATURADO de graça; recota, grava o preço na sessão e registra `ERRO_TARIFA_INVALIDA`.
- **Banco**: `check ("precoBaseKWh" > 0)` em `pontos` e `check ("tarifaAplicadaKWh" is null or "tarifaAplicadaKWh" > 0)` em `sessoes`, ambos `NOT VALID` (valem para linhas novas; o histórico não é reprovado).
- **Migração do nível de preço**: não houve. Em 21/10/2026 a rede de demonstração foi recriada (10 pontos em São Paulo) já com preços da v2, então o script que aplicava o fator de energia antigo foi removido: rodá-lo sobre pontos da v2 subiria o preço indevidamente.
- **Prioridade da demanda**: o bônus de quem paga mais passa a ser relativo à base do ponto (≥ base × 1,05), não um limiar fixo de R$ 2,00.

## Parâmetros

Constante `TARIFA` em `src/domain/catalogo.ts` (taxas em `REGRAS`).

| Parâmetro | Valor |
|---|---|
| Vale / normal / pico | ×0,90 / ×1,00 / ×1,12 |
| Pico (dia útil) / vale | 17h–19h / 22h–8h; rampas em 8h, 16h, 20h, 22h |
| Degrau máximo entre horas | 10% (o horário sozinho dá 6%; medido com sol e escassez: ver verificação) |
| Escassez | até +8%, a partir de 50% de ocupação, mínimo 2 vagas operantes |
| Sol | até −8% do preço, 50% da economia de custo; crédito do sol R$ 0,70/kWh; excedente de 7 kW cobre um carro; janela de 5 h |
| Margem líquida mínima | R$ 0,20/kWh |
| Piso / teto | max(custo+margem, 85% da base) / max(piso, 130% da base) |
| Taxas | royalty 6% + fundo 2% + gateway 1,5% = 9,5% |
| Base sugerida | (custo + R$ 0,85) / 0,905, degraus de R$ 0,05 |
| Validade da cotação | 10 min a partir de `sessao.inicio` |

**Premissa documentada:** o kWh gerado pelo sol do ponto vale R$ 0,70 (crédito de energia injetada, já líquido de encargos). É uma estimativa para o MVP; o valor real depende da distribuidora e da regra de compensação do ponto.

## Opções consideradas

### A: Motor único em TypeScript com preço travado na sessão (escolhida)
**Prós:** app, totem e simulador usam a mesma função; a composição sai pronta para a tela; migração simples.
**Contras:** o cálculo ainda roda no cliente (ADR-0007 prevê levá-lo ao Postgres na versão de mercado).

### B: Manter a v1 e só corrigir a ocupação e o arredondamento
**Contras:** não resolve o fator de energia em dobro, a falta de piso/teto nem o preço que muda após o QR.

### C: Recalcular o preço na confirmação e mostrar a diferença
**Contras:** o motorista aceitaria um preço que não viu; descartada. O preço do totem é o preço cobrado.

## Consequências

- **Fica mais fácil:** o franqueado entende por que o preço está onde está (linhas somáveis, faixas coloridas com piso e teto no gráfico); o motorista paga o que viu; base zerada deixa de existir.
- **Fica mais difícil:** quem chama `calcularTarifa` precisa passar `vagasOperantes` (sem isso não há escassez, o lado seguro) e `fimDeSemana`; use `tarifaAtual(pontoId)` ou `medirOcupacao` para obter a ocupação certa.
- **Nível de preço:** a migração leva o fator de energia antigo para dentro do preço base (RJ 1,90 vira 2,26; Sul sobe ou desce na mesma proporção que a v1 aplicava). O que muda é a forma: faixas previsíveis e limites no lugar de cinco degraus e de um fator de região oculto. O pico passa de +20% para +12%, então o preço máximo do dia cai em relação à v1.
- A hora de Brasília vale para o preço, mas o controle de demanda do app (`demandaDoPonto`) ainda lê a hora do aparelho; alinhar quando o `db.ts` for revisitado.

## Pendências

- **Tributário:** o ICMS pode incidir sobre a recarga; a consulta SEFAZ-PR nº 47/2025 cita 19%. Precisa de tributarista antes de qualquer promessa de margem. O piso de hoje cobre só energia, royalty, fundo, gateway e R$ 0,20.
- **Taxa de ociosidade** (cobrança por carro parado depois de carregado) fica para depois.
- **Teste de contrato TS×SQL** (ADR-0007): quando a tarifa for para o Postgres, usar a mesma tabela de casos da verificação.

## Itens de ação

1. [x] Motor v2, preço travado, validação de base, migration e script de migração de nível.
2. [x] Aplicar `supabase/migrations/20261021120000_tarifa_v2.sql` (aplicada em 21/10/2026; a rede foi recriada na v2, sem migração de preço).
3. [ ] Revisão tributária (ICMS) e da premissa do crédito solar.
