"""
Ponto W · catálogo da rede de demonstração e gerador de sessões de exemplo.

O gerador usa semente fixa: roda quantas vezes quiser e as sessões saem iguais.
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta

from .modelo import FATURADO, SessaoRecarga
from .tarifa import calcular_tarifa, cent

# ponto → número de vagas (pontos da rede de demonstração em São Paulo)
PONTOS: dict[str, int] = {
    "FIAP Aclimação": 2,
    "Pão de Açúcar Moema": 2,
    "Carrefour Pinheiros": 4,
    "Shopping Eldorado": 4,
    "Drogasil Paulista": 1,
    "Smart Fit Vila Mariana": 2,
    "Outback Morumbi": 2,
    "Starbucks Itaim": 1,
    "Graal Anhanguera": 4,
}

# veículo → potência máxima de recarga em AC (kW); as vagas são GW7K (7 kW)
VEICULOS: dict[str, float] = {
    "BYD Dolphin": 6.6,
    "BYD Dolphin Mini": 6.6,
    "BYD Seal": 7.0,
    "GWM Ora 03": 6.6,
    "Volvo EX30": 7.0,
    "Renault Kwid E-Tech": 6.6,
    "Chevrolet Bolt": 7.0,
    "BMW iX1": 7.0,
}

MOTORISTAS = (
    "Ana Beatriz Ramos", "Bruno Tavares", "Camila Moreira", "Diego Fontes", "Fernanda Vasques",
    "Gustavo Rocha", "Juliana Prado", "Larissa Meireles", "Mariana Duarte", "Patrícia Assis",
    "Rodrigo Antunes", "Rafael Lima", "Carlos Eduardo Nunes", "Beatriz Okada", "Lucas Ferreira",
)

POTENCIA_VAGA_KW = 7.0


def potencia_recarga(veiculo: str) -> float:
    """O carro limita quanto puxa: vale o menor entre a vaga e o carregador de bordo."""
    return min(POTENCIA_VAGA_KW, VEICULOS.get(veiculo, POTENCIA_VAGA_KW))


def gerar_seed(n: int = 200, semente: int = 42, dias: int = 30) -> list[SessaoRecarga]:
    """n sessões já faturadas, em ordem cronológica (e, portanto, de id)."""
    rnd = random.Random(semente)
    hoje = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    momento = hoje - timedelta(days=dias)
    passo_medio = dias * 24 * 60 / max(n, 1)          # minutos entre uma recarga e a próxima
    sessoes: list[SessaoRecarga] = []
    for i in range(1, n + 1):
        momento += timedelta(minutes=rnd.uniform(0.3, 1.7) * passo_medio)
        ponto = rnd.choice(list(PONTOS))
        vagas = PONTOS[ponto]
        veiculo = rnd.choice(list(VEICULOS))
        cot = calcular_tarifa(momento, ocupacao=rnd.choice((0.25, 0.5, 0.75, 1.0)), vagas=vagas)
        energia = round(rnd.uniform(3, 20), 1)
        horas = energia / potencia_recarga(veiculo)
        sessoes.append(SessaoRecarga(
            id=i,
            ponto=ponto,
            vaga=rnd.randint(1, vagas),
            motorista=rnd.choice(MOTORISTAS),
            veiculo=veiculo,
            inicio=momento.replace(second=0, microsecond=0),
            tarifa_kwh=cot.preco_kwh,
            faixa=cot.faixa,
            energia_kwh=energia,
            valor=cent(energia * cot.preco_kwh),
            fim=(momento + timedelta(hours=horas)).replace(second=0, microsecond=0),
            estado=FATURADO,
        ))
    return sessoes
