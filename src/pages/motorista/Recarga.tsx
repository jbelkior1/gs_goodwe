import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  sessoesAtivas, obterSessao, telemetriaDaSessao, obterPonto, obterVeiculo,
  obterMotorista, regiaoDoPonto,
} from '../../domain/db';
import { repartir, gerarTxid } from '../../domain/engine/tarifa';
import {
  Card, KPI, AnelSoC, Tabela, brl, num, duracao, hora, Nota, Vazio, EstadoBadge, Badge,
  ChartTip, CHART, eixoProps, gradeProps,
} from '../../ui/kit';
import { Icone } from '../../ui/icones';

export default function Recarga() {
  const { sessaoId } = useParams();
  const nav = useNavigate();
  const [etapa, setEtapa] = useState<'carregando' | 'pagando' | 'pago'>('carregando');
  const sessao = sessaoId ? obterSessao(sessaoId) : sessoesAtivas()[0];

  if (!sessao) return <Vazio>Nenhuma recarga em andamento.</Vazio>;

  const ponto = obterPonto(sessao.pontoId)!;
  const regiao = regiaoDoPonto(ponto);
  const veiculo = obterVeiculo(sessao.veiculoId)!;
  const motorista = obterMotorista(sessao.motoristaId)!;
  const telemetria = telemetriaDaSessao(sessao.id);

  const serie = telemetria.map((t) => ({ hora: hora(t.ts), potencia: t.potenciaKW, soc: t.soc }));

  const faltaKWh = veiculo.capacidadeKWh * ((100 - sessao.socAtual) / 100);
  const minutosRestantes = sessao.potenciaAtualKW > 0
    ? Math.round((faltaKWh / sessao.potenciaAtualKW) * 60) : 0;

  const valor = Number((sessao.energiaKWh * sessao.tarifaAplicadaKWh).toFixed(2));
  const rep = repartir(valor, sessao.energiaKWh, regiao.custoEnergiaKWh);

  return (
    <div className="stack">
      <div className="grid g-2-1">
        <Card>
          <div className="row between wrap" style={{ alignItems: 'center', gap: 20 }}>
            <AnelSoC soc={sessao.socAtual} tamanho={150} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="row" style={{ gap: 8 }}>
                <EstadoBadge estado={etapa === 'pago' ? 'FATURADO' : sessao.estado} />
                <span className="tiny muted">{veiculo.montadora} {veiculo.modelo}</span>
              </div>
              <div className="kpi-value" style={{ marginTop: 8 }}>
                {num(etapa === 'carregando' ? sessao.potenciaAtualKW : 0, 1)} kW
              </div>
              <div className="kpi-foot">
                Entregues {num(sessao.energiaKWh, 2)} kWh · começou em {sessao.socInicial}%
              </div>
              <div className="sep" />
              <div className="row between">
                <div>
                  <div className="kpi-label">Tempo</div>
                  <div className="strong">{duracao(sessao.inicio, sessao.fim)}</div>
                </div>
                <div>
                  <div className="kpi-label">Falta (est.)</div>
                  <div className="strong">{etapa === 'carregando' ? `${minutosRestantes} min` : '—'}</div>
                </div>
                <div className="right">
                  <div className="kpi-label">Custo</div>
                  <div className="strong kpi-accent-red">{brl(valor)}</div>
                </div>
              </div>
            </div>
          </div>
          {sessao.estado === 'PAUSADO' && etapa === 'carregando' && (
            <Nota titulo="Recarga pausada" tom="amber">
              {sessao.motivoPausa ?? 'Sem potência disponível agora. A recarga volta sozinha assim que houver folga na entrada elétrica do local.'}
            </Nota>
          )}
        </Card>

        <div className="stack">
          {etapa === 'carregando' && (
            <>
              <KPI label="Local" value={ponto.nome} sm foot={ponto.endereco} />
              <KPI label="Preço travado" value={`${brl(sessao.tarifaAplicadaKWh)}/kWh`} sm accent="red"
                   foot="Confirmado no início — não muda até o fim" />
              <KPI label="Identificado por" value={sessao.autorizacao} sm
                   foot={`${motorista.nome} · RFID ${motorista.rfidUid}`} />
              <button className="btn primary" style={{ justifyContent: 'center' }}
                      onClick={() => setEtapa('pagando')}>
                Encerrar e pagar
              </button>
            </>
          )}

          {etapa === 'pagando' && (
            <Card title="Pague com Pix">
              <div className="stack" style={{ alignItems: 'center' }}>
                <div style={{
                  width: 150, height: 150, borderRadius: 8, background: 'var(--k-text)',
                  display: 'grid', placeItems: 'center', color: 'var(--k-bg)', fontSize: 10,
                  letterSpacing: '.16em', textAlign: 'center', padding: 10,
                  boxShadow: '0 0 34px rgba(230,0,18,.34)',
                }}>
                  QR CODE<br />PIX DINÂMICO
                </div>
                <div className="tiny muted">txid {gerarTxid(sessao.id)}</div>
                <div className="kpi-value kpi-accent-red">{brl(valor)}</div>
                <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => setEtapa('pago')}>
                  Simular pagamento
                </button>
              </div>
            </Card>
          )}

          {etapa === 'pago' && (
            <Card title="Pagamento confirmado">
              <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
                <Icone nome="check" tamanho={54} cor="var(--k-ok)" style={{ filter: 'drop-shadow(0 0 16px rgba(61,220,151,.4))' }} />
                <div className="strong">Recibo emitido</div>
                <div className="tiny muted">Sessão {sessao.id} · {brl(valor)}</div>
                <Badge tom="green" dot>Pago via Pix</Badge>
                <button className="btn" style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => nav('/motorista')}>
                  Voltar ao mapa
                </button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {etapa === 'carregando' ? (
        <Card title="Potência e bateria durante a sessão"
              sub="Acima de 80% a corrente cai sozinha — é o carro que decide (curva CC/CV)">
          {serie.length > 1 ? (
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={serie}>
                <CartesianGrid {...gradeProps} />
                <XAxis dataKey="hora" {...eixoProps} minTickGap={30} />
                <YAxis yAxisId="p" {...eixoProps} unit=" kW" />
                <YAxis yAxisId="s" orientation="right" {...eixoProps}
                       unit="%" domain={[0, 100]} />
                <Tooltip content={<ChartTip />} />
                <Line yAxisId="p" type="monotone" dataKey="potencia" stroke={CHART.serie2} strokeWidth={2}
                      dot={false} name="Potência" />
                <Line yAxisId="s" type="monotone" dataKey="soc" stroke={CHART.serie1Claro} strokeWidth={2}
                      dot={false} name="Bateria" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Vazio>Coletando telemetria...</Vazio>
          )}
        </Card>
      ) : (
        <Card title="Para onde vai esse dinheiro" sub="Transparência do modelo de franquia">
          <Tabela cabecalho={['Destino', '#Valor']}>
            <tr><td>Energia entregue ({num(sessao.energiaKWh, 2)} kWh × {brl(sessao.tarifaAplicadaKWh)})</td>
                <td className="r num strong">{brl(valor)}</td></tr>
            <tr><td className="muted">Custo da energia (distribuidora)</td>
                <td className="r num muted">{brl(rep.custoEnergia)}</td></tr>
            <tr><td className="muted">Royalties GoodWe (6%) + fundo (2%)</td>
                <td className="r num muted">{brl(rep.royaltyGoodWe + rep.fundoMarketing)}</td></tr>
            <tr><td className="muted">Gateway de pagamento</td>
                <td className="r num muted">{brl(rep.gateway)}</td></tr>
            <tr><td className="strong">Fica com o comércio</td>
                <td className="r strong num kpi-accent-green">{brl(rep.liquidoLojista)}</td></tr>
          </Tabela>
          <Nota titulo="Preço sem surpresa" tom="teal">
            O valor por kWh foi confirmado antes de iniciar e não mudou durante a sessão —
            transparência exigida pela REN ANEEL 1.000/2021.
          </Nota>
        </Card>
      )}
    </div>
  );
}
