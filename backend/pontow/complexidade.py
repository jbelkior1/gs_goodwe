"""
Ponto W · medição das operações conforme o número de sessões cresce.

Roda os nossos algoritmos com n sessões geradas (semente fixa) e conta as comparações:
é a prova, com o próprio código, de O(1), O(log n), O(n), O(n log n) e O(n²).
"""
from __future__ import annotations

import math
import time
from functools import lru_cache

from .busca import busca_binaria_por_id, busca_linear
from .dados import gerar_seed
from .ordenacao import chave_de_sessao, insertion_sort, merge_sort
from .tarifa import calcular_tarifa

TAMANHOS = (10, 100, 1000, 2000, 5000)


def _ms(inicio: float) -> float:
    return round((time.perf_counter() - inicio) * 1000, 2)


@lru_cache(maxsize=1)
def medir_operacoes(tamanhos: tuple[int, ...] = TAMANHOS) -> list[dict]:
    linhas = []
    for n in tamanhos:
        sessoes = gerar_seed(n, semente=7)
        chave = chave_de_sessao("valor")            # valores aleatórios: caso médio

        t = time.perf_counter()
        _, binaria = busca_binaria_por_id(sessoes, n + 1)          # id que não existe: pior caso
        ms_binaria = _ms(t)

        t = time.perf_counter()
        _, linear = busca_linear(sessoes, lambda s: s.id == n + 1)  # percorre as n
        ms_linear = _ms(t)

        t = time.perf_counter()
        _, merge = merge_sort(sessoes, chave)
        ms_merge = _ms(t)

        t = time.perf_counter()
        _, insertion = insertion_sort(sessoes, chave)
        ms_insertion = _ms(t)

        t = time.perf_counter()
        calcular_tarifa(sessoes[0].inicio)
        ms_tarifa = _ms(t)

        linhas.append({
            "n": n,
            "tarifa": 1,                     # O(1): não depende de n
            "busca_binaria": binaria,
            "busca_linear": linear,
            "merge_sort": merge,
            "insertion_sort": insertion,
            "referencia": {
                "log2_n": round(math.log2(n), 1),
                "n_log2_n": round(n * math.log2(n)),
                "n2_sobre_4": n * n // 4,
            },
            "ms": {"tarifa": ms_tarifa, "busca_binaria": ms_binaria, "busca_linear": ms_linear,
                   "merge_sort": ms_merge, "insertion_sort": ms_insertion},
        })
    return linhas
