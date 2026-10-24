# Ponto W · backend Python (Sprint 4 · Data Structures and Algorithms)

API em Python (FastAPI) que guarda e processa as sessões de recarga. A tela `/sessoes` do app consome esta API.

```
Interface (React, /sessoes) → HTTP/JSON → api.py → RepositorioSessoes + algoritmos → JSON → Interface
```

| Arquivo | O que tem | Complexidade |
|---|---|---|
| `pontow/modelo.py` | `@dataclass SessaoRecarga` | — |
| `pontow/repositorio.py` | lista de sessões, `iniciar`, `encerrar`, JSON | `append` O(1) |
| `pontow/busca.py` | `busca_binaria_por_id`, `busca_linear`, `busca_por_texto` | O(log n) · O(n) |
| `pontow/ordenacao.py` | `merge_sort`, `insertion_sort` (próprios, sem `sort`/`sorted`) | O(n log n) · O(n²) |
| `pontow/tarifa.py` | `calcular_tarifa`, `repartir` (mesma regra do app) | O(1) |
| `pontow/estatisticas.py` | totais, médias, máx/mín, por ponto/faixa, mediana | O(n) + O(n log n) |
| `pontow/relatorio.py` | relatório final e CSV | O(n log n) |
| `pontow/complexidade.py` | conta as comparações com n = 10 … 5.000 | — |
| `pontow/dados.py` | rede de demonstração e 200 sessões de exemplo (semente fixa) | — |
| `pontow/api.py` | rotas FastAPI (documentação em `/docs`) | — |

## Rodar

Com o [uv](https://docs.astral.sh/uv/) (baixa o Python sozinho):

```bash
cd backend
uv venv
uv pip install -r requirements.txt
uv run uvicorn pontow.api:app --port 8000
```

Sem uv: `python -m venv .venv`, ative a venv, `pip install -r requirements.txt` e
`uvicorn pontow.api:app --port 8000`.

Depois, em outro terminal, na raiz do repositório: `npm install` e `npm run dev`, e abra
`http://localhost:5173/sessoes`. (Se a API estiver em outro endereço, defina `VITE_API_PY` no `.env.local`.)

- Documentação interativa: `http://localhost:8000/docs`
- Voltar às 200 sessões de exemplo: `POST /reset` (pelo `/docs`) ou apagar `dados/sessoes.json`
- Testes: `uv run pytest -q testes` (confere a ordenação contra `sorted()`, a busca e a tarifa)
