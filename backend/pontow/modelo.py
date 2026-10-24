"""
Ponto W · modelo de dados de uma sessão de recarga.

Uma sessão nasce quando o carro conecta (estado CARREGANDO, com o preço do kWh já
travado) e termina quando o motorista encerra (estado FATURADO, com energia e valor).
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime

# estados possíveis de uma sessão
CARREGANDO = "CARREGANDO"
FATURADO = "FATURADO"


@dataclass
class SessaoRecarga:
    id: int                  # chave de busca: sequencial, nunca se repete
    ponto: str               # nome do ponto de recarga (ex.: "FIAP Aclimação")
    vaga: int                # número da vaga dentro do ponto
    motorista: str
    veiculo: str
    inicio: datetime         # quando o carro conectou
    tarifa_kwh: float        # preço do kWh TRAVADO no início da recarga
    faixa: str               # faixa de horário do preço: "VALE" | "NORMAL" | "PICO"
    energia_kwh: float = 0.0
    valor: float = 0.0       # energia × tarifa travada (R$)
    fim: datetime | None = None
    estado: str = CARREGANDO

    @property
    def duracao_min(self) -> int:
        """Minutos entre o início e o fim (0 enquanto a recarga está em andamento)."""
        if self.fim is None:
            return 0
        return int((self.fim - self.inicio).total_seconds() // 60)

    def para_dict(self) -> dict:
        """Converte para dicionário (e daí para JSON): datas viram texto ISO."""
        d = asdict(self)
        d["inicio"] = self.inicio.isoformat(timespec="minutes")
        d["fim"] = self.fim.isoformat(timespec="minutes") if self.fim else None
        d["duracao_min"] = self.duracao_min
        return d

    @classmethod
    def de_dict(cls, d: dict) -> SessaoRecarga:
        """Caminho inverso: lê uma sessão gravada no arquivo JSON."""
        return cls(
            id=int(d["id"]),
            ponto=d["ponto"],
            vaga=int(d["vaga"]),
            motorista=d["motorista"],
            veiculo=d["veiculo"],
            inicio=datetime.fromisoformat(d["inicio"]),
            tarifa_kwh=float(d["tarifa_kwh"]),
            faixa=d["faixa"],
            energia_kwh=float(d["energia_kwh"]),
            valor=float(d["valor"]),
            fim=datetime.fromisoformat(d["fim"]) if d.get("fim") else None,
            estado=d["estado"],
        )
