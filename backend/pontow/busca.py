"""
Ponto W · algoritmos de busca de sessões.

Todas as funções devolvem também quantas comparações fizeram, para a interface
mostrar e para a análise de complexidade.
"""
from __future__ import annotations

from typing import Callable

from .modelo import SessaoRecarga


def busca_binaria_por_id(sessoes: list[SessaoRecarga], id_procurado: int) -> tuple[SessaoRecarga | None, int]:
    """
    Busca binária pelo número da sessão — O(log n).

    Pré-condição: a lista está ordenada por id. Ela fica assim sozinha, porque o id é
    sequencial e toda sessão nova entra no fim da lista.
    A cada volta do laço, metade das sessões que restam é descartada.
    """
    comparacoes = 0
    inicio, fim = 0, len(sessoes) - 1
    while inicio <= fim:                     # termina quando o intervalo fica vazio: não existe
        meio = (inicio + fim) // 2
        comparacoes += 1
        atual = sessoes[meio].id
        if atual == id_procurado:            # termina quando acha
            return sessoes[meio], comparacoes
        if id_procurado > atual:
            inicio = meio + 1                # descarta a metade da esquerda
        else:
            fim = meio - 1                   # descarta a metade da direita
    return None, comparacoes


def busca_linear(sessoes: list[SessaoRecarga], condicao: Callable[[SessaoRecarga], bool]) -> tuple[list[SessaoRecarga], int]:
    """
    Busca linear — O(n).

    Percorre a lista do começo ao fim e guarda todas as sessões que atendem à condição.
    Como queremos TODAS as ocorrências, só termina no fim da lista: n comparações.
    """
    encontradas: list[SessaoRecarga] = []
    comparacoes = 0
    for sessao in sessoes:
        comparacoes += 1
        if condicao(sessao):
            encontradas.append(sessao)
    return encontradas, comparacoes


def busca_por_texto(sessoes: list[SessaoRecarga], texto: str) -> tuple[list[SessaoRecarga], int]:
    """Busca linear por motorista, ponto ou veículo (sem diferenciar maiúsculas)."""
    alvo = texto.strip().lower()
    return busca_linear(
        sessoes,
        lambda s: alvo in s.motorista.lower() or alvo in s.ponto.lower() or alvo in s.veiculo.lower(),
    )
