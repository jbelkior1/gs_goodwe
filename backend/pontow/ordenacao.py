"""
Ponto W · algoritmos de ordenação implementados pelo grupo (sem sort() nem sorted()).

- merge_sort:     O(n log n) em qualquer caso — é o padrão do sistema.
- insertion_sort: O(n²) no caso médio e no pior — existe para comparação.

Os dois recebem uma função `chave` que diz o que comparar, e devolvem a lista
ordenada e o número de comparações feitas.
"""
from __future__ import annotations

from typing import Any, Callable

from .modelo import SessaoRecarga

# campo escolhido na interface → valor da sessão usado na comparação
CAMPOS: dict[str, Callable[[SessaoRecarga], Any]] = {
    "id": lambda s: s.id,
    "valor": lambda s: s.valor,
    "energia": lambda s: s.energia_kwh,
    "duracao": lambda s: s.duracao_min,
    "inicio": lambda s: s.inicio,
    "tarifa": lambda s: s.tarifa_kwh,
    "motorista": lambda s: s.motorista.lower(),
}


def chave_de_sessao(campo: str) -> Callable[[SessaoRecarga], tuple]:
    """Chave em TUPLA: (campo escolhido, id). No empate do campo, desempata pelo id."""
    pegar = CAMPOS[campo]
    return lambda s: (pegar(s), s.id)


class Contador:
    def __init__(self) -> None:
        self.comparacoes = 0


def _vem_antes(a: Any, b: Any, chave: Callable, decrescente: bool, contador: Contador) -> bool:
    """Uma comparação entre dois elementos (é o que contamos)."""
    contador.comparacoes += 1
    return chave(a) > chave(b) if decrescente else chave(a) < chave(b)


# ---------------------------------------------------------------- Merge Sort
def merge_sort(itens: list, chave: Callable, decrescente: bool = False) -> tuple[list, int]:
    contador = Contador()
    return _merge_sort(itens, chave, decrescente, contador), contador.comparacoes


def _merge_sort(itens: list, chave: Callable, decrescente: bool, contador: Contador) -> list:
    if len(itens) <= 1:                      # lista de 0 ou 1 elemento já está ordenada
        return list(itens)
    meio = len(itens) // 2
    esquerda = _merge_sort(itens[:meio], chave, decrescente, contador)   # divide...
    direita = _merge_sort(itens[meio:], chave, decrescente, contador)
    return _intercalar(esquerda, direita, chave, decrescente, contador)  # ...e intercala


def _intercalar(esquerda: list, direita: list, chave: Callable, decrescente: bool, contador: Contador) -> list:
    """Junta duas listas já ordenadas: compara o primeiro de cada uma e passa o menor."""
    resultado = []
    i = j = 0
    while i < len(esquerda) and j < len(direita):
        if _vem_antes(direita[j], esquerda[i], chave, decrescente, contador):
            resultado.append(direita[j])
            j += 1
        else:
            resultado.append(esquerda[i])   # no empate fica o da esquerda: ordenação estável
            i += 1
    resultado.extend(esquerda[i:])           # o que sobrou já está em ordem
    resultado.extend(direita[j:])
    return resultado


# ---------------------------------------------------------------- Insertion Sort
def insertion_sort(itens: list, chave: Callable, decrescente: bool = False) -> tuple[list, int]:
    """Cada elemento é deslocado para a esquerda até encontrar o seu lugar."""
    contador = Contador()
    lista = list(itens)
    for i in range(1, len(lista)):
        atual = lista[i]
        j = i - 1
        while j >= 0 and _vem_antes(atual, lista[j], chave, decrescente, contador):
            lista[j + 1] = lista[j]          # empurra o maior uma casa para a direita
            j -= 1
        lista[j + 1] = atual
    return lista, contador.comparacoes


ALGORITMOS = {"merge": merge_sort, "insertion": insertion_sort}
