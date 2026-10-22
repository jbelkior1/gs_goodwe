# Ponto W: contexto do projeto para escrever o roteiro de apresentação

## 1. O que é

O Ponto W é uma **rede de recarga de carro elétrico dentro de comércios**, no modelo de **franquia da GoodWe**. É o projeto do EV Challenge GoodWe × FIAP, 2º semestre de 2026.

- **A ideia:** uma vaga do estacionamento de um comércio (mercado, farmácia, shopping, academia, restaurante, posto) vira ponto de recarga. O motorista fica de 1 a 2 horas carregando e, nesse tempo, compra na loja.
- **O comércio** fica com o resultado da recarga e com tudo o que vende.
- **A GoodWe** fornece o carregador, o totem, o ecossistema solar (inversor, painéis, bateria) e a plataforma. Ela recebe royalty **só sobre a recarga, nunca sobre as vendas da loja**.
- **O que existe hoje:** um MVP funcional e publicado.
  - App: https://jbelkior1.github.io/gs_goodwe
  - Análise do local em 3D (GSVR): https://jbelkior1.github.io/gs_vr
- **Tecnologia:**
  - React + TypeScript.
  - Banco Supabase com tempo real: uma ação em um aparelho aparece nos outros em cerca de 1 segundo.
  - Um agente do ponto que faz o papel do carregador GoodWe (linha HCA G2). Ele abre a recarga, controla a potência, fecha a conta e manda sinal de vida.
  - Hospedagem no GitHub Pages.
- **Rede de demonstração no banco:**
  - 11 pontos em São Paulo, com marcas conhecidas usadas como exemplo (Graal, Pão de Açúcar, Carrefour, Shopping Eldorado, Drogasil, Smart Fit, Outback, Starbucks). São dados fictícios, sem parceria.
  - O ponto da apresentação é a **FIAP Aclimação**: 2 vagas, painéis solares e bateria GoodWe.
  - Cerca de 6 mil recargas de histórico em 90 dias.
- **A apresentação usa 4 aparelhos ao vivo e sincronizados:**
  - um celular (motorista);
  - um totem (tablet ou monitor na vaga);
  - um notebook do franqueado;
  - um notebook da GoodWe.
- **Palco:** existe uma tela com os 4 aparelhos lado a lado, ao vivo.
- **Sem login:** no modo de demonstração, nada precisa de conta. O totem já abre no ponto da FIAP Aclimação.

## 2. O fluxo completo em 11 passos

1. **Comerciante:** avalia o estacionamento em 3D pelo celular (GSVR) e pede a franquia.
2. **GoodWe:** analisa o pedido, com a nota da IA e as fotos, e aprova. O sistema cria o franqueado, o ponto e as vagas.
3. **Franqueado:** configura o ponto e o preço base do kWh.
4. **Franqueado:** liga o totem ao ponto, com um código de 6 números, e ativa o ponto. O ponto aparece no mapa.
5. **Motorista:** acha o ponto no mapa, com as vagas livres e o preço de agora.
6. **Carro conecta:** o totem mostra um QR e um código de 4 letras, válido por 10 minutos, com o preço travado.
7. **Motorista:** lê o QR ou digita o código, confere o mesmo preço do totem e inicia a recarga.
8. **Agente:** libera a potência. A recarga aparece ao vivo no celular, no totem, no franqueado e na GoodWe. O controle de demanda protege o disjuntor da loja.
9. **Motorista:** encerra e paga com Pix. O totem mostra o recibo e o carro sai.
10. **Franqueado:** vê a recarga no extrato, já dividida entre energia, GoodWe, Pix e comércio.
11. **GoodWe:** vê o royalty entrar e os números da rede subirem.

## 3. Seja GoodWe: o comerciante que quer virar franqueado

### Página da franquia

- **Abertura:** "Uma vaga do seu estacionamento vira ponto de recarga", com uma foto de antes e depois arrastável.
- **Rede ao vivo:** números reais da rede.
- **Como funciona:** as etapas do pedido até o ponto no ar.
- **Ganhos:** o painel real de uma unidade.
- **Os 3 formatos, com preço sugerido:**

| Formato | Vagas | Investimento | Taxa de franquia |
|---|---|---|---|
| Light | 1 vaga de 7 kW | R$ 20.500 | R$ 8.000 |
| Standard | 2 vagas de 7 kW | R$ 37.000 | R$ 14.000 |
| Hub | 4 vagas de 11 kW | R$ 78.500 | R$ 24.000 |

  A mensalidade da plataforma é de R$ 180. Todos esses valores aparecem como "sugerido, sujeito a ajuste".
- **Dúvidas frequentes.**

### Análise do local no GSVR: o grande diferencial, merece destaque

Funciona no navegador do celular, sem instalar nada.

- **Passo 1, a foto:** o comerciante fotografa o estacionamento, ou usa uma foto de exemplo.
- **Passo 2, a medida:**
  - Ele toca nos 4 cantos da área das vagas.
  - O sistema mede pela própria foto (lê a lente da câmera): frente, fundo e área. No exemplo: 8,0 m × 6,5 m, 52 m².
  - Diz na hora quais formatos cabem.
- **Passo 3, o comércio:** tipo de comércio, região, pessoas por dia, ligação elétrica e disjuntor.
- **Passo 4, o resultado:**
  - O **Ponto W aparece desenhado sobre a foto do estacionamento**, com uma régua de antes e depois.
  - As abas de formato mostram o que cabe. No exemplo: "Cabe um Ponto W Standard aqui", mas "O Hub não cabe: faltam 2 m de frente".
  - **Viabilidade:** uma nota de 0 a 100 (no exemplo, 87, "Aprovar") e o uso previsto de cada vaga (4,6 h por dia, contra a meta de 2,3 h).
  - **A conta da unidade:** resultado do mês e retorno do investimento.
- **Realidade virtual:**
  - O comerciante "entra" no Ponto W em 3D antes de ele existir: a fachada "Ponto W eletropostos inteligentes", os carros carregando e um painel com os números do ponto.
  - Dá para andar até o café e a loja.
  - Funciona com o giroscópio do celular ou com um óculos de VR.
- **"Enviar avaliação para a GoodWe":** a foto, o Ponto W projetado e as medidas voltam para o pedido de franquia. A GoodWe vê exatamente o que o comerciante viu.

### Pedido de franquia

- Formulário com a avaliação 3D anexada.
- Simulador de viabilidade: nota, uso previsto e resultado do mês.
- Depois de enviado, o comerciante acompanha o pedido numa linha do tempo, até o ponto entrar no ar.

## 4. Motorista: o app no celular

- **Mapa real de São Paulo:**
  - Cada ponto mostra as vagas livres, com cores para "com vaga", "ocupado" e "indisponível".
  - Mostra também o preço do kWh agora e o próximo preço.
  - Tem um passo a passo de como carregar ali.
- **Confirmar a recarga:**
  - O motorista lê o QR do totem ou digita o código de 4 letras. O código não usa caracteres que se confundem, como 0 e O ou 1 e I.
  - O app mostra o ponto, a vaga e o **preço travado, igual ao do totem**.
  - Explica o porquê do preço. Exemplos: "Horário de pico (+12%)", "Últimas vagas (+8%)", "Energia do sol do ponto (−2%)".
  - Ele escolhe o carro e pode informar a bateria e um limite em reais.
- **Minha recarga, ao vivo:** bateria (%), potência (kW), energia (kWh), custo até agora e tempo estimado para 100%.
- **Fim da recarga:**
  - Ele encerra e paga com Pix.
  - Recebe o recibo com "para onde vai o seu dinheiro".
- **Volt:** um assistente que responde dúvidas com os números da recarga em andamento.
- **Regras:**
  - Uma recarga por vez.
  - Se a página fechar, ela volta exatamente onde estava, porque o estado fica no banco.

## 5. Totem: o quiosque na vaga

Fica em modo quiosque, na vertical (1080×1920) ou na horizontal.

- **Espera:**
  - "Carregue seu elétrico aqui" e a recarga em 4 passos.
  - O **preço do kWh agora, com o motivo**, e o próximo preço.
  - Vagas livres e quanto da energia vem do sol e da bateria GoodWe.
- **Carro conectado:** QR grande, código de 4 letras e contagem de 10 minutos, com o preço travado.
- **Carregando:** bateria, valor até agora, kW, kWh e tempo para 100%. São os mesmos números do celular, para ver de longe.
- **Pagamento:** "Pague com Pix" mostra o QR e o valor. "Pagamento confirmado" mostra o recibo e "pode desconectar o cabo".
- **Quem não tem o app:** "Sem app? Carregue e pague aqui com Pix".
- **Outros estados:** código expirado, sem sinal do carregador, sem internet, vaga em manutenção.
- **Modo quiosque:**
  - Volta ao início depois de 45 s sem toque.
  - A tela fica sempre acesa e não há zoom.
  - O menu de manutenção abre com 5 toques no logo.
- **Pareamento:** um totem novo mostra 6 números para o franqueado ligá-lo ao ponto. Na demonstração, o totem já abre no ponto da FIAP Aclimação.
- **Botões de demonstração:** "Simular carro conectado" e "Simular retirada do cabo".

## 6. Franqueado: o painel do comércio (notebook)

- **Painel:**
  - Receita, resultado do comércio, energia entregue, recargas e uso por vaga contra a meta de 2,3 h por dia.
  - Retorno do investimento (payback).
  - Comparação com o período anterior: mês, 7 dias ou 30 dias.
  - Receita por dia.
  - "Agora no ponto": as vagas ao vivo.
  - "Precisa da sua atenção": recomendações e alertas.
  - Para um ponto novo, o checklist de ativação.
- **Controle de demanda:**
  - Uso da entrada elétrica: normal até 85%, atenção até 92%.
  - Potência liberada para cada vaga e carga do comércio ao longo do dia.
  - Divide a potência entre a loja e os carros **sem desarmar o disjuntor**.
- **Tarifas e financeiro:**
  - Preço de cada hora do dia, com piso e teto, e margem por kWh.
  - Repartição do mês e extrato de cada cobrança: bruto, energia, GoodWe (8%), Pix e líquido.
- **Meu ponto e totem:**
  - Dados do local.
  - Preço base: o sistema sugere e recusa valores abaixo do custo.
  - Parear o totem pelo código, ativar o ponto e fazer a manutenção das vagas.

## 7. GoodWe: a franqueadora (notebook)

- **Visão da rede:**
  - Pontos operando, receita da rede e receita da GoodWe (royalties, fundo e plataforma), com projeção mensal e anual.
  - Energia entregue, recargas e uso médio por vaga.
  - **"Agora na rede":**
    - recargas em andamento;
    - potência somada;
    - valor correndo;
    - carros esperando o QR;
    - "pagas na última meia hora", com a parte da GoodWe.
  - Mapa da rede, alertas acionáveis (pedido parado, ponto abaixo da meta, vaga sem sinal) e a tabela de pontos.
- **Homologação:**
  - A fila de pedidos de franquia, com a **nota da IA**. Os pesos: fluxo de pessoas 30%, densidade de carros elétricos na região 28%, aderência do segmento 24%, capacidade elétrica 18%.
  - Uso previsto contra a meta, parecer, previsão financeira e **as fotos da avaliação 3D do GSVR**.
  - Decisões: aprovar, pedir vistoria ou reprovar.
  - Ao aprovar, a conta do comerciante vira franqueado na hora.
  - **Por que existe:** a unidade só se paga acima de cerca de 2,3 h de uso por dia por vaga. Aprovar um local fraco frustraria o franqueado e mancharia a marca.

## 8. Preço, margem e modelo de negócio

Todos os valores abaixo são sugeridos e ajustáveis.

- **Tarifa dinâmica:** preço = preço base × faixa de horário × últimas vagas − energia do sol.
  - Vale (22h às 8h): −10%.
  - Pico (17h às 19h, dias úteis): +12%.
  - Últimas vagas: até +8%.
  - Sol do ponto: até −8%.
  - Limites: nunca abaixo de 85% da base nem do custo + taxas + R$ 0,20; nunca acima de 130% da base.
  - O preço fica travado por 10 minutos e vai inteiro para a cobrança.
- **Preço base sugerido em São Paulo: R$ 1,90 por kWh.** A conta: energia de R$ 0,85 mais margem alvo de R$ 0,85, divididas por (1 − 9,5% de taxas).
- **Para onde vai cada R$ 1,90:**

| Parte | Valor |
|---|---|
| Energia | R$ 0,85 |
| GoodWe (royalty 6% + fundo de marketing 2%) | R$ 0,15 |
| Tarifa do Pix (1,5%) | R$ 0,03 |
| **Fica com o comércio** | **R$ 0,87 (46%)** |

  O royalty sobre as vendas da loja é 0%.
- **Margem por momento do dia:** 40% no vale, 46% no horário normal, 51% no pico.
- **Uma recarga média** (8,4 kWh, cerca de 1h15 parado): o motorista paga R$ 15,88. O comércio fica com R$ 7,26 da recarga, mais cerca de R$ 4,90 de margem na loja.
- **Por mês, com cada vaga usada 3,5 h por dia (cenário típico):**

| Formato | Resultado do comércio por mês | Retorno do investimento |
|---|---|---|
| Light | R$ 844 | 24 meses |
| Standard | R$ 1.868 | 20 meses |
| Hub | R$ 3.916 | 20 meses |

  A GoodWe recebe de R$ 260 a R$ 501 por mês por ponto (royalty + mensalidade), mais a taxa de franquia.
- **Premissas:**
  - energia a R$ 0,85/kWh em São Paulo;
  - metade dos motoristas compra na loja, com ticket de R$ 28 e margem de 35%.
- **Pendente:** ICMS e tributos da venda de recarga precisam de análise de um tributarista.

## 9. O que é real e o que é simulado

- **Real:**
  - as telas, o banco e o tempo real;
  - o pedido de franquia, a análise 3D e o envio das fotos;
  - a aprovação e o pareamento do totem;
  - o preço travado, a cobrança e a repartição do dinheiro.
- **Simulado:**
  - o carregador físico (o agente faz o papel dele);
  - o carro conectando ("Simular carro conectado");
  - o pagamento Pix ("Simular pagamento").
- **Próximo passo:** o carregador GoodWe de verdade toma o lugar do agente e as telas não mudam.

## 10. Diferenciais para destacar no roteiro

1. **Análise do local por foto e realidade virtual.** O comerciante vê o Ponto W no próprio estacionamento, sabe se cabe, quanto rende e entra nele em 3D antes de investir.
2. **Tudo ao vivo e sincronizado.** Celular, totem, franqueado e GoodWe mostram a mesma recarga no mesmo instante.
3. **Preço transparente e justo.** O motorista vê o preço antes, com o motivo, e ele fica travado. O comércio nunca vende abaixo do custo.
4. **Dinheiro repartido na hora.** Energia, GoodWe, Pix e comércio, em cada recarga.
5. **Segurança elétrica.** O controle de demanda divide a potência sem desarmar o disjuntor da loja.
6. **IA na homologação.** Só entra na rede o ponto que tem uso para se pagar.
7. **Ecossistema GoodWe.** Sol e bateria baixam o custo da energia e aparecem no preço.
8. **A recarga traz o cliente, e a venda é sua.** O royalty incide só sobre a recarga.

## 11. Links da demonstração

Todos começam com `https://jbelkior1.github.io/gs_goodwe`.

| Aparelho | Link |
|---|---|
| Totem | `/totem?ponto=p-011&tela=cheia` |
| Celular do motorista | `/motorista?tela=cheia` |
| Notebook do franqueado | `/franqueado?ponto=p-011&tela=cheia` |
| Notebook da GoodWe | `/goodwe?tela=cheia` |
| As 4 telas lado a lado | `/demo?vista=palco` |
| Página da franquia | `/seja-goodwe` |

Para o GSVR, entrar pelo botão "Avaliar meu estacionamento em 3D" da página Seja GoodWe.
