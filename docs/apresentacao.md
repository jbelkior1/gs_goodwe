# Roteiro de apresentação para a GoodWe

Duração: **15 a 20 minutos**. A demonstração segue o fluxograma do produto, do pedido de franquia ao
dinheiro chegando na GoodWe. A tese que sustenta tudo: **o carregador prende o cliente por 1 a 2 horas;
o que a rede vende é permanência, que vira venda dentro do comércio.**

```
1 Pedido de franquia ─► 2 GoodWe aprova ─► 3 Franqueado configura ─► 4 Pareia o totem
        │
5 Motorista acha o ponto ─► 6 Conecta o carro: o totem mostra QR + código ─► 7 Lê o QR e trava o preço
        │
8 O agente libera a potência ─► 9 Encerra e paga (Pix) ─► 10 Franqueado vê o extrato ─► 11 GoodWe vê royalties
```

## Antes de começar (faça na véspera e de novo 30 min antes)

### 1. Configuração, uma vez só

- **Supabase: desligue a confirmação de e-mail.** Painel do projeto → *Authentication* → *Sign In / Providers*
  → *Email* → desligue **Confirm email**. Sem isso, quem cria conta fica esperando um e-mail que não chega.
- No `.env.local`: `VITE_MODO_DEMO=true` (liga os botões de conta de demonstração no login) e
  `VITE_URL_PUBLICA=http://<IP-do-notebook>:5191`. O IP aparece em `ipconfig` (Endereço IPv4 do Wi-Fi). É ele que
  vai dentro do QR do totem: o celular não abre `localhost`.
- Notebook e celular na **mesma rede Wi-Fi**. Se o Wi-Fi do local isola os aparelhos, conecte o notebook ao
  hotspot do celular (o IP do notebook muda: ajuste o `VITE_URL_PUBLICA` e reinicie o `npm run dev:rede`).
- Na primeira vez, o Windows pergunta se o Node pode receber conexões: **permita na rede privada**.

### 2. Comandos (nesta ordem)

```bash
npm run demo:comerciante     # zera a conta do comerciante: o fluxo recomeça do pedido de franquia
npm run demo:atualizar       # traz o histórico para hoje (a recarga mais recente termina 30 min antes de agora)
npm run simulador            # terminal 1, deixe aberto: faz o papel dos carregadores
npm run dev:rede             # terminal 2, deixe aberto: o app em http://localhost:5191 e na rede
```

Rode o `demo:atualizar` **com as janelas do app fechadas** (ele regrava milhares de linhas) e dê F5 depois.
`npm run demo:atualizar -- --simular` só mostra o deslocamento, sem gravar. A velocidade da simulação é o
`SIM_ACELERACAO` do `.env.local` (10 = uma hora de recarga em 6 minutos; suba para 20 ou 30 se a demonstração
estiver apertada e reinicie o simulador).

### 3. Janelas

Cada papel precisa de uma **origem diferente**: o login fica guardado por endereço, então o mesmo endereço não
mantém duas contas ao mesmo tempo. Use os três nomes abaixo (todos apontam para o seu notebook) ou janelas anônimas.

| Janela | Onde fica | Endereço | Conta |
|---|---|---|---|
| Comerciante, depois franqueado do ponto novo | notebook | `http://localhost:5191/seja-goodwe` | `comerciante@pontow.app` |
| GoodWe (torre de controle) | notebook | `http://goodwe.localhost:5191/goodwe` | `goodwe@pontow.app` |
| Totem | monitor ou tablet, em tela cheia | `http://totem.localhost:5191/totem?tela=cheia` (no tablet: `http://<IP>:5191/totem?tela=cheia`) | sem login |
| Motorista | celular | `http://<IP>:5191/motorista` | `motorista@pontow.app` |
| Franqueado com histórico (para o fim) | notebook | `http://localhost:5191/franqueado` em janela anônima | `franqueado@pontow.app` |

A senha de todas as contas é a `DEMO_SENHA` do `.env.local`. Com `VITE_MODO_DEMO=true`, a tela de login tem o bloco
**Demonstração** com um botão por conta: entra sem digitar nada.

### 4. Checklist (10 itens, confira antes de abrir a sala)

1. "Confirm email" desligado no Supabase.
2. `VITE_URL_PUBLICA` com o IP certo do notebook (se o Wi-Fi mudou, o IP mudou).
3. `npm run demo:comerciante` rodado hoje (a conta do comerciante está no início, sem pedido).
4. `npm run demo:atualizar` rodado hoje (os gráficos de "hoje" e "7 dias" têm dado).
5. `npm run simulador` aberto, escrevendo no terminal a cada poucos segundos.
6. `npm run dev:rede` aberto e `http://localhost:5191` abrindo o portal.
7. O celular abre `http://<IP>:5191/motorista` pela rede (se não abrir, é firewall ou Wi-Fi isolado).
8. As quatro janelas abertas e logadas, cada uma na sua origem, na ordem em que serão usadas.
9. O totem em tela cheia mostrando o **código de 6 números** (ainda não pareado).
10. Um ensaio completo feito, e `npm run demo:comerciante` rodado de novo para zerar. Bateria carregada, notificações
    desligadas, brilho no máximo.

## Roteiro (cada bloco com o tempo e o que dizer)

### Abertura (1 min) · portal
Abra `http://localhost:5191`. Quatro portas, quatro públicos: motorista, totem, franqueado e GoodWe. Mesma
plataforma, poderes diferentes. "O que vamos ver é a vida de um ponto, do pedido ao dinheiro."

### Passo 1 · Pedido de franquia (2 min) · janela do comerciante
Entre como **Comerciante** em `/seja-goodwe`. Mostre a proposta: o cliente fica 1 a 2 horas e compra na loja;
**royalty só sobre a recarga**, nunca sobre as vendas; ecossistema solar GoodWe.
- Escolha o formato (Light, Standard ou Hub) e veja capex e taxa.
- **Pré-análise da IA ao vivo:** mude a carga elétrica e o fluxo de pessoas e veja o score e as horas de uso por vaga
  mudarem. Mostre uma entrada elétrica fraca reprovando.
- Toque em **Preencher com um exemplo** (só aparece no modo demonstração) e **Enviar solicitação**. Desça até
  *Acompanhe o seu pedido*: a linha do tempo começa em "Análise da GoodWe".

### Passo 2 · A GoodWe aprova (2 min) · janela da GoodWe
Entre como **GoodWe** em *Homologação*. Abra o pedido novo: score da IA, uso previsto, parecer. Peça a
**vistoria** e depois **aprove**.
- Destaque: a IA decide o que importa (aprovar um ponto fraco frustra o franqueado e suja a marca).
- Volte à janela do comerciante: a linha do tempo andou sozinha (tempo real) e agora oferece **Ir para o meu ponto**.
  A mesma conta virou franqueada do ponto que acabou de ser criado.

### Passos 3 e 4 · Configurar o ponto e parear o totem (3 min) · comerciante e totem
Em *Meu ponto*, o ponto está **em instalação**. Defina as vagas, a tarifa base e, se quiser, o solar.
- Olhe para o **totem**: ele mostra um **código de 6 números**. Digite no painel do franqueado para parear.
  A tela do totem passa a mostrar o ponto.
- Clique em **Ativar ponto**. Ele aparece no mapa do motorista.

### Passo 5 · O motorista acha o ponto (1 min) · celular
No app, o ponto novo aparece no mapa. Toque nele: endereço, **vagas livres agora**, **preço do kWh agora** e o passo
a passo "Como carregar aqui". Mostre que as vagas e o preço são ao vivo.

### Passo 6 · Conectar o carro (1,5 min) · totem
No totem, toque em **Simular carro conectado** (faz o papel do motorista plugando o cabo). O totem mostra o **QR e o
código de 4 letras**. Diga com clareza: **o código só nasce quando o cabo é conectado**, vale 10 minutos, e por isso
o app não tem código para digitar antes disso.

### Passo 7 · Ler o QR e travar o preço (1,5 min) · celular
Leia o QR com a câmera do celular (ou toque em **Digitar código** no app). A tela mostra o preço do kWh, a
composição dele (horário, lotação, custo de energia) e **trava o preço** ao confirmar. Escolha o limite em R$ se quiser.
- Destaque: o preço é mostrado antes e fica travado na sessão (transparência da regra da ANEEL).

### Passo 8 · O agente libera a potência (2 min) · celular e franqueado
A recarga começa e aparece ao vivo no celular, no totem e no painel do franqueado.
- Em *Controle de demanda* (janela do comerciante): a entrada elétrica do comércio, a carga da loja, a recarga e o
  que o sol cobre. Conecte um segundo carro e mostre a potência sendo dividida sem estourar o disjuntor.
- Destaque: o controle de demanda protege a conta de luz do comerciante; o solar GoodWe aumenta a margem.

### Passo 9 · Encerrar e pagar (1,5 min) · celular
**Encerrar** no app. A conta fecha e aparece o **Pix**. Pague (simulado). Mostre a **repartição do dinheiro**:
energia, royalty da GoodWe, fundo de marketing, taxa do meio de pagamento e o líquido do comerciante.

### Passo 10 · O franqueado vê o extrato (1,5 min) · franqueado com histórico
Janela anônima com **Franqueado**: painel e *Tarifas e financeiro*, com 90 dias de histórico. Uso por vaga contra o
mínimo de 2,3 h, payback, resultado do mês, tarifa por faixa (vale, normal e pico). A recarga que acabou de ser paga
já está no extrato do ponto novo.

### Passo 11 · A GoodWe vê royalties e a rede (1,5 min) · GoodWe
Em *Visão da rede*: faturamento por região, ranking de pontos, **royalties** (inclui a fatia da recarga que acabamos
de pagar), saúde da frota e o ecossistema solar instalado. Feche voltando à tese: a GoodWe ganha com a rede
crescendo, o comerciante ganha com a permanência.

## O que destacar em cada tela

| Tela | Destaque |
|---|---|
| Seja GoodWe | pré-análise da IA ao vivo; royalty só sobre a recarga; etapas claras até o ponto no ar |
| Homologação | a IA aprova ou reprova com motivo; vistoria; a decisão chega ao comerciante em tempo real |
| Meu ponto | pareamento do totem por código de 6 números; ponto só vai ao mapa depois de ativado |
| Mapa do motorista | vagas e preço ao vivo; passo a passo de como carregar |
| Totem | QR e código só depois que o cabo é conectado; visitante pode carregar sem app |
| Confirmar recarga | **preço travado** antes de começar |
| Controle de demanda | potência dividida entre as vagas dentro do limite da entrada; sol cobrindo parte |
| Pix e repartição | para onde vai cada real: energia, royalty, marketing, meio de pagamento, comerciante |
| Visão da rede | royalties, ranking, frota e solar de toda a rede |

## Plano B

- **Sem celular, ou QR que não abre:** na janela do motorista (`/motorista?tela=vitrine`, o celular emoldurado no
  notebook) toque em **Digitar código** e digite as 4 letras que o totem mostra.
- **Sem app:** no totem, **Carregar sem app**. Vira visitante e paga o Pix no próprio totem ao encerrar.
- **Vaga aparece "sem sinal":** o simulador parou. Rode `npm run simulador` e espere 20 segundos.
- **A recarga está lenta:** suba o `SIM_ACELERACAO` (20 ou 30) no `.env.local` e reinicie o simulador.
- **A internet caiu:** o app mostra a tela de falha e tenta de novo sozinho a cada 15 segundos; também tem o botão
  *Tentar agora*.
- **O código do QR venceu (10 minutos):** desconecte e conecte o carro de novo no totem para gerar outro.
- **Algo travou no meio:** `npm run demo:comerciante` volta a conta do comerciante ao início (apaga o ponto novo)
  e você recomeça do passo 1.
