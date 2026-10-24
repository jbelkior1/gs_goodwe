"""
Ponto W · API em Python (FastAPI) que a interface web consome.

Interface (React) → HTTP/JSON → rota aqui → repositório + algoritmos → JSON → Interface

Toda resposta traz `meta`: a rota, o algoritmo usado, quantas comparações ele fez,
quantas sessões havia (n) e quanto tempo levou.
Rodar:  uvicorn pontow.api:app --port 8000   (documentação em /docs)
"""
from __future__ import annotations

import time
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field

from .busca import busca_binaria_por_id, busca_linear, busca_por_texto
from .complexidade import medir_operacoes
from .dados import PONTOS, VEICULOS, MOTORISTAS
from .estatisticas import calcular_estatisticas
from .ordenacao import ALGORITMOS, CAMPOS, chave_de_sessao
from .relatorio import gerar_relatorio, relatorio_csv
from .repositorio import ErroDeNegocio, RepositorioSessoes
from .tarifa import PRECO_BASE_KWH, calcular_tarifa, repartir

ARQUIVO = Path(__file__).resolve().parent.parent / "dados" / "sessoes.json"

app = FastAPI(title="Ponto W · Backend de sessões (Python)", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
repo = RepositorioSessoes(ARQUIVO)


@app.exception_handler(ErroDeNegocio)
def _erro_de_negocio(_: Request, erro: ErroDeNegocio) -> JSONResponse:
    return JSONResponse(status_code=erro.status, content={"detail": str(erro)})


def resposta(dados, rota: str, inicio: float, algoritmo: str | None = None,
             comparacoes: int | None = None, complexidade: str | None = None) -> dict:
    return {
        "dados": dados,
        "meta": {
            "rota": rota,
            "algoritmo": algoritmo,
            "complexidade": complexidade,
            "comparacoes": comparacoes,
            "n": len(repo.sessoes),
            "ms": round((time.perf_counter() - inicio) * 1000, 2),
        },
    }


# ---------------------------------------------------------------- catálogo
@app.get("/catalogo")
def catalogo():
    t = time.perf_counter()
    return resposta({"pontos": PONTOS, "veiculos": list(VEICULOS), "motoristas": list(MOTORISTAS),
                     "preco_base": PRECO_BASE_KWH}, "GET /catalogo", t)


# ---------------------------------------------------------------- cadastro
class NovaSessao(BaseModel):
    ponto: str
    vaga: int = Field(ge=1)
    motorista: str
    veiculo: str
    inicio: datetime | None = None     # vazio = agora


class Encerramento(BaseModel):
    energia_kwh: float = Field(gt=0)


@app.post("/sessoes", status_code=201)
def iniciar_sessao(corpo: NovaSessao):
    t = time.perf_counter()
    inicio = (corpo.inicio or datetime.now()).replace(tzinfo=None)
    sessao, cotacao = repo.iniciar(corpo.ponto, corpo.vaga, corpo.motorista, corpo.veiculo, inicio)
    return resposta({"sessao": sessao.para_dict(), "cotacao": cotacao.__dict__},
                    "POST /sessoes", t, "calcular_tarifa + append", None, "O(1)")


@app.post("/sessoes/{id_sessao}/encerrar")
def encerrar_sessao(id_sessao: int, corpo: Encerramento):
    t = time.perf_counter()
    sessao, reparticao, comp = repo.encerrar(id_sessao, corpo.energia_kwh)
    return resposta({"sessao": sessao.para_dict(), "reparticao": reparticao},
                    f"POST /sessoes/{id_sessao}/encerrar", t, "busca binária", comp, "O(log n)")


@app.post("/reset")
def resetar():
    t = time.perf_counter()
    repo.resetar()
    return resposta({"ok": True}, "POST /reset", t)


# ---------------------------------------------------------------- listagem e busca
@app.get("/sessoes")
def listar(ponto: str | None = None, estado: str | None = None):
    t = time.perf_counter()
    if ponto or estado:
        lista, comp = busca_linear(
            repo.sessoes, lambda s: (not ponto or s.ponto == ponto) and (not estado or s.estado == estado))
        return resposta([s.para_dict() for s in lista], "GET /sessoes", t, "busca linear (filtro)", comp, "O(n)")
    return resposta([s.para_dict() for s in repo.sessoes], "GET /sessoes", t, "percorre a lista", len(repo.sessoes), "O(n)")


@app.get("/sessoes/busca")
def buscar(id: int | None = None, texto: str | None = None):
    t = time.perf_counter()
    if id is not None:
        sessao, comp = busca_binaria_por_id(repo.sessoes, id)
        return resposta([sessao.para_dict()] if sessao else [], f"GET /sessoes/busca?id={id}", t,
                        "busca binária", comp, "O(log n)")
    if texto:
        lista, comp = busca_por_texto(repo.sessoes, texto)
        return resposta([s.para_dict() for s in lista], f"GET /sessoes/busca?texto={texto}", t,
                        "busca linear", comp, "O(n)")
    raise HTTPException(400, "Informe id ou texto.")


@app.get("/sessoes/ordenar")
def ordenar(campo: str = "valor", ordem: str = "desc", algoritmo: str = "merge"):
    t = time.perf_counter()
    if campo not in CAMPOS:
        raise HTTPException(400, f"Campo inválido. Use: {', '.join(CAMPOS)}")
    if algoritmo not in ALGORITMOS:
        raise HTTPException(400, "Algoritmo inválido. Use: merge ou insertion")
    lista, comp = ALGORITMOS[algoritmo](repo.sessoes, chave_de_sessao(campo), ordem == "desc")
    nome = "merge sort" if algoritmo == "merge" else "insertion sort"
    return resposta([s.para_dict() for s in lista], f"GET /sessoes/ordenar?campo={campo}&ordem={ordem}", t,
                    nome, comp, "O(n log n)" if algoritmo == "merge" else "O(n²)")


# ---------------------------------------------------------------- estatísticas, tarifa e relatório
@app.get("/estatisticas")
def estatisticas():
    t = time.perf_counter()
    dados, comp = calcular_estatisticas(repo.sessoes)
    return resposta(dados, "GET /estatisticas", t, "uma passada + merge sort (mediana)", comp, "O(n log n)")


@app.get("/tarifa")
def tarifa(quando: datetime | None = None, ocupacao: float = 0.0, vagas: int = 2, energia_kwh: float = 10.0):
    t = time.perf_counter()
    cot = calcular_tarifa((quando or datetime.now()).replace(tzinfo=None), ocupacao, vagas)
    valor = round(energia_kwh * cot.preco_kwh, 2)
    return resposta({"cotacao": cot.__dict__, "simulacao": repartir(valor, energia_kwh)},
                    "GET /tarifa", t, "calcular_tarifa", None, "O(1)")


@app.get("/relatorio")
def relatorio():
    t = time.perf_counter()
    dados, comp = gerar_relatorio(repo.sessoes)
    return resposta(dados, "GET /relatorio", t, "estatísticas + merge sort (rankings)", comp, "O(n log n)")


@app.get("/relatorio.csv", response_class=PlainTextResponse)
def relatorio_em_csv():
    return PlainTextResponse(relatorio_csv(repo.sessoes), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": "attachment; filename=relatorio-sessoes.csv"})


@app.get("/complexidade")
def complexidade():
    t = time.perf_counter()
    return resposta(medir_operacoes(), "GET /complexidade", t, "todos", None, None)
