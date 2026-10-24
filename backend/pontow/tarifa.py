"""
Ponto W · tarifação (a mesma regra do app: src/domain/engine/tarifa.ts).

    preço = preço base × faixa de horário × (1 + adicional das últimas vagas)
    e depois limitado entre o piso e o teto do ponto.

Todas as funções aqui são O(1): fazem o mesmo número de contas para 1 ou para
1 milhão de sessões armazenadas.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

PRECO_BASE_KWH = 1.90       # preço base sugerido em São Paulo
CUSTO_ENERGIA_KWH = 0.85    # o que o comércio paga à distribuidora
ROYALTY_PCT = 0.06          # GoodWe
FUNDO_PCT = 0.02            # fundo de marketing da rede
GATEWAY_PCT = 0.015         # tarifa do Pix
TAXAS_PCT = ROYALTY_PCT + FUNDO_PCT + GATEWAY_PCT
MARGEM_MIN_KWH = 0.20

# (faixa, multiplicador) — tuplas imutáveis com a regra publicada
VALE = ("VALE", 0.90)       # 22h às 8h
NORMAL = ("NORMAL", 1.00)
PICO = ("PICO", 1.12)       # 17h às 19h, só em dia útil

ESCASSEZ_MAX = 0.08         # últimas vagas: até +8%
ESCASSEZ_A_PARTIR_DE = 0.5  # começa quando o ponto passa de metade ocupado


def cent(v: float) -> float:
    """Arredonda ao centavo, meio para cima (1,805 vira 1,81)."""
    return float(Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def faixa_da_hora(hora: int, fim_de_semana: bool = False) -> tuple[str, float]:
    """Faixa e multiplicador da hora. As horas de borda (8, 16, 20 e 22) são rampas no meio do caminho."""
    if hora >= 22 or hora <= 8:
        if hora in (22, 8):
            return VALE[0], (VALE[1] + NORMAL[1]) / 2
        return VALE
    if not fim_de_semana:
        if 17 <= hora <= 19:
            return PICO
        if hora in (16, 20):
            return NORMAL[0], (NORMAL[1] + PICO[1]) / 2
    return NORMAL


def adicional_escassez(ocupacao: float, vagas: int) -> float:
    """0 a 0,08: zero até metade ocupado e em ponto com menos de 2 vagas."""
    if vagas < 2:
        return 0.0
    t = (ocupacao - ESCASSEZ_A_PARTIR_DE) / (1 - ESCASSEZ_A_PARTIR_DE)
    return ESCASSEZ_MAX * min(1.0, max(0.0, t))


@dataclass
class Cotacao:
    preco_kwh: float
    faixa: str
    fator_horario: float
    adicional_escassez: float
    piso: float
    teto: float
    explicacao: list[str]


def calcular_tarifa(quando: datetime, ocupacao: float = 0.0, vagas: int = 1,
                    preco_base: float = PRECO_BASE_KWH) -> Cotacao:
    """Preço do kWh num instante, com o motivo de cada ajuste."""
    fds = quando.weekday() >= 5
    faixa, mult = faixa_da_hora(quando.hour, fds)
    esc = adicional_escassez(ocupacao, vagas)

    piso_custo = math.ceil(round((CUSTO_ENERGIA_KWH + MARGEM_MIN_KWH) / (1 - TAXAS_PCT) * 100, 6)) / 100
    piso = max(piso_custo, math.ceil(round(preco_base * 0.85 * 100, 6)) / 100)
    teto = math.floor(round(preco_base * 1.30 * 100, 6)) / 100
    preco = min(teto, max(piso, cent(preco_base * mult * (1 + esc))))

    explicacao = [f"Preço base R$ {preco_base:.2f}/kWh".replace(".", ",")]
    if mult != 1:
        nome = {"VALE": "Horário de vale", "PICO": "Horário de pico"}.get(faixa, "Transição do pico")
        explicacao.append(f"{nome} ({(mult - 1) * 100:+.0f}%)")
    if esc > 0:
        explicacao.append(f"Últimas vagas (+{esc * 100:.0f}%)")
    return Cotacao(preco, faixa, mult, esc, piso, teto, explicacao)


def repartir(valor: float, energia_kwh: float, custo_energia_kwh: float = CUSTO_ENERGIA_KWH) -> dict:
    """Para onde vai o dinheiro de uma recarga. Royalty incide só sobre a recarga."""
    energia = cent(energia_kwh * custo_energia_kwh)
    royalty = cent(valor * ROYALTY_PCT)
    fundo = cent(valor * FUNDO_PCT)
    gateway = cent(valor * GATEWAY_PCT)
    return {
        "valor": cent(valor),
        "energia": energia,
        "royalty_goodwe": royalty,
        "fundo_marketing": fundo,
        "pix": gateway,
        "comercio": cent(valor - energia - royalty - fundo - gateway),
    }
