"""Confere os algoritmos do grupo contra o resultado do Python nativo."""
import random
from datetime import datetime

from pontow.busca import busca_binaria_por_id, busca_linear
from pontow.dados import gerar_seed
from pontow.ordenacao import CAMPOS, chave_de_sessao, insertion_sort, merge_sort
from pontow.tarifa import calcular_tarifa, repartir

SESSOES = gerar_seed(300, semente=1)


def test_ordenacao_bate_com_sorted_em_todos_os_campos():
    for campo in CAMPOS:
        chave = chave_de_sessao(campo)
        for desc in (False, True):
            esperado = [s.id for s in sorted(SESSOES, key=chave, reverse=desc)]
            assert [s.id for s in merge_sort(SESSOES, chave, desc)[0]] == esperado
            assert [s.id for s in insertion_sort(SESSOES, chave, desc)[0]] == esperado


def test_ordenacao_listas_pequenas():
    for n in range(0, 12):
        nums = [random.randint(0, 5) for _ in range(n)]
        assert merge_sort(nums, lambda x: x)[0] == sorted(nums)
        assert insertion_sort(nums, lambda x: x)[0] == sorted(nums)


def test_busca_binaria_acha_todos_e_nao_acha_inexistente():
    for s in SESSOES:
        achada, comp = busca_binaria_por_id(SESSOES, s.id)
        assert achada is s and comp <= 9          # log2(300) ≈ 8,2
    assert busca_binaria_por_id(SESSOES, 0)[0] is None
    assert busca_binaria_por_id(SESSOES, 10_000)[0] is None


def test_busca_linear_percorre_tudo():
    achadas, comp = busca_linear(SESSOES, lambda s: s.ponto == "FIAP Aclimação")
    assert comp == len(SESSOES)
    assert achadas == [s for s in SESSOES if s.ponto == "FIAP Aclimação"]


def test_tarifa_igual_ao_app():
    sexta = datetime(2026, 10, 23)
    assert calcular_tarifa(sexta.replace(hour=12), 0.5, 2).preco_kwh == 1.90
    assert calcular_tarifa(sexta.replace(hour=18), 0.5, 2).preco_kwh == 2.13   # pico +12%
    assert calcular_tarifa(sexta.replace(hour=2), 0.5, 2).preco_kwh == 1.71    # vale −10%
    assert calcular_tarifa(sexta.replace(hour=22), 0.5, 2).preco_kwh == 1.81   # rampa do vale
    assert calcular_tarifa(sexta.replace(hour=18), 1.0, 2).preco_kwh == 2.30   # pico + últimas vagas
    r = repartir(19.0, 10)
    assert r["energia"] + r["royalty_goodwe"] + r["fundo_marketing"] + r["pix"] + r["comercio"] == r["valor"]
