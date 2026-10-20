import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { useApp } from '../../app/estado';
import {
  obterSessao, telemetriaDaSessao, obterPonto, obterVeiculo, obterMotorista, regiaoDoPonto,
  sessaoDoMotorista, cobrancaDaSessao, carregadoresDoPonto,
} from '../../domain/db';
import { repartir, gerarTxid, gerarPixCopiaECola } from '../../domain/engine/tarifa';
import { encerrarSessao, pagarCobranca } from '../../data/acoes';
import {
  Card, KPI, AnelSoC, Tabela, brl, num, hora, Nota, Vazio, EstadoBadge, Badge,
  ChartTip, CHART, eixoProps, gradeProps,
} from '../../ui/kit';
import { Icone } from '../../ui/icones';
import { CenaCarro3D } from '../../ui/CenaCarro3D';
import { QR } from '../../ui/QR';

export default function Recarga() {
  const { sessaoId } = useParams();
  const nav = useNavigate();
  const { perfil, motoristaId } = useApp();
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const sessao = sessaoId ? obterSessao(sessaoId) : sessaoDoMotorista(perfil?.motoristaId ?? motoristaId);

  if (!sessao) {
    return (
      <Vazio>
        Nenhuma recarga em andamento. Conecte o cabo e leia o QR do totem.{' '}
        <Link to="/motorista/vincular" className="btn">Digitar código</Link>
      </Vazio>
    );
  }

  const ponto = obterPonto(sessao.pontoId)!;
  const regiao = regiaoDoPonto(ponto);
  const veiculo = obterVeiculo(sessao.veiculoId);
  const motorista = obterMotorista(sessao.motoristaId);
  const vaga = carregadoresDoPonto(sessao.pontoId).find((c) => c.id === sessao.carregadorId);
  const telemetria = telemetriaDaSessao(sessao.id);
  const cobranca = cobrancaDaSessao(sessao.id);
  const emCarga = ['AUTENTICADO', 'CARREGANDO', 'PAUSADO', 'ENCERRANDO'].includes(sessao.estado);
  const serie = telemetria.map((t) => ({ hora: hora(t.ts), potencia: t.potenciaKW, soc: t.soc }));

  const faltaKWh = veiculo ? veiculo.capacidadeKWh * ((100 - sessao.socAtual) / 100) : 0;
  const minutosRestantes = sessao.potenciaAtualKW > 0 ? Math.round((faltaKWh / sessao.potenciaAtualKW) * 60) : 0;
  const valor = cobranca?.valor ?? Number((sessao.energiaKWh * (sessao.tarifaAplicadaKWh ?? 0)).toFixed(2));
  const rep = repartir(valor, sessao.energiaKWh, regiao.custoEnergiaKWh);

  const agir = (f: () => Promise<void>) => async () => {
    setErro(''); setOcupado(true);
    try { await f(); } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  };

  return (
    <div className="stack">
      <div className="grid g-2-1">
        <Card>
          <div className="row between wrap" style={{ alignItems: 'center', gap: 20 }}>
            <div className="row" style={{ alignItems: 'center', gap: 15 }}><AnelSoC soc={sessao.socAtual} tamanho={150} /><CenaCarro3D /></div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="row" style={{ gap: 8 }}>
                <EstadoBadge estado={sessao.estado} />
                <span className="tiny muted">{veiculo?.montadora} {veiculo?.modelo} · bateria estimada</span>
              </div>
              <div className="kpi-value" style={{ marginTop: 8 }}>{num(emCarga ? sessao.potenciaAtualKW : 0, 1)} kW</div>
              <div className="kpi-foot">Entregues {num(sessao.energiaKWh, 2)} kWh · começou em {Math.round(sessao.socInicial)}%</div>
              <div className="sep" />
              <div className="row between">
                <div><div className="kpi-label">Vaga</div><div className="strong">{vaga?.apelido ?? '—'}</div></div>
                <div><div className="kpi-label">Falta (est.)</div><div className="strong">{emCarga && minutosRestantes ? `${minutosRestantes} min` : '—'}</div></div>
                <div className="right"><div className="kpi-label">Custo</div><div className="strong kpi-accent-red">{brl(valor)}</div></div>
              </div>
            </div>
          </div>
          {sessao.estado === 'PAUSADO' && (
            <Nota titulo="Recarga pausada" tom="amber">
              {sessao.motivoPausa ?? 'Sem potência disponível agora. A recarga volta sozinha assim que houver folga na entrada elétrica do local.'}
            </Nota>
          )}
          {sessao.estado === 'AUTENTICADO' && <Nota titulo="Liberando a vaga" tom="teal">A recarga começa em instantes.</Nota>}
        </Card>

        <div className="stack">
          <KPI label="Local" value={ponto.nome} sm foot={ponto.endereco} />
          <KPI label="Preço travado" value={`${brl(sessao.tarifaAplicadaKWh ?? 0)}/kWh`} sm accent="red"
               foot={sessao.limiteValor ? `Para sozinho em ${brl(sessao.limiteValor)}` : 'Confirmado no início — não muda até o fim'} />
          <KPI label="Identificado por" value={sessao.autorizacao ?? 'QR'} sm foot={motorista?.nome ?? ''} />
          {emCarga && sessao.estado !== 'ENCERRANDO' && (
            <button className="btn primary" disabled={ocupado} style={{ justifyContent: 'center' }}
                    onClick={agir(() => encerrarSessao(sessao, 'app'))}>Encerrar recarga</button>
          )}
          {sessao.estado === 'ENCERRANDO' && <Nota titulo="Encerrando" tom="teal">Fechando a conta…</Nota>}
          {sessao.estado === 'CONCLUIDO' && cobranca && (
            <Card title="Pague com Pix">
              <div className="stack" style={{ alignItems: 'center' }}>
                <QR texto={gerarPixCopiaECola(cobranca.txid || gerarTxid(sessao.id), cobranca.valor)} tamanho={150} />
                <div className="tiny muted">txid {cobranca.txid}</div>
                <div className="kpi-value kpi-accent-red">{brl(cobranca.valor)}</div>
                <button className="btn primary" disabled={ocupado} style={{ width: '100%', justifyContent: 'center' }}
                        onClick={agir(() => pagarCobranca(cobranca))}>Simular pagamento</button>
              </div>
            </Card>
          )}
          {sessao.estado === 'FATURADO' && (
            <Card title="Pagamento confirmado">
              <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
                <Icone nome="check" tamanho={54} cor="var(--k-ok)" />
                <div className="strong">Recibo emitido</div>
                <div className="tiny muted">Sessão {sessao.id} · {brl(valor)}</div>
                <Badge tom="green" dot>Pago via Pix</Badge>
                <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => nav('/motorista')}>Voltar ao mapa</button>
              </div>
            </Card>
          )}
          {erro && <div className="tiny" style={{ color: 'var(--k-red2)' }}>{erro}</div>}
        </div>
      </div>

      {emCarga ? (
        <Card title="Potência e bateria durante a sessão" sub="Acima de 80% a corrente cai sozinha — é o carro que decide (curva CC/CV)">
          {serie.length > 1 ? (
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={serie}>
                <CartesianGrid {...gradeProps} />
                <XAxis dataKey="hora" {...eixoProps} minTickGap={30} />
                <YAxis yAxisId="p" {...eixoProps} unit=" kW" />
                <YAxis yAxisId="s" orientation="right" {...eixoProps} unit="%" domain={[0, 100]} />
                <Tooltip content={<ChartTip />} />
                <Line yAxisId="p" type="monotone" dataKey="potencia" stroke={CHART.serie2} strokeWidth={2} dot={false} name="Potência" isAnimationActive={false} />
                <Line yAxisId="s" type="monotone" dataKey="soc" stroke={CHART.serie1Claro} strokeWidth={2} dot={false} name="Bateria" isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <Vazio>Coletando telemetria...</Vazio>}
        </Card>
      ) : (
        <Card title="Para onde vai esse dinheiro" sub="Transparência do modelo de franquia">
          <Tabela cabecalho={['Destino', '#Valor']}>
            <tr><td>Energia entregue ({num(sessao.energiaKWh, 2)} kWh × {brl(sessao.tarifaAplicadaKWh ?? 0)})</td><td className="r num strong">{brl(valor)}</td></tr>
            <tr><td className="muted">Custo da energia (distribuidora)</td><td className="r num muted">{brl(rep.custoEnergia)}</td></tr>
            <tr><td className="muted">Royalties GoodWe (6%) + fundo (2%)</td><td className="r num muted">{brl(rep.royaltyGoodWe + rep.fundoMarketing)}</td></tr>
            <tr><td className="muted">Gateway de pagamento</td><td className="r num muted">{brl(rep.gateway)}</td></tr>
            <tr><td className="strong">Fica com o comércio</td><td className="r strong num kpi-accent-green">{brl(rep.liquidoLojista)}</td></tr>
          </Tabela>
        </Card>
      )}
    </div>
  );
}
