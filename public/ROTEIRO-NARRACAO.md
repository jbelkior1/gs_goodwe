# Roteiro de narração — animação do bloco 5

Para gerar a voz em uma IA de dublagem (ElevenLabs, Play.ht, Azure TTS…) e
sincronizar com `animacao.html`.

- **Duração alvo:** 31 segundos
- **Voz sugerida:** masculina ou feminina adulta, tom **institucional confiante**,
  não locutor de propaganda. Velocidade **normal a 5% mais lenta**.
- **Deixa antes de rodar:** o integrante fala *“E, para fechar, quem explica onde
  está o dinheiro é a própria IA do Ponto W.”* → só então começa o vídeo.

---

## 1. Texto corrido (cole em qualquer TTS)

> Como isso vira negócio? … Franquia.
>
> A GoodWe entra com o carregador, a plataforma e a marca. … O comércio entra com o ponto e a energia.
>
> Royalty de seis por cento … só sobre a recarga. … As vendas da loja são cem por cento do franqueado.
>
> E a recarga traz gente para dentro. … Mais quatro por cento de fluxo. … Mais cinco por cento de receita.
>
> Antes de assinar, a inteligência calcula: … acima de duas horas e vinte por dia, o ponto se paga. … Ponto fraco, a gente reprova.
>
> Seu comércio recebe a GoodWe. … Seu cliente recebe tempo e conforto. … E o seu caixa recebe o resto.
>
> O carregador deixa de ser produto … e vira rede.

> **As reticências são pausas de respiração.** Em quase todo TTS elas já criam a
> pausa sozinhas. Se a sua ferramenta ignorar, use a versão SSML abaixo.

---

## 2. Versão SSML (pausas exatas)

```xml
<speak>
  <prosody rate="-5%">
    Como isso vira negócio?<break time="450ms"/>
    <emphasis level="strong">Franquia.</emphasis>
    <break time="900ms"/>

    A GoodWe entra com o carregador, a plataforma e a marca.<break time="350ms"/>
    O comércio entra com o ponto e a energia.
    <break time="850ms"/>

    Royalty de <emphasis level="moderate">seis por cento</emphasis><break time="300ms"/>
    só sobre a recarga.<break time="450ms"/>
    As vendas da loja são <emphasis level="strong">cem por cento</emphasis> do franqueado.
    <break time="800ms"/>

    E a recarga traz gente para dentro.<break time="350ms"/>
    Mais <emphasis level="moderate">quatro por cento</emphasis> de fluxo.<break time="300ms"/>
    Mais <emphasis level="moderate">cinco por cento</emphasis> de receita.
    <break time="800ms"/>

    Antes de assinar, a inteligência calcula:<break time="350ms"/>
    acima de duas horas e vinte por dia, o ponto se paga.<break time="400ms"/>
    Ponto fraco, a gente <emphasis level="strong">reprova</emphasis>.
    <break time="900ms"/>

    Seu comércio recebe a <emphasis level="moderate">GoodWe</emphasis>.<break time="500ms"/>
    Seu cliente recebe <emphasis level="moderate">tempo e conforto</emphasis>.<break time="500ms"/>
    E o seu caixa recebe <emphasis level="strong">o resto</emphasis>.
    <break time="700ms"/>

    O carregador deixa de ser produto<break time="350ms"/>
    e vira <emphasis level="strong">rede</emphasis>.
  </prosody>
</speak>
```

---

## 3. Mapa de sincronia (corte por corte)

| Cena | Entra em | Sai em | O que aparece | Fala |
|---|---|---|---|---|
| 1 | 0,0 s | 4,2 s | Selo da IA · “Como isso vira negócio?” | *Como isso vira negócio? … Franquia.* |
| 2 | 4,2 s | 9,4 s | Dois cards: GoodWe × Comércio | *A GoodWe entra com o carregador… O comércio, com o ponto e a energia.* |
| 3 | 9,4 s | 14,8 s | Caixa vermelha 6% × caixa verde 0% | *Royalty de seis por cento… cem por cento do franqueado.* |
| 4 | 14,8 s | 20,4 s | +4% · +5% · US$ 1.478 + fontes | *E a recarga traz gente para dentro…* |
| 5 | 20,4 s | 25,2 s | Medidor enchendo até passar do limiar | *Antes de assinar, a inteligência calcula…* |
| 6 | 25,2 s | 31,0 s | As três linhas + “vira rede” | *Seu comércio recebe a GoodWe…* |

**Ênfases que não podem se perder:** *Franquia* · *cem por cento do franqueado* ·
*quatro* e *cinco por cento* · *reprova* · *o resto* · *rede*.

---

## 4. Como juntar voz e imagem

**Caminho simples (sem editor):** abra `animacao.html` em tela cheia e toque o
áudio ao lado. Como os cortes são por tempo, casa sozinho. Se atrasar, aperte
**espaço** para pausar e **→** para pular cena.

**Caminho de vídeo:** grave a tela rodando a animação (Xbox Game Bar: `Win + G`,
ou OBS), depois junte o áudio no CapCut / Premiere / DaVinci. Alinhe pelo primeiro
“Franquia.” — é o marco mais fácil de achar na forma de onda.

> Se a voz gerada ficar mais longa ou mais curta que 31 s, ajuste os tempos no
> array `T` dentro de `animacao.html` (linha ~150). São seis números, um por cena.
