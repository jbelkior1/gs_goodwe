# Roteiro do vídeo — Sprint 4 (DSA) · Ponto W

**Duração-alvo: 7 min 15 s** (limite 5 a 8). As falas abaixo foram medidas a ~2,5 palavras por segundo (ritmo de
narração normal). Se o ensaio passar de 7:40, corte primeiro o passo 3.3 da demonstração e a segunda frase da
seção 9.

> Os arquivos, funções, valores e comparações citados nas falas foram conferidos no sistema rodando
> (backend em `backend/pontow/`, tela em `/sessoes`), partindo dos dados zerados (botão de reset abaixo).
> Se o grupo fizer mais cliques que o roteiro, os números mudam um pouco: leiam o que estiver na tela.

## Quem fala o quê

A regra da Sprint: **todos aparecem e cada um faz pelo menos uma parte técnica**.

| Bloco | Tempo | Quem |
|---|---|---|
| 1. Identificação | 0:00–0:22 | Thiago |
| 2. Problema e evolução | 0:22–1:07 | Thiago |
| 3. Demonstração | 1:07–2:57 | **João Pedro** |
| 4. Estrutura de dados | 2:57–3:50 | **Gabriel** |
| 5. Busca | 3:50–4:42 | **João Victor** |
| 6. Ordenação | 4:42–5:37 | **Sammy** |
| 7. Complexidade | 5:37–6:25 | **João Victor** |
| 8. Integração | 6:25–6:50 | **Thiago** |
| 9. Considerações finais | 6:50–7:15 | Gabriel |

Em negrito, as partes técnicas: todos os cinco têm pelo menos uma. A distribuição é uma sugestão; troquem
à vontade, desde que ninguém fique sem parte técnica.

## Antes de gravar

- [ ] Backend rodando, com o terminal visível (veja `backend/README.md`):
  `cd backend` → `uv venv` → `uv pip install -r requirements.txt` → `uv run uvicorn pontow.api:app --port 8000`.
- [ ] Dados zerados (200 sessões de exemplo): abra `http://localhost:8000/docs`, rota `POST /reset` → *Try it out*
  → *Execute*. Faça isso logo antes de gravar a demonstração.
- [ ] App rodando (`npm run dev`) e aberto em `http://localhost:5173/sessoes`.
- [ ] Navegador com zoom de 125%; VS Code com fonte 18 ou maior; notificações desligadas.
- [ ] Arquivos abertos em abas, já na função certa: `modelo.py`, `repositorio.py`, `busca.py`, `ordenacao.py`.
- [ ] Cenas no OBS (ou outro gravador):
  1. **Slide** de abertura;
  2. **Navegador + terminal do Python lado a lado** (é isso que prova a integração);
  3. **VS Code** em tela cheia.
- [ ] Dica: cada integrante grava a própria parte (tela + voz) e alguém junta tudo na edição. Webcam
  num canto é opcional, mas ajuda a mostrar quem está falando.

---

## 1. Identificação · 0:00–0:22 · Thiago

**Tela:** slide de abertura.

```
Data Structures and Algorithms · Turma 1CCPO
Ponto W — Sistema de Gerenciamento de Recargas
EV Challenge GoodWe × FIAP · Sprint 4

Thiago de Oliveira Coelho Souza — RM 568783
João Pedro Pereira Teixeira — RM 569937
Gabriel Pedro de Souza — RM 571995
João Victor Belchior Domingues Leite — RM 572478
Sammy de Moura Sato — RM 569182
```

> Olá! Este é o vídeo da Sprint 4 de Data Structures and Algorithms, turma 1CCPO. O projeto é o **Ponto W**,
> um sistema de gerenciamento de recargas de carros elétricos, criado para o EV Challenge GoodWe e FIAP. O
> grupo: Thiago Souza, João Pedro Teixeira, Gabriel de Souza, João Victor Leite e Sammy Sato — os RMs estão
> na tela.

---

## 2. Problema, evolução e interface · 0:22–1:07 · Thiago

**Tela:** o portal do Ponto W por 5 segundos e, em seguida, a tela **Sessões** (`/sessoes`).

> Um carregador instalado num comércio, sozinho, não vira negócio: falta quem registre cada recarga,
> defina o preço do kWh, calcule quanto o motorista paga e divida o dinheiro entre energia, GoodWe, Pix e
> comércio. O Ponto W faz isso. Cada recarga é uma **sessão**: começa quando o carro conecta, com o preço
> travado, e termina com a energia entregue, o valor e a repartição.
>
> Nas primeiras Sprints, modelamos o problema e criamos as telas; depois, ligamos tudo a um banco em tempo
> real. Nesta Sprint, levamos o núcleo das sessões para um **backend em Python**, com nossas próprias
> estruturas de dados, busca e ordenação. O usuário usa uma **interface web**, a tela de Sessões, que
> conversa com essa API.

*(Ajustem a frase da evolução ao que cada Sprint realmente entregou.)*

---

## 3. Demonstração · 1:07–2:57 · João Pedro

**Tela:** navegador (`/sessoes`) à esquerda, **terminal do Python** à direita. A cada clique aparece uma
linha no terminal (`POST /sessoes 201`, `GET /sessoes/ordenar 200`...). Deixe isso visível o tempo todo.

### 3.1 Iniciar uma sessão (1:07–1:27)
**Ação:** aba *Nova recarga* → FIAP Aclimação, vaga 1, Ana Souza, BYD Dolphin, início hoje às **18:00** →
**Iniciar**.

> À esquerda, a nossa interface; à direita, o servidor Python. Vou iniciar uma recarga na FIAP Aclimação,
> vaga 1, às seis da tarde. Ao clicar em Iniciar, aparece no terminal o POST: o Python calculou a tarifa e
> travou o preço em **R$ 2,13 por kWh** — horário de pico, 12% acima do preço base de R$ 1,90.

### 3.2 Encerrar e calcular a tarifação (1:27–1:47)
**Ação:** na sessão aberta, **Encerrar** com **12 kWh**. Mostrar o valor e a repartição.

> Encerro com 12 kWh entregues. O backend multiplica a energia pelo preço travado e reparte o valor:
> custo da energia, royalty e fundo da GoodWe, taxa do Pix e o que fica com o comércio.

### 3.3 Várias sessões armazenadas (1:47–1:57)
**Ação:** iniciar outra às **02:00** com outro motorista. Apontar o contador de sessões.

> Mais uma, de madrugada: o preço cai para **R$ 1,71**, horário de vale. O sistema já guarda mais de 200
> sessões.

### 3.4 Listagem e busca (1:57–2:17)
**Ação:** aba *Sessões* → tabela. Buscar **42** → selo "busca binária · 8 comparações". Buscar **Souza** →
selo "busca linear · 202 comparações" (acha a Ana Souza do passo 3.1).

> Aqui estão todas as sessões. Busco a sessão 42 pelo número: busca binária, só 8 comparações. Agora pelo
> sobrenome Souza: busca linear, que passou pelas 202 sessões.

### 3.5 Ordenação (2:17–2:37)
**Ação:** ordenar por **valor, decrescente, merge sort** → depois **energia, crescente** → depois trocar
para **insertion sort** e apontar o número de comparações.

> Ordeno por valor, do maior para o menor, com o nosso Merge Sort. Agora por energia, do menor para o
> maior. Se eu trocar para o Insertion Sort, a ordem é a mesma — mas foram cerca de 10 mil comparações,
> contra 1.300 do Merge Sort.

### 3.6 Estatísticas e relatório (2:37–2:57)
**Ação:** aba *Estatísticas* → aba *Relatório* → **Baixar CSV**.

> Nas estatísticas, o Python calcula total de sessões, energia, receita, ticket médio e duração média, e
> separa por ponto e por faixa de horário. E o relatório final traz o resumo do período, a repartição do
> dinheiro e as cinco maiores recargas — também em CSV.

---

## 4. Estrutura dos dados em Python · 2:57–3:50 · Gabriel

**Tela:** VS Code em `backend/pontow/modelo.py` (a `dataclass`) e depois `repositorio.py` (a lista, o
`append` e o `salvar`).

> Uma sessão é um objeto da **dataclass `SessaoRecarga`**. Ela guarda número, ponto, vaga, motorista,
> veículo, início e fim, a tarifa travada, a faixa de horário, a energia, o valor e o estado. Escolhemos a
> dataclass porque toda sessão tem os mesmos campos, com tipo definido: o código fica legível e ela vira
> dicionário e JSON numa linha.
>
> As sessões ficam numa **lista** dentro do `RepositorioSessoes`. Uma nova entra no fim, com `append`, e o
> número é sequencial — então a lista já fica em ordem de número, o que a busca binária vai usar. A cada
> mudança, a lista é salva num arquivo JSON. Nas estatísticas usamos **dicionários** para agrupar por
> ponto.
>
> O caminho: a tela envia um JSON, o FastAPI transforma em `SessaoRecarga`, o repositório guarda na lista e
> a resposta volta em JSON.

---

## 5. Algoritmo de busca · 3:50–4:42 · João Victor

**Tela:** `backend/pontow/busca.py` — primeiro `busca_binaria_por_id`, depois `busca_linear`. Destaque o
`while`, o cálculo do `meio` e os dois `return`.

> A busca principal é a **binária**, pelo número da sessão — ela funciona porque a lista está ordenada por
> número. Olhamos a sessão do meio: se o número é o procurado, achou e **para**. Se o procurado é maior,
> descartamos a metade da esquerda; se é menor, a da direita. Repetimos até achar ou até o intervalo ficar
> vazio, quando a sessão não existe. A cada passo, metade sai da conta: com 1.000 sessões, no máximo 10
> comparações; com um milhão, 20. Isso é **O(log n)**.
>
> Para texto — motorista, ponto ou veículo — usamos a **busca linear**: ela percorre a lista do começo ao
> fim e guarda as sessões que batem. Como queremos todas as ocorrências, só termina no fim: n comparações.
> Dobrou as sessões, dobrou o trabalho: **O(n)**.

---

## 6. Algoritmo de ordenação · 4:42–5:37 · Sammy

**Tela:** `backend/pontow/ordenacao.py` — `merge_sort` e `_intercalar`. No fim, 10 segundos na interface
ordenando por outros campos.

> Para ordenar, implementamos o **Merge Sort**, sem `sort` e sem `sorted`. O usuário escolhe o campo:
> valor, energia, duração, início ou número. A comparação usa uma **tupla**: o campo escolhido e, no
> empate, o número da sessão — o resultado é sempre o mesmo.
>
> O Merge Sort divide a lista ao meio, de novo e de novo, até sobrarem listas de um elemento. Depois
> **intercala**: compara o primeiro de cada metade, passa o menor para a lista final e repete. São log n
> níveis e, em cada nível, n comparações: **O(n log n)**, em qualquer caso.
>
> Também fizemos o **Insertion Sort**, para comparar: ele desloca cada sessão para a esquerda até achar o
> lugar. No caso médio e no pior, **O(n²)**.
>
> *[na interface]* Com registros diferentes: por duração… e por horário de início.

---

## 7. Análise de complexidade · 5:37–6:25 · João Victor

**Tela:** aba *Complexidade* da interface (tabela + gráfico de comparações × n).

> O que acontece quando o número de sessões aumenta? Esta tela roda os nossos algoritmos com 10, 100,
> 1.000 e 5.000 sessões e conta as comparações.
>
> Iniciar uma sessão e calcular a tarifa é **O(1)**: o mesmo trabalho com 10 ou 5.000 sessões. A busca
> binária é **O(log n)**: de 1.000 para 5.000 sessões, vai de 10 para 13 comparações. A busca linear e as
> estatísticas são **O(n)**: crescem na mesma proporção. O Merge Sort é **O(n log n)**: um pouco mais que o
> dobro quando n dobra. E o Insertion Sort é **O(n²)**: com 5.000 sessões, passa de 6 milhões de
> comparações, contra cerca de 55 mil do Merge Sort. Por isso o Merge Sort é o padrão do sistema.

---

## 8. Integração interface ↔ backend · 6:25–6:50 · Thiago

**Tela:** slide com o diagrama abaixo e, em seguida, o DevTools do navegador (aba **Rede**) mostrando a
requisição `/sessoes/ordenar` e o JSON da resposta.

```
Interface (React) → HTTP/JSON → API FastAPI (Python) → repositório + algoritmos → JSON → Interface
```

> A tela em React faz uma requisição HTTP para a API em Python, feita com FastAPI. A rota chama o
> repositório e os algoritmos, que processam as sessões, e a resposta volta em JSON — com o resultado e o
> número de comparações — para a tela mostrar. Aqui no navegador dá para ver a requisição e a resposta.

---

## 9. Considerações finais · 6:50–7:15 · Gabriel

**Tela:** slide "Próximos passos" com os três itens.

> Como evolução, queremos: trocar o arquivo JSON por um **banco de dados**, ligando o backend Python ao
> Supabase que o Ponto W já usa; **integrar com o carregador GoodWe real** pelo protocolo Modbus, no lugar
> da simulação; e usar o histórico das sessões para **prever a demanda** e ajustar a tarifa dinâmica.
> Obrigado!

---

## Conferência: cada critério aparece no vídeo?

| Critério (pontos) | Onde |
|---|---|
| Demonstração funcional e integração (25) | Bloco 3 (com o terminal do Python ao lado) + bloco 8 |
| Explicação do código Python (15) | Blocos 4, 5 e 6 (VS Code) |
| Estruturas de dados e armazenamento (15) | Bloco 4 |
| Algoritmos de busca e ordenação (20) | Blocos 5 e 6 + passos 3.4 e 3.5 |
| Análise de complexidade Big-O (15) | Blocos 5, 6 e 7 (O(1), O(log n), O(n), O(n log n), O(n²)) |
| Clareza, organização e participação (10) | Tabela "Quem fala o quê": todos em parte técnica |

Itens obrigatórios da demonstração: cadastro/início (3.1) · múltiplas sessões (3.3) · listagem (3.4) ·
busca (3.4) · ordenação (3.5) · estatísticas (3.6) · tarifação (3.1 e 3.2) · relatório (3.6). ✔

## Publicação

1. YouTube → **Não listado** (nunca *Privado*).
2. Título sugerido: `Ponto W — Sprint 4 · [Disciplina] · [Turma]`.
3. Abrir o link numa **janela anônima** e conferir que toca sem pedir login.
4. Entregar no portal **só o link** (`https://www.youtube.com/watch?v=...`).
