# Sprint 4 (DSA) — Plano para atender a entrega

> Projeto: **Ponto W — Sistema de Recarga** (EV Challenge GoodWe × FIAP)
> Repositório: https://github.com/jbelkior1/gs_goodwe
> Entrega: vídeo de 5 a 8 min no YouTube (público ou não listado), com o sistema rodando.

---

## 1. Diagnóstico: o que temos e o que falta

O Ponto W já é um sistema grande e funcionando (no ar em https://jbelkior1.github.io/gs_goodwe): app do
motorista, totem, painel do franqueado e da GoodWe, banco Supabase em tempo real e cerca de 6 mil recargas
de histórico.

**O problema:** o repositório inteiro é **React + TypeScript + Supabase**. Não existe **nenhum arquivo Python**
em nenhuma branch nem no histórico, e a Sprint exige:

| A Sprint pede | Situação hoje | O que fazer |
|---|---|---|
| Backend em **Python** | ❌ não existe (tudo em TS) | Criar `backend/` em Python (FastAPI) |
| Cadastro / início de sessão | ✅ existe em TS (totem + app) | Refazer o núcleo da sessão em Python |
| Armazenamento de múltiplas sessões | ✅ no Supabase | Lista de objetos em Python + arquivo JSON |
| Listagem | ✅ extrato do franqueado | Rota Python + tabela na tela nova |
| **Busca** com análise Big-O | ❌ não há algoritmo próprio | Busca linear + busca binária em Python |
| **Ordenação própria** (não vale só `sorted`) | ❌ não há | Merge Sort + Insertion Sort em Python |
| Estatísticas | ✅ em TS (painéis) | Recalcular em Python (uma passada, O(n)) |
| Tarifação | ✅ em TS (`engine/tarifa.ts`) | Portar a fórmula para Python |
| Relatório / resumo final | parcial | Rota de relatório + exportar CSV |
| Interface integrada ao Python | ❌ a interface fala só com o Supabase | Tela nova `/sessoes` no app, chamando a API Python |

**Conclusão:** não precisamos reescrever o produto. Precisamos de um **módulo de sessões em Python** (o
"backend da Sprint 4") e de **uma tela no app** que use esse backend. Tudo o que a disciplina avalia
(estrutura de dados, busca, ordenação, estatística, tarifa, relatório) fica em Python; a interface só
mostra o resultado.

> **Pergunta para o grupo:** nas Sprints 1 a 3 desta disciplina vocês fizeram algum código em Python
> (por exemplo, um programa de terminal com menu de sessões)? Se sim, ele vira o núcleo do `backend/` e a
> história de "evolução" do vídeo fica ainda melhor. Se não, seguimos com o desenho abaixo.

---

## 2. Arquitetura

```
┌───────────────────────────┐   HTTP + JSON    ┌──────────────────────────────────────────┐
│  Interface Web (React)     │ ───────────────► │  Backend Python (FastAPI)                │
│  tela /sessoes do Ponto W  │                  │  api.py  →  RepositorioSessoes            │
│  formulário, tabela,       │ ◄─────────────── │            ├─ busca.py      (linear/binária)
│  busca, ordenação,         │   resultado +    │            ├─ ordenacao.py  (merge/insertion)
│  estatísticas, relatório   │   nº de          │            ├─ tarifa.py     (preço + repartição)
└───────────────────────────┘   comparações    │            ├─ estatisticas.py
                                                │            └─ relatorio.py
                                                │  dados/sessoes.json  (persistência simples)
                                                └──────────────────────────────────────────┘
```

Fluxo que o vídeo precisa deixar claro:
**Interface → requisição HTTP → rota FastAPI → estruturas e algoritmos em Python → JSON → Interface.**

Cada resposta da API devolve também **quantas comparações o algoritmo fez e quanto tempo levou**. A tela
mostra isso num selo ("Python · merge sort · 8.704 comparações · 4 ms"). Isso prova a integração no vídeo
e deixa a análise de complexidade concreta.

---

## 3. Estrutura de pastas proposta

```
backend/
  requirements.txt          fastapi, uvicorn, pytest
  README.md                 como rodar
  pontow/
    modelo.py               @dataclass SessaoRecarga  (a estrutura de uma sessão)
    repositorio.py          RepositorioSessoes: lista de sessões + salvar/carregar JSON
    busca.py                busca_linear(), busca_binaria_por_id()
    ordenacao.py            merge_sort(), insertion_sort()
    tarifa.py               calcular_tarifa(), repartir()
    estatisticas.py         calcular_estatisticas()
    relatorio.py            gerar_relatorio(), relatorio_csv()
    complexidade.py         medir_operacoes(): roda os algoritmos com n = 10, 100, 1.000, 5.000
    dados.py                gerar_seed() (sessões de exemplo, semente fixa) e importar_supabase() (opcional)
    api.py                  rotas FastAPI + CORS para o app
  dados/sessoes.json        criado ao rodar
  testes/test_algoritmos.py confere a ordenação contra sorted() e a busca contra a linear
src/pages/sessoes/          (no app React)
  SessoesPython.tsx         a tela nova
  api.ts                    fetch para VITE_API_PY (padrão http://localhost:8000)
```

### 3.1 A estrutura de dados (o centro da nota de "Estruturas de dados", 15 pts)

```python
@dataclass
class SessaoRecarga:
    id: int                  # chave de busca: sequencial, nunca repete
    ponto: str               # "FIAP Aclimação"
    vaga: int
    motorista: str
    veiculo: str
    inicio: datetime
    tarifa_kwh: float        # preço TRAVADO no início da recarga
    faixa: str               # "VALE" | "NORMAL" | "PICO"
    energia_kwh: float = 0.0
    valor: float = 0.0
    fim: datetime | None = None
    estado: str = "CARREGANDO"   # CARREGANDO → FATURADO

    @property
    def duracao_min(self) -> int: ...
```

- **Por que `dataclass`:** cada sessão tem campos fixos e tipados; fica legível (`s.valor` em vez de
  `s["valor"]`), o Python gera `__init__` e `__repr__` sozinho e converte fácil para dicionário/JSON.
- **Como guardamos várias sessões:** numa **`list[SessaoRecarga]`** dentro do `RepositorioSessoes`.
  Inserir no fim é O(1) amortizado; o `id` é sequencial, então a lista **já fica ordenada por id** — é isso
  que permite a **busca binária** por id.
- **Dicionário** (`dict`): usado nas estatísticas para agrupar por ponto e por faixa horária numa passada
  só (O(n)), e para converter a sessão em JSON (`asdict`).
- **Tupla**: chave de comparação da ordenação `(valor, id)`, que desempata registros iguais e deixa o
  resultado sempre igual (estável).
- **Persistência:** `dados/sessoes.json` (lido ao subir a API, gravado a cada alteração). Banco de dados
  fica como evolução futura.

---

## 4. Rotas da API

| Método | Rota | O que faz | Algoritmo / custo |
|---|---|---|---|
| POST | `/sessoes` | Inicia uma recarga: calcula e trava a tarifa | `calcular_tarifa` O(1); `append` O(1) |
| POST | `/sessoes/{id}/encerrar` | Informa os kWh: calcula valor e repartição | busca binária O(log n) + O(1) |
| GET | `/sessoes` | Lista todas (com filtro opcional por ponto/estado) | percorre a lista O(n) |
| GET | `/sessoes/busca?id=42` | Busca por id | **busca binária O(log n)** |
| GET | `/sessoes/busca?motorista=ana` | Busca por texto (motorista, ponto, veículo) | **busca linear O(n)** |
| GET | `/sessoes/ordenar?campo=valor&ordem=desc&algoritmo=merge` | Ordena | **merge sort O(n log n)** ou **insertion sort O(n²)** |
| GET | `/estatisticas` | Totais, médias, máximo, mínimo, por ponto e por faixa | uma passada O(n); mediana usa o merge sort |
| GET | `/tarifa?hora=18&ocupacao=0.5` | Cotação do kWh com a explicação | O(1) |
| GET | `/relatorio` e `/relatorio.csv` | Resumo final (e download) | O(n log n) por causa do ranking |
| GET | `/complexidade` | Mede os algoritmos com n crescente | tabela para o gráfico |

O FastAPI gera sozinho a documentação em `http://localhost:8000/docs` — dá para mostrar no vídeo como
prova de que é Python respondendo.

---

## 5. Algoritmos e complexidade (o que vamos falar no vídeo)

| Operação no nosso código | Complexidade | Por quê (ligado ao código) |
|---|---|---|
| Inserir sessão (`list.append`) | **O(1)** | coloca no fim da lista, não depende de quantas existem |
| Calcular tarifa / repartição | **O(1)** | meia dúzia de contas fixas, para 1 ou 1 milhão de sessões |
| Busca binária por id | **O(log n)** | a cada comparação descarta metade da lista; 1.000 sessões → no máximo 10 comparações |
| Busca linear por motorista/ponto | **O(n)** | olha uma sessão de cada vez; para achar *todas* as ocorrências precisa olhar as n |
| Estatísticas | **O(n)** | uma passada só, somando e guardando máximo e mínimo |
| Merge Sort | **O(n log n)** | divide ao meio (log n níveis) e intercala tudo em cada nível (n) |
| Insertion Sort | **O(n²)** (pior e médio) | cada elemento pode ser comparado com todos os anteriores; O(n) se já estiver ordenada |

Números esperados (o `/complexidade` mostra os reais, aleatórios):

| n sessões | Linear (pior caso) | Binária | Merge Sort | Insertion Sort (médio ≈ n²/4) |
|---:|---:|---:|---:|---:|
| 10 | 10 | 4 | ~22 | ~25 |
| 100 | 100 | 7 | ~540 | ~2.500 |
| 1.000 | 1.000 | 10 | ~8.700 | ~250.000 |
| 5.000 | 5.000 | 13 | ~55.000 | ~6.250.000 |

A frase-chave da seção 7: **dobrando as sessões, a busca linear dobra, a binária faz só 1 comparação a
mais, o merge sort faz um pouco mais que o dobro e o insertion sort faz quatro vezes mais.**

---

## 6. A tela na interface (`/sessoes`)

Uma página nova no app (mesmo visual do Ponto W), com abas:

1. **Nova recarga** — ponto, vaga, motorista, veículo, horário de início → "Iniciar" mostra o preço travado
   e o motivo (ex.: "Horário de pico +12%"). Em cada sessão aberta, "Encerrar" com os kWh entregues.
2. **Sessões** — tabela; caixa de busca (por id → binária; por texto → linear); seletor de campo
   (valor, energia, duração, início, id), ordem (cresc./decresc.) e algoritmo (merge / insertion).
3. **Estatísticas** — cartões (sessões, kWh, receita, ticket médio, duração média, maior e menor recarga)
   e quebras por ponto e por faixa horária.
4. **Relatório** — resumo final: totais, repartição do dinheiro (energia, GoodWe, Pix, comércio), top 5
   recargas, botão "Baixar CSV".
5. **Complexidade** — tabela e gráfico (recharts, já está no projeto) das comparações × n.

Em todas as respostas, o selo "Python · rota · algoritmo · comparações · ms".

> Alternativa mais rápida, se faltar tempo: uma página HTML simples servida pelo próprio FastAPI
> (`backend/static/index.html`). Vale nota igual, mas perde a história de "evoluímos o nosso app".

---

## 7. Dados de exemplo

- **Padrão:** `gerar_seed()` cria ~200 sessões com semente fixa (sempre as mesmas), usando os pontos reais
  da rede de demonstração (FIAP Aclimação, Pão de Açúcar Moema, Shopping Eldorado...), nomes e carros do
  catálogo. Não depende de internet nem de chave.
- **Opcional:** `importar_supabase()` lê as ~6 mil recargas reais do banco do projeto (precisa do
  `SUPABASE_URL` e da chave no `.env.local`). Bom para mostrar a busca e a ordenação com n grande.

---

## 8. Como rodar (depois de implementado)

Python não está instalado nesta máquina, mas o **uv** está (ele baixa o Python sozinho, sem mexer no sistema):

```bash
cd backend
uv venv
uv pip install -r requirements.txt
uv run uvicorn pontow.api:app --reload --port 8000
```

Em outro terminal, o app: `npm install` e `npm run dev` → abrir `http://localhost:5173/sessoes`.

---

## 9. Divisão de tarefas e cronograma sugerido

| Quem | Tarefa | Entrega |
|---|---|---|
| Integrante 1 | `modelo.py`, `repositorio.py`, `dados.py`, `api.py` | API subindo com seed |
| Integrante 2 | `busca.py`, `ordenacao.py`, `complexidade.py` + testes | algoritmos com contador de comparações |
| Integrante 3 | `tarifa.py`, `estatisticas.py`, `relatorio.py` | números batendo com o app (R$ 1,90 base) |
| Integrante 4 | Tela `/sessoes` no React | tela consumindo todas as rotas |
| Integrante 5 | Roteiro, gravação, edição, upload | vídeo não listado + link testado em aba anônima |

| Dia | Marco |
|---|---|
| D1–D2 | backend completo + testes passando |
| D3 | tela integrada; ensaio da demonstração |
| D4 | cada um grava a sua parte (tela + voz) |
| D5 | edição, upload no YouTube como **não listado**, teste em janela anônima, entrega do link |

---

## 10. Pendências que só o grupo resolve

- [ ] Nome da disciplina, turma, nomes completos e RMs (vão no primeiro slide do vídeo).
- [ ] Quantos integrantes (o roteiro tem papéis P1 a P5; a tabela no topo dele mostra como juntar).
- [ ] Data de entrega da Sprint.
- [ ] Se existe código Python das Sprints 1–3 (ver seção 1).
- [ ] Quem tem acesso ao `.env.local` do Supabase (só se formos importar as recargas reais).
