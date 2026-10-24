"""
Ponto W · armazenamento das sessões.

As sessões ficam numa LISTA em memória, em ordem de id (o id é sequencial e toda
sessão nova entra no fim). A cada alteração, a lista é gravada num arquivo JSON,
para não se perder quando o servidor reinicia.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

from .busca import busca_binaria_por_id, busca_linear
from .dados import PONTOS, gerar_seed, potencia_recarga
from .modelo import CARREGANDO, FATURADO, SessaoRecarga
from .tarifa import Cotacao, calcular_tarifa, cent, repartir


class ErroDeNegocio(Exception):
    """Pedido inválido (vaga ocupada, sessão inexistente...): vira HTTP 400/404 na API."""

    def __init__(self, mensagem: str, status: int = 400) -> None:
        super().__init__(mensagem)
        self.status = status


class RepositorioSessoes:
    def __init__(self, arquivo: Path, n_seed: int = 200) -> None:
        self.arquivo = arquivo
        self.n_seed = n_seed
        self.sessoes: list[SessaoRecarga] = []
        self.carregar()

    # ------------------------------------------------------------ persistência
    def carregar(self) -> None:
        if self.arquivo.exists():
            linhas = json.loads(self.arquivo.read_text(encoding="utf-8"))
            self.sessoes = [SessaoRecarga.de_dict(d) for d in linhas]
        else:
            self.resetar()

    def salvar(self) -> None:
        self.arquivo.parent.mkdir(parents=True, exist_ok=True)
        dados = [s.para_dict() for s in self.sessoes]
        self.arquivo.write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")

    def resetar(self) -> None:
        """Volta para as sessões de exemplo (semente fixa)."""
        self.sessoes = gerar_seed(self.n_seed)
        self.salvar()

    # ------------------------------------------------------------ operações
    def proximo_id(self) -> int:
        return self.sessoes[-1].id + 1 if self.sessoes else 1   # O(1): olha só o último

    def iniciar(self, ponto: str, vaga: int, motorista: str, veiculo: str, inicio: datetime) -> tuple[SessaoRecarga, Cotacao]:
        """Inicia uma recarga: calcula a tarifa, trava o preço e guarda a sessão no fim da lista."""
        if ponto not in PONTOS:
            raise ErroDeNegocio(f"Ponto desconhecido: {ponto}")
        vagas = PONTOS[ponto]
        if not 1 <= vaga <= vagas:
            raise ErroDeNegocio(f"{ponto} tem {vagas} vaga(s).")
        if not motorista.strip():
            raise ErroDeNegocio("Informe o motorista.")

        em_andamento, _ = busca_linear(self.sessoes, lambda s: s.estado == CARREGANDO and s.ponto == ponto)
        if any(s.vaga == vaga for s in em_andamento):
            raise ErroDeNegocio(f"A vaga {vaga} de {ponto} já está carregando outro carro.")

        ocupacao = (len(em_andamento) + 1) / vagas          # contando o carro que está chegando
        cotacao = calcular_tarifa(inicio, ocupacao, vagas)
        sessao = SessaoRecarga(
            id=self.proximo_id(),
            ponto=ponto,
            vaga=vaga,
            motorista=motorista.strip(),
            veiculo=veiculo,
            inicio=inicio.replace(second=0, microsecond=0),
            tarifa_kwh=cotacao.preco_kwh,
            faixa=cotacao.faixa,
        )
        self.sessoes.append(sessao)                          # O(1) amortizado
        self.salvar()
        return sessao, cotacao

    def encerrar(self, id_sessao: int, energia_kwh: float) -> tuple[SessaoRecarga, dict, int]:
        """Encerra: valor = energia × preço travado, e reparte o dinheiro."""
        sessao, comparacoes = busca_binaria_por_id(self.sessoes, id_sessao)   # O(log n)
        if sessao is None:
            raise ErroDeNegocio(f"Sessão {id_sessao} não existe.", 404)
        if sessao.estado != CARREGANDO:
            raise ErroDeNegocio(f"A sessão {id_sessao} já foi encerrada.")
        if not 0 < energia_kwh <= 200:
            raise ErroDeNegocio("A energia precisa ficar entre 0 e 200 kWh.")

        sessao.energia_kwh = round(energia_kwh, 1)
        sessao.valor = cent(sessao.energia_kwh * sessao.tarifa_kwh)
        horas = sessao.energia_kwh / potencia_recarga(sessao.veiculo)
        sessao.fim = (sessao.inicio + timedelta(hours=horas)).replace(second=0, microsecond=0)
        sessao.estado = FATURADO
        self.salvar()
        return sessao, repartir(sessao.valor, sessao.energia_kwh), comparacoes
