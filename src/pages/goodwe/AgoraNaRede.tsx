import { useState } from 'react';
import {
  base, carregadoresDoPonto, cobrancaDaSessao, obterPonto, pontosParaMotorista, regiaoDoPonto, sessoesAtivas,
} from '../../domain/db';
import { brl, horaMin, kw, kwh, num, plural, relativo, tarifaKWh } from '../../domain/formato';
import { Card, EmptyState, StatusBadge } from '../../ui/kit';
import { MapaRede } from '../../ui/MapaRede';
import './agoraNaRede.css';

/** pagas há pouco: a recarga que acabou de terminar ainda aparece, já como receita da rede */
const JANELA_PAGAS_MS = 30 * 60_000;

/**
 * O que está acontecendo na rede neste instante: recargas em andamento (com kW, kWh, valor e tarifa
 * travada), carros aguardando a leitura do QR e as recargas pagas na última meia hora. Tudo vem da base
 * em tempo real, então a recarga iniciada no celular aparece aqui no mesmo segundo.
 */
export function AgoraNaRede() {
  const [sel, setSel] = useState<string | undefined>(undefined);
  const ativas = sessoesAtivas().sort((a, b) => b.inicio.localeCompare(a.inicio));
  const aguardando = base.sessoes.filter((s) => s.estado === 'ABERTA');
  const agora = Date.now();
  const pagas = base.cobrancas
    // o histórico de demonstração também está pago; só entra o que foi pago agora há pouco
    .filter((c) => c.status === 'PAGO' && !(c as { demo?: boolean }).demo && c.pagaEm && agora - new Date(c.pagaEm).getTime() < JANELA_PAGAS_MS)
    .sort((a, b) => (b.pagaEm ?? '').localeCompare(a.pagaEm ?? ''));

  const kwAgora = ativas.reduce((t, s) => t + (s.potenciaAtualKW || 0), 0);
  const valorCorrendo = ativas.reduce((t, s) => t + (s.custoAcumulado || 0), 0);
  const pontosComRecarga = new Set(ativas.map((s) => s.pontoId)).size;
  const mapa = pontosParaMotorista().map((p) => ({
    ponto: p.ponto, regiao: p.regiao, vagasLivres: p.vagasLivres, totalVagas: p.totalVagas, precoAgora: p.precoAgora,
  }));

  const vagaDe = (pontoId: string, carregadorId: string) =>
    carregadoresDoPonto(pontoId).find((c) => c.id === carregadorId)?.apelido ?? 'Vaga';

  return (
    <Card title="Agora na rede" sub="Ao vivo: o que está acontecendo nos pontos neste momento">
      <div className="anr">
        <div className="anr-numeros">
          <div className="anr-num"><span className="kpi-label">Recargas em andamento</span><b>{num(ativas.length)}</b>
            <small>{pontosComRecarga ? `em ${plural(pontosComRecarga, 'ponto', 'pontos')}` : 'nenhuma agora'}</small></div>
          <div className="anr-num"><span className="kpi-label">Potência entregue</span><b>{kw(kwAgora)}</b>
            <small>somando todas as vagas</small></div>
          <div className="anr-num"><span className="kpi-label">Valor correndo</span><b>{brl(valorCorrendo)}</b>
            <small>vira receita quando o Pix é pago</small></div>
          <div className="anr-num"><span className="kpi-label">Aguardando QR</span><b>{num(aguardando.length)}</b>
            <small>carros conectados esperando o motorista</small></div>
        </div>

        <div className="anr-corpo">
          <div className="anr-mapa">
            <MapaRede pontos={mapa} selecionado={sel} aoSelecionar={setSel} compacto />
          </div>
          <div className="anr-lista">
            {ativas.length === 0 && aguardando.length === 0 && pagas.length === 0 ? (
              <EmptyState icone="raio" titulo="Nenhuma recarga neste momento">
                Quando um carro conectar num ponto, ele aparece aqui na hora.
              </EmptyState>
            ) : (
              <>
                {ativas.map((s) => {
                  const p = obterPonto(s.pontoId);
                  return (
                    <button key={s.id} className={`anr-item ${sel === s.pontoId ? 'on' : ''}`} onClick={() => setSel(s.pontoId)}>
                      <div className="anr-item-topo">
                        <span className="strong">{p?.nome ?? s.pontoId}</span>
                        <StatusBadge estado={s.estado} />
                      </div>
                      <div className="tiny muted">
                        {p ? `${regiaoDoPonto(p).zona} · ` : ''}{vagaDe(s.pontoId, s.carregadorId)} · começou às {horaMin(s.inicio)}
                      </div>
                      <div className="anr-item-numeros">
                        <span><b>{kw(s.potenciaAtualKW || 0)}</b> agora</span>
                        <span><b>{kwh(s.energiaKWh || 0)}</b></span>
                        <span><b>{brl(s.custoAcumulado || 0)}</b> até agora</span>
                        {s.tarifaAplicadaKWh ? <span>travado em <b>{tarifaKWh(s.tarifaAplicadaKWh)}</b></span> : null}
                      </div>
                    </button>
                  );
                })}
                {aguardando.map((s) => {
                  const p = obterPonto(s.pontoId);
                  return (
                    <button key={s.id} className={`anr-item fraco ${sel === s.pontoId ? 'on' : ''}`} onClick={() => setSel(s.pontoId)}>
                      <div className="anr-item-topo">
                        <span className="strong">{p?.nome ?? s.pontoId}</span>
                        <StatusBadge estado="ABERTA" />
                      </div>
                      <div className="tiny muted">
                        {vagaDe(s.pontoId, s.carregadorId)} · carro conectado {relativo(s.inicio)} · código {s.codigoVinculo ?? '—'}
                      </div>
                    </button>
                  );
                })}
                {pagas.length > 0 && <div className="kpi-label anr-sep">Pagas na última meia hora</div>}
                {pagas.map((c) => {
                  const p = obterPonto(c.pontoId);
                  const s = base.sessoes.find((x) => x.id === c.sessaoId);
                  const cob = cobrancaDaSessao(c.sessaoId) ?? c;
                  return (
                    <div key={c.id} className="anr-item pago">
                      <div className="anr-item-topo">
                        <span className="strong">{p?.nome ?? c.pontoId}</span>
                        <StatusBadge estado="PAGO" />
                      </div>
                      <div className="tiny muted">
                        {brl(cob.valor)} pagos por Pix {relativo(cob.pagaEm ?? cob.criadaEm)}
                        {s ? ` · ${kwh(s.energiaKWh)}` : ''} · GoodWe recebe {brl(cob.royaltyGoodWe + cob.fundoMarketing)}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
