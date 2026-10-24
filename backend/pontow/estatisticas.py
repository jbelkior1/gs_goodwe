"""
Ponto W · estatísticas das sessões.

Tudo numa passada só pela lista (O(n)): somas, máximo, mínimo e agrupamentos em
dicionários. A mediana precisa da lista ordenada, então usa o nosso Merge Sort (O(n log n)).
"""
from __future__ import annotations

from .modelo import FATURADO, SessaoRecarga
from .ordenacao import merge_sort
from .tarifa import cent


def _novo_grupo() -> dict:
    return {"sessoes": 0, "energia_kwh": 0.0, "receita": 0.0}


def calcular_estatisticas(sessoes: list[SessaoRecarga]) -> tuple[dict, int]:
    faturadas: list[SessaoRecarga] = []
    energia_total = receita_total = 0.0
    duracao_total = 0
    maior = menor = None
    por_ponto: dict[str, dict] = {}
    por_faixa: dict[str, dict] = {}
    por_estado: dict[str, int] = {}
    comparacoes = 0

    for s in sessoes:                                    # uma passada: O(n)
        por_estado[s.estado] = por_estado.get(s.estado, 0) + 1
        if s.estado != FATURADO:
            continue
        faturadas.append(s)
        energia_total += s.energia_kwh
        receita_total += s.valor
        duracao_total += s.duracao_min
        comparacoes += 2
        if maior is None or s.valor > maior.valor:
            maior = s
        if menor is None or s.valor < menor.valor:
            menor = s
        for grupos, nome in ((por_ponto, s.ponto), (por_faixa, s.faixa)):
            g = grupos.setdefault(nome, _novo_grupo())   # dicionário: acesso O(1) em média
            g["sessoes"] += 1
            g["energia_kwh"] += s.energia_kwh
            g["receita"] += s.valor

    n = len(faturadas)
    ordenadas, comp_mediana = merge_sort(faturadas, lambda s: (s.valor, s.id))
    comparacoes += comp_mediana
    if n == 0:
        mediana = 0.0
    elif n % 2:
        mediana = ordenadas[n // 2].valor
    else:
        mediana = (ordenadas[n // 2 - 1].valor + ordenadas[n // 2].valor) / 2

    for grupos in (por_ponto, por_faixa):
        for g in grupos.values():
            g["energia_kwh"] = round(g["energia_kwh"], 1)
            g["receita"] = cent(g["receita"])

    return {
        "total_sessoes": len(sessoes),
        "sessoes_faturadas": n,
        "em_andamento": por_estado.get("CARREGANDO", 0),
        "energia_total_kwh": round(energia_total, 1),
        "receita_total": cent(receita_total),
        "ticket_medio": cent(receita_total / n) if n else 0.0,
        "energia_media_kwh": round(energia_total / n, 1) if n else 0.0,
        "duracao_media_min": round(duracao_total / n) if n else 0,
        "tarifa_media_kwh": cent(receita_total / energia_total) if energia_total else 0.0,
        "mediana_valor": cent(mediana),
        "maior_recarga": maior.para_dict() if maior else None,
        "menor_recarga": menor.para_dict() if menor else None,
        "por_ponto": por_ponto,
        "por_faixa": por_faixa,
        "por_estado": por_estado,
    }, comparacoes
