# Perguntas para executar

Cada pergunta tem a minha recomendação. Resposta "ok" segue a recomendação. Estão na ordem em que bloqueiam o trabalho.

## Bloqueiam o início (F0)

| # | Pergunta | Recomendação | Por que importa |
|---|---|---|---|
| Q1 | Você aprova a arquitetura (ADRs 0001 a 0012) como está, ou quer mudar alguma decisão? | aprovar; mudo o status dos ADRs para "Aceita" | é a base de todo o resto |
| Q2 | Em qual organização do Supabase criamos o projeto? Você já tem projetos gratuitos ativos em outras organizações em que é dono ou admin? | organização nova, pessoal ou do grupo, fora da 3AM IT | o Free permite só 2 projetos no total; a conexão desta sessão só enxerga a "3AM IT" |
| Q3 | Você tem (ou pode instalar) o Docker Desktop no notebook? | sim, se puder: Supabase local completo | sem Docker, os testes de banco rodam no PGlite (já validado com este rascunho), mas Realtime e Edge Functions só se testam num projeto na nuvem; aí usamos dois projetos (dev e demo) |
| Q4 | Fluxo de código: uma branch por fase com PR no `jbelkior1/gs_goodwe`? Quem do grupo revisa? | sim; PR revisado por você antes do merge | um push na `main` publica direto no site |
| Q5 | Alguém do grupo (por exemplo, o Thiagoolivs) vai mexer no código ao mesmo tempo? Há partes que não posso tocar? | eu cuido de `src/`, `agente/`, `supabase/`, `scripts/` e `docs/`; não toco em `public/animacao.html`, `narracao.wav` e no roteiro de dublagem | evita conflito com o material do pitch |
| Q6 | Qual é a data da próxima apresentação para a GoodWe/banca? | — | define se paramos na F3 (mínimo do pitch) ou seguimos para a F4 |

## Antes da F2 (agente)

| # | Pergunta | Recomendação | Por que importa |
|---|---|---|---|
| Q7 | Onde roda o agente simulado? Já existe conta no Railway? | notebook agora; Railway (custo mensal pequeno) antes da banca | mantém os pontos vivos e evita a pausa do Supabase Free após 7 dias |
| Q8 | Velocidade da simulação na demo? | 10× na apresentação, 1× no resto | uma recarga de 1 h vira 6 min no palco |

## Antes da F3 (recarga e pagamento)

| # | Pergunta | Recomendação | Por que importa |
|---|---|---|---|
| Q9 | Modelo de pagamento do motorista | carteira pré-paga no app (mínimo R$ 20) e Pix por valor no totem para visitante | define o fluxo de confirmação e o livro-caixa ([ADR-0008](../adr/0008-pagamento-por-adaptador.md)) |
| Q10 | Quem paga a taxa do gateway? | manter a taxa de processamento de 1,5% por recarga, paga pelo comércio, que cobre as taxas do gateway | na carteira, a taxa do gateway acontece na recarga de saldo, não em cada sessão |
| Q11 | Valores: royalties 6% e fundo 2% confirmados? Mensalidade de R$ 180/mês? Ociosidade de R$ 0,50/min após 10 min? Taxa por sessão zero? | sim para todos (são os números do documento e do mercado, como na Tupi) | entram como `parametros_rede` v1 e regra de tarifa padrão |
| Q12 | Em que aparelho o totem roda na demo (tablet, monitor vertical, notebook)? Qual celular lê o QR (Android ou iPhone)? | tablet ou monitor em tela cheia; testar nos dois celulares | ajusta o layout do totem e o teste do QR |
| Q13 | Quer botões "entrar como" no portal para trocar de painel rápido na apresentação? | sim, só no build de demonstração | expõe as senhas das contas demo no site público; desligar após o Challenge |

## Antes da F5 (mercado)

| # | Pergunta | Recomendação | Por que importa |
|---|---|---|---|
| Q14 | Existe CNPJ ou conta PJ para um gateway real? | sem CNPJ, fica no simulado; com CNPJ, Asaas no ambiente de teste | as subcontas do Asaas exigem PJ |
| Q15 | Domínio próprio para o app? | não por enquanto | o QR do totem usa o endereço do site |

## Já decidido (não precisa responder)

- **Gerenciador de pacotes:** npm, porque o projeto, o CI e o Railway já usam.
- **Hardware da GoodWe:** fora do foco; entra no lugar das vagas simuladas quando e se houver integração.
- **Login:** e-mail e senha, porque o servidor de e-mail padrão do Supabase manda só 2 por hora.
- **Commits:** sem linha de atribuição à IA.
