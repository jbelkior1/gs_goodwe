import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  obterSessao, sessoesAtivas, obterPonto, regiaoDoPonto,
} from '../../domain/db';
import { repartir, gerarTxid, gerarPixCopiaECola } from '../../domain/engine/tarifa';
import { Card, KPI, brl, num, duracao, Nota, Vazio, Badge, Tabela } from '../../ui/kit';

export default function Pagamento() {
  const { sessaoId } = useParams();
  const nav = useNavigate();
  const [pago, setPago] = useState(false);
  const sessao = sessaoId ? obterSessao(sessaoId) : sessoesAtivas()[0];

  if (!sessao) return <Vazio>Nenhuma sessão para pagar.</Vazio>;

  const ponto = obterPonto(sessao.pontoId)!;
  const regiao = regiaoDoPonto(ponto);
  const valor = Number((sessao.energiaKWh * sessao.tarifaAplicadaKWh).toFixed(2));
  const txid = gerarTxid(sessao.id);
  const rep = repartir(valor, sessao.energiaKWh, regiao.custoEnergiaKWh);

  return (
    <div className="grid g-2-1">
      <div className="stack">
        <Card title="Resumo da recarga" sub={`${ponto.nome} · ${duracao(sessao.inicio, sessao.fim)}`}>
          <Tabela cabecalho={['Item', '#Valor']}>
            <tr><td>Energia entregue</td><td className="r num">{num(sessao.energiaKWh, 2)} kWh</td></tr>
            <tr><td>Bateria</td><td className="r num">{sessao.socInicial}% → {sessao.socAtual}%</td></tr>
            <tr><td>Preço travado no início</td><td className="r num">{brl(sessao.tarifaAplicadaKWh)}/kWh</td></tr>
            <tr>
              <td className="strong">Total a pagar</td>
              <td className="r strong num kpi-accent-red" style={{ fontSize: 16 }}>{brl(valor)}</td>
            </tr>
          </Tabela>
          <Nota titulo="Preço sem surpresa" tom="teal">
            O valor por kWh foi confirmado antes de iniciar e não muda durante a sessão —
            transparência exigida pela REN ANEEL 1.000/2021.
          </Nota>
        </Card>

        <Card title="Para onde vai esse dinheiro" sub="Transparência do modelo de franquia">
          <Tabela cabecalho={['Destino', '#Valor']}>
            <tr><td>Custo da energia (distribuidora)</td><td className="r num">{brl(rep.custoEnergia)}</td></tr>
            <tr><td>Royalties GoodWe (6%)</td><td className="r num">{brl(rep.royaltyGoodWe)}</td></tr>
            <tr><td>Fundo de marketing (2%)</td><td className="r num">{brl(rep.fundoMarketing)}</td></tr>
            <tr><td>Gateway de pagamento</td><td className="r num">{brl(rep.gateway)}</td></tr>
            <tr>
              <td className="strong">Fica com o comércio</td>
              <td className="r strong num kpi-accent-green">{brl(rep.liquidoLojista)}</td>
            </tr>
          </Tabela>
        </Card>
      </div>

      <div className="stack">
        <Card title={pago ? 'Pagamento confirmado' : 'Pague com Pix'}>
          {pago ? (
            <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
              <div style={{ fontSize: 46 }}>✅</div>
              <div className="strong">Recibo emitido</div>
              <div className="tiny muted">Sessão {sessao.id} · {brl(valor)}</div>
              <Badge tom="green" dot>Pago</Badge>
              <button className="btn" style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => nav('/motorista/historico')}>
                Ver histórico
              </button>
            </div>
          ) : (
            <div className="stack" style={{ alignItems: 'center' }}>
              <div style={{
                width: 150, height: 150, borderRadius: 10, background: '#12161d',
                display: 'grid', placeItems: 'center', color: '#fff', fontSize: 11,
                letterSpacing: 1, textAlign: 'center', padding: 10,
              }}>
                QR CODE<br />PIX DINÂMICO
              </div>
              <div className="tiny muted">txid {txid}</div>
              <div className="kpi-value kpi-accent-red">{brl(valor)}</div>
              <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => setPago(true)}>
                Simular pagamento
              </button>
              <div className="tiny muted" style={{
                wordBreak: 'break-all', background: '#f4f6fa', padding: 8, borderRadius: 8,
              }}>
                {gerarPixCopiaECola(txid, valor).slice(0, 90)}...
              </div>
            </div>
          )}
        </Card>
        <KPI label="Liquidação" value="Imediata" sm foot="Pix cai na conta do lojista em segundos" />
      </div>
    </div>
  );
}
