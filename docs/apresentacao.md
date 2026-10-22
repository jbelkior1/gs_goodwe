# Roteiro de apresentação para a GoodWe

Duração: **15 a 20 minutos**. A demonstração segue o fluxograma do produto, do pedido de franquia ao
dinheiro chegando na GoodWe. A tese que sustenta tudo: **o carregador prende o cliente por 1 a 2 horas;
o que a rede vende é permanência, que vira venda dentro do comércio.**

A apresentação usa **quatro aparelhos, todos ao vivo e sincronizados**: um **celular** (o motorista), um **totem**
(tablet ou monitor), o **notebook do franqueado** e o **notebook da GoodWe**. O motorista pega o código no totem,
inicia a recarga e, no mesmo instante, o franqueado vê a vaga em uso (quem, kW, kWh, R$, tarifa) com o controle de
demanda, e a GoodWe vê a recarga na visão da rede. Para apresentar o sistema inteiro numa tela só, de forma
didática, existe a **central da demonstração** (`/demo`): o fluxograma ao vivo, os links de cada aparelho e o Palco.

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
- No `.env.local`: `VITE_MODO_DEMO=true` (liga o modo demonstração: botões de conta no login, links `?conta=`, a
  central `/demo` e o guia), `VITE_DEMO_SENHA` (a senha das contas de demonstração, a mesma `DEMO_SENHA`) e
  `VITE_URL_PUBLICA=http://<IP-do-notebook>:5191`. O IP aparece em `ipconfig` (Endereço IPv4 do Wi-Fi). É ele que
  vai dentro do QR do totem e dos QRs da central: o celular não abre `localhost`.
- Notebook e celular na **mesma rede Wi-Fi**. Se o Wi-Fi do local isola os aparelhos, conecte o notebook ao
  hotspot do celular (o IP do notebook muda: ajuste o `VITE_URL_PUBLICA` e reinicie o `npm run dev:rede`).
- Para o celular abrir o QR, o app precisa ser aberto **pelo IP da rede**: `npm run dev:rede` e
  `VITE_URL_PUBLICA=http://<IP>:5191` no `.env.local` (reinicie o `npm run dev:rede` depois de mudar).
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

### 3. Os quatro aparelhos e os links diretos

Cada aparelho abre direto no ambiente certo por um link. Troque `<IP>` pelo IP do notebook na rede e `<id>` pelo id do
ponto da demonstração (a central `/demo` mostra o link já pronto, com QR; no seed atual o ponto do franqueado de
demonstração é o `p-002`, Pão de Açúcar Moema).

| Aparelho | Link direto | Conta |
|---|---|---|
| Celular (motorista) | `http://<IP>:5191/motorista?tela=cheia&conta=motorista` | `motorista@pontow.app` |
| Totem (tablet ou monitor) | `http://<IP>:5191/totem?ponto=<id>&tela=cheia` | sem login |
| Notebook do franqueado | `http://<IP>:5191/franqueado?ponto=<id>&tela=cheia&conta=franqueado` | `franqueado@pontow.app` |
| Notebook da GoodWe | `http://<IP>:5191/goodwe?tela=cheia&conta=goodwe` | `goodwe@pontow.app` |

O que cada parâmetro faz:

- **`?conta=goodwe|franqueado|motorista|comerciante`**: só no modo demonstração. Entra sozinho com a conta de
  demonstração (com a `VITE_DEMO_SENHA`), mostra "Entrando como …" e, ao terminar, tira o parâmetro do endereço e
  mantém o resto. Se já está nessa conta, não faz nada. Se falhar, a tela mostra o erro com "Tentar de novo". Também
  funciona em qualquer rota (por exemplo `/seja-goodwe?conta=comerciante` entra como comerciante).
- **`?ponto=<id>`** nas rotas do franqueado (`/franqueado`, `/franqueado/demanda`, `/franqueado/financeiro`,
  `/franqueado/ponto`) escolhe o ponto. O franqueado logado só vê os pontos dele: um `?ponto=` de outro franqueado é
  ignorado. Nas rotas da GoodWe e do motorista o `?ponto=` só diz ao guia qual ponto acompanhar. No totem, o
  `?ponto=` prende o aparelho àquele ponto, e ele lembra.
- **`?tela=cheia`**: só o ambiente do aparelho, como no aparelho real (sem a barra de painéis da vitrine).
- **`?guia=1`** liga o guia didático naquele aparelho e guarda a escolha; **`?guia=0`** desliga.
- **`&embed=1`**: usado só pelo Palco (tela embutida, só para ver; ignora o `?conta=`).

Abrir a aba certa: troque o caminho antes do `?`. Franqueado: `/franqueado/demanda`, `/franqueado/financeiro`,
`/franqueado/ponto`. GoodWe: `/goodwe/homologacao`. Celular: `/motorista/vincular` (digitar código),
`/motorista/recarga`, `/motorista/assistente`. A central tem um botão por aba e atualiza o link e o QR.

**Logins diferentes ao mesmo tempo num mesmo computador pedem origens diferentes** (`http://localhost:5191`,
`http://goodwe.localhost:5191`, `http://totem.localhost:5191`) **ou janelas anônimas**: o login fica guardado por
endereço. Em **aparelhos separados** (o caso da apresentação) não há conflito. O botão **Abrir** da central já usa
`goodwe.localhost` e `totem.localhost` quando a central está em `localhost`.

### 4. A central da demonstração (`/demo`)

Abra `http://localhost:5191/demo` (ou o atalho **Central da demonstração** no portal e na barra *Demonstração* da
vitrine). Ela reúne:

- **O ponto da demonstração**: um seletor com os pontos em operação (padrão: o ponto do franqueado de demonstração) e,
  separados, os que estão em instalação. Todos os links acompanham o ponto escolhido.
- **O fluxograma em 11 passos, ao vivo**: o passo atual vem da base e muda sozinho. Sessão aberta no ponto = passos 6 e
  7; autenticada ou carregando = 8; encerrando ou a pagar = 9; Pix recém-pago = 10 e 11; ponto em instalação = 3 e 4;
  pedido novo em análise ou vistoria = 2; ponto no ar sem recarga = 5. Embaixo do passo, o que está acontecendo (vaga,
  quem, kW, kWh, R$, preço travado, uso da entrada elétrica).
- **Os quatro aparelhos**: para que serve cada um, o link direto de cada aba (copiar), o QR do link e o botão
  **Abrir**.
- **O Palco** (`/demo?vista=palco`): as quatro telas ao vivo lado a lado em iframes escalados (celular 390×844, totem
  1080×1920, franqueado e GoodWe 1440×900). Elas dividem o login do navegador, não pedem a conta do papel (mostram o
  painel do ponto e da rede em leitura) e não trocam a conta de ninguém. Por padrão são só para ver; a caixa **Tocar nas
  telas** libera o toque, e **Ampliar** mostra uma tela só. O celular do Palco acompanha a recarga sozinho (mapa
  enquanto não há recarga, **Minha recarga** quando ela existe).
- **O interruptor do guia didático**: com ele ligado, os links já levam `&guia=1`.

### 5. O guia didático (`?guia=1`)

Uma faixa fina em cada aparelho que diz o passo do fluxograma e o que fazer agora naquele aparelho, lido da base ao
vivo. Exemplos: no totem, "Passo 6 · O carro conectou: o totem mostra o QR e o código"; no celular, "Passo 7 · Leia o QR
do totem ou digite o código"; no franqueado, "Passo 8 · A vaga 1 está carregando: veja kW e R$ ao vivo"; na GoodWe,
"Passo 11 · A recarga já entrou no faturamento da rede". Liga com `?guia=1` (ou pelo interruptor da central), desliga com
`?guia=0`, e cada aparelho lembra a escolha. Ela fica no topo, fora da área de toque (no totem, a tela desce pela altura
da faixa), e não aparece no Palco.

### 6. Checklist (10 itens, confira antes de abrir a sala)

1. "Confirm email" desligado no Supabase.
2. `VITE_URL_PUBLICA` com o IP certo do notebook (se o Wi-Fi mudou, o IP mudou).
3. `npm run demo:comerciante` rodado hoje (a conta do comerciante está no início, sem pedido).
4. `npm run demo:atualizar` rodado hoje (os gráficos de "hoje" e "7 dias" têm dado).
5. `npm run simulador` aberto, escrevendo no terminal a cada poucos segundos.
6. `npm run dev:rede` aberto e `http://localhost:5191` abrindo o portal.
7. O celular abre `http://<IP>:5191/motorista` pela rede (se não abrir, é firewall ou Wi-Fi isolado).
8. Os quatro aparelhos abertos nos links da seção 3 (em computadores diferentes ou em origens diferentes), na ordem em
   que serão usados. O guia ligado (`&guia=1`), se quiser a faixa didática.
9. O totem em tela cheia mostrando o **código de 6 números** (ainda não pareado: `http://<IP>:5191/totem?tela=cheia`,
   sem `?ponto=`, num navegador que ainda não guardou ponto algum).
10. Um ensaio completo feito, e `npm run demo:comerciante` rodado de novo para zerar. Bateria carregada, notificações
    desligadas, brilho no máximo.

## Roteiro (cada bloco com o tempo e o que dizer)

### Abertura (1 min) · portal
Abra `http://localhost:5191`. Quatro portas, quatro públicos: motorista, totem, franqueado e GoodWe. Mesma
plataforma, poderes diferentes. "O que vamos ver é a vida de um ponto, do pedido ao dinheiro."
Se for usar o telão, deixe a central (`/demo`) aberta: o fluxograma mostra, ao vivo, em qual dos 11 passos estamos.

### Passo 1 · Pedido de franquia (2 min) · notebook do franqueado, na conta do comerciante
Abra `http://<IP>:5191/seja-goodwe?conta=comerciante` (entra como **Comerciante**). Mostre a proposta: o cliente fica 1 a 2 horas e compra na loja;
**royalty só sobre a recarga**, nunca sobre as vendas.
- Escolha o formato (Light, Standard ou Hub) e veja capex e taxa.
- **Pré-análise da IA ao vivo:** mude a carga elétrica e o fluxo de pessoas e veja o score e as horas de uso por vaga
  mudarem. Mostre uma entrada elétrica fraca reprovando.
- Toque em **Preencher com um exemplo** (só aparece no modo demonstração) e **Enviar solicitação**. Desça até
  *Acompanhe o seu pedido*: a linha do tempo começa em "Análise da GoodWe".

### Passo 2 · A GoodWe aprova (2 min) · notebook da GoodWe
Abra `http://<IP>:5191/goodwe/homologacao?tela=cheia&conta=goodwe` (entra como **GoodWe**, já em *Homologação*). Abra o
pedido novo: score da IA, uso previsto, parecer. Peça a
**vistoria** e depois **aprove**.
- Destaque: a IA decide o que importa (aprovar um ponto fraco frustra o franqueado e suja a marca).
- Volte ao notebook do comerciante: a linha do tempo andou sozinha (tempo real) e agora oferece **Ir para o meu ponto**.
  A mesma conta virou franqueada do ponto que acabou de ser criado.

### Passos 3 e 4 · Configurar o ponto e parear o totem (3 min) · notebook do franqueado e totem
No notebook, toque em **Ir para o meu ponto**: em *Meu ponto*, o ponto está **em instalação**. Defina as vagas, a tarifa
base.
- Olhe para o **totem** (`http://<IP>:5191/totem?tela=cheia`, sem `?ponto=`): ele mostra um **código de 6 números**.
  Digite no painel do franqueado para parear. A tela do totem passa a mostrar o ponto.
- Clique em **Ativar ponto**. Ele aparece no mapa do motorista.
- Atenção: nesse notebook, siga pela mesma conta (o comerciante virou o franqueado do ponto novo). **Não abra agora o
  link com `?conta=franqueado`**: ele entraria na conta do franqueado de demonstração, que opera outro ponto.

### Passo 5 · O motorista acha o ponto (1 min) · celular
No celular (`http://<IP>:5191/motorista?tela=cheia&conta=motorista`), o ponto novo aparece no mapa. Toque nele: endereço, **vagas livres agora**, **preço do kWh agora** e o passo
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
- Em *Controle de demanda* (notebook do franqueado, `/franqueado/demanda`): a entrada elétrica do comércio, a carga da loja e a recarga.
  Conecte um segundo carro e mostre a potência sendo dividida sem estourar o disjuntor.
- Destaque: o controle de demanda protege a conta de luz do comerciante.

### Passo 9 · Encerrar e pagar (1,5 min) · celular
**Encerrar** no app. A conta fecha e aparece o **Pix**. Pague (simulado). Mostre a **repartição do dinheiro**:
energia, royalty da GoodWe, fundo de marketing, taxa do meio de pagamento e o líquido do comerciante.

### Passo 10 · O franqueado vê o extrato (1,5 min) · notebook do franqueado
No notebook de quem opera **o ponto que recebeu a recarga** (o franqueado do ponto novo, se foi nele que o motorista
carregou), abra *Tarifas e financeiro* (`/franqueado/financeiro`): a recarga que acabou de ser paga está no extrato
**desse ponto**, com a repartição do valor. O ponto novo começa zerado.
- O **histórico de 90 dias** (uso por vaga contra o mínimo de 2,3 h, payback, resultado do mês, tarifa por faixa: vale,
  normal e pico) é de **toda a rede de demonstração**: aparece no ponto do franqueado de demonstração e na visão da
  GoodWe, não no ponto novo. Para mostrá-lo, abra em outra origem ou em janela anônima
  `http://<IP>:5191/franqueado?ponto=<id>&tela=cheia&conta=franqueado` (o `<id>` é o do ponto de demonstração).
- Se a recarga foi feita no ponto de demonstração, o extrato novo e o histórico aparecem juntos, no mesmo painel.

### Passo 11 · A GoodWe vê royalties e a rede (1,5 min) · notebook da GoodWe
Em *Visão da rede* (`/goodwe`): faturamento por região, ranking de pontos, **royalties** (inclui a fatia da recarga que acabamos
de pagar), saúde da frota e a prospecção de novos locais. Feche voltando à tese: a GoodWe ganha com a rede
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
| Controle de demanda | potência dividida entre as vagas dentro do limite da entrada |
| Pix e repartição | para onde vai cada real: energia, royalty, marketing, meio de pagamento, comerciante |
| Visão da rede | royalties, ranking e frota de toda a rede |
| Central `/demo` | fluxograma de 11 passos ao vivo, link e QR de cada aparelho, Palco com as quatro telas |

## Plano B

- **Sem os quatro aparelhos:** use o Palco (`/demo?vista=palco`) num notebook ou telão: as quatro telas ao vivo lado a
  lado. Marque **Tocar nas telas** para operar por ali (por exemplo, **Simular carro conectado** no totem).
- **O link com `?conta=` não entrou:** a tela mostra o motivo com **Tentar de novo**. Confira a `VITE_DEMO_SENHA` no
  `.env.local` (reinicie o `npm run dev:rede` depois de mudar) ou entre pelos botões de *Demonstração* em `/entrar`.
- **"reconectando · dados até HH:MM" em âmbar no painel:** o canal de tempo real caiu; os números ficam parados naquele
  horário e voltam sozinhos (ele relê tudo ao reconectar).
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
