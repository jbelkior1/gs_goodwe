"""Ponto W · relatório final: resumo, repartição do dinheiro e rankings."""
from __future__ import annotations

import csv
import io

from .estatisticas import calcular_estatisticas
from .modelo import FATURADO, SessaoRecarga
from .ordenacao import chave_de_sessao, merge_sort
from .tarifa import cent, repartir


def gerar_relatorio(sessoes: list[SessaoRecarga]) -> tuple[dict, int]:
    estat, comparacoes = calcular_estatisticas(sessoes)

    reparticao = {"valor": 0.0, "energia": 0.0, "royalty_goodwe": 0.0, "fundo_marketing": 0.0, "pix": 0.0, "comercio": 0.0}
    inicio = fim = None
    faturadas = []
    for s in sessoes:                                    # O(n)
        if s.estado != FATURADO:
            continue
        faturadas.append(s)
        for parte, valor in repartir(s.valor, s.energia_kwh).items():
            reparticao[parte] += valor
        inicio = s.inicio if inicio is None or s.inicio < inicio else inicio
        fim = s.fim if fim is None or s.fim > fim else fim
    reparticao = {k: cent(v) for k, v in reparticao.items()}

    # top 5 recargas e ranking de pontos: Merge Sort decrescente — O(n log n)
    top, c1 = merge_sort(faturadas, chave_de_sessao("valor"), decrescente=True)
    pontos = [(nome, g) for nome, g in estat["por_ponto"].items()]
    ranking, c2 = merge_sort(pontos, lambda p: (p[1]["receita"], p[0]), decrescente=True)

    return {
        "periodo": {
            "inicio": inicio.isoformat(timespec="minutes") if inicio else None,
            "fim": fim.isoformat(timespec="minutes") if fim else None,
        },
        "resumo": {k: estat[k] for k in (
            "total_sessoes", "sessoes_faturadas", "em_andamento", "energia_total_kwh", "receita_total",
            "ticket_medio", "duracao_media_min", "tarifa_media_kwh")},
        "reparticao": reparticao,
        "top5_recargas": [s.para_dict() for s in top[:5]],
        "ranking_pontos": [{"ponto": nome, **g} for nome, g in ranking],
        "por_faixa": estat["por_faixa"],
    }, comparacoes + c1 + c2


def relatorio_csv(sessoes: list[SessaoRecarga]) -> str:
    saida = io.StringIO()
    escritor = csv.writer(saida, delimiter=";")
    escritor.writerow(["id", "ponto", "vaga", "motorista", "veiculo", "inicio", "fim", "duracao_min",
                       "faixa", "tarifa_kwh", "energia_kwh", "valor", "estado"])
    for s in sessoes:
        d = s.para_dict()
        escritor.writerow([d["id"], d["ponto"], d["vaga"], d["motorista"], d["veiculo"], d["inicio"], d["fim"] or "",
                           d["duracao_min"], d["faixa"], f'{d["tarifa_kwh"]:.2f}'.replace(".", ","),
                           f'{d["energia_kwh"]:.1f}'.replace(".", ","), f'{d["valor"]:.2f}'.replace(".", ","), d["estado"]])
    return saida.getvalue()
