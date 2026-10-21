# ADR-0014: Tokens de estado, regra de cor e números dos painéis

**Status:** Proposta
**Data:** 20/10/2026
**Decisores:** João

## Contexto

Os painéis do franqueado e da GoodWe usavam o vermelho da marca para tudo: valor de KPI (faturamento, "15/17 pontos ativos"), queda de variação, oportunidade. O verde e o "teal" eram a mesma cor. Quem olha não consegue dizer se vermelho é marca ou problema. Os rótulos tinham 9 px e contraste abaixo de 3:1.

Os números também enganavam: o gráfico de 30 dias agrupava em UTC e despencava depois das 21h; "↓ 4%" comparava metades de 30 dias e dizia "vs mês anterior"; o payback e a projeção anual partiam de um mês incompleto; textos da IA mostravam "R$ 1466.25"; ponto em instalação aparecia como "abaixo do limiar".

## Decisão

1. **Regra de cor.** O vermelho da marca (`--k-red`) aparece só em logo, botão primário, item ativo e foco. Estado usa cinco tons, sempre com ícone ou palavra, nunca só cor:

| Tom | Token | Estados |
|---|---|---|
| Positivo | `--pos` | Operando, Disponível, Pago, Aprovado |
| Informativo | `--info` (azul) | Ocupado, Carregando, Aguardando QR, Em análise |
| Atenção | `--warn` | Em instalação, Pendente, Vistoria, Pausado |
| Negativo | `--neg` (coral, não é o da marca) | Offline, Sem sinal, Falhou, Reprovado, Suspenso |
| Neutro | `--neu` | Manutenção, Concluído, Expirada |

   O mapa fica em `StatusBadge` (`src/ui/kit.tsx`). `Badge` e `Nota` aceitam os nomes novos (`pos`, `info`, `warn`, `neg`, `neu`); os antigos seguem valendo (`teal` virou informativo, `red` virou negativo).
2. **KPI.** O valor fica na cor do texto. Cor só no delta (sobe/desce) e nos selos. O delta sempre traz a base escrita ("+4% vs 1–20 set"). Número que é projeção ou previsão leva o selo "estimado". O prop `accent` continua aceito e é ignorado.
3. **Tipografia e contraste.** Mínimo de 11 px nos rótulos; `--k-label` (64% de opacidade) tem 6,9:1 sobre o painel (o `--k-dim2` tinha 2,9:1). `--k-dim2` fica só para o que é decorativo. Na série de dado, o azul `--info` é a série principal e o marfim é a média móvel; `CHART.serie1` ficou mais claro (#ff4d57) e a legenda lê a 5,7:1; o vermelho antigo dava 3,9:1.
4. **Tempo.** O dia de um registro é o dia de Brasília (`diaLocal`), não o de UTC. Hoje é sempre parcial: aparece vazado no gráfico, fora da média móvel, e a comparação com o período anterior corta o mesmo horário do último dia.
5. **Comparação.** "Mês atual" compara o mês até hoje com o mesmo número de dias do mês anterior; "7 dias" e "30 dias" comparam com a janela de mesma duração logo antes.
6. **Projeção.** Ritmo = acumulado ÷ dias decorridos × dias do mês (hoje conta pela fração). A mensalidade da plataforma entra proporcional aos dias. Payback e projeção anual saem do ritmo, nunca do mês incompleto.
7. **Estados vazios e ponto em instalação.** Sem dado no período há mensagem e atalho. Ponto em instalação mostra o checklist de ativação do fluxograma (dados e tarifa, parear o totem, ativar) e a previsão da homologação no lugar dos zeros.
8. **Casca.** A troca de papel é da vitrine: só com `VITE_MODO_DEMO=true`, rotulada "Demonstração". O rodapé técnico virou menu da conta (nome, papel legível, "ao vivo" ou "dados até"). O franqueado só vê as unidades dele.

## Opções consideradas

### A: Tokens de estado e regra de cor (escolhida)
**Prós:** vermelho volta a significar marca; estado legível sem depender de cor; um lugar só para mudar.
**Contras:** telas que usavam `accent="red"` perdem o destaque (ficam em cor de texto).

### B: Manter as quatro cores de série do padrão ChargeGrid (vermelho, verde, âmbar, marfim)
**Prós:** zero mudança visual.
**Contras:** vermelho continua ambíguo; não há cor para "informativo", então ocupado e carregando se confundem com positivo.

### C: Biblioteca de UI pronta
**Contras:** nova dependência, e o MVP precisa seguir o padrão visual da GoodWe.

## Consequências

- **Fica mais fácil:** ler estado de relance; comparar períodos sem enganar; trocar a paleta mexendo só em tokens.
- **Fica mais difícil:** número em destaque não tem mais cor própria; `rankingPontos`, `kpisDaRede` e `economiaDoPonto` mudaram de contrato (campos novos; os antigos seguem).
- Os agregados de `db.ts` ficam em cache até a base mudar (`aoMudarBase`) ou 30 s passarem. Na migração para views (ADR-0012), as definições de período e de ritmo acima valem como especificação das views.
