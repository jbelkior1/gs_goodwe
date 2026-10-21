import { useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { useApp } from '../../app/estado';
import {
  obterSessao, telemetriaDaSessao, obterPonto, obterVeiculo, obterMotorista, regiaoDoPonto,
  sessaoRecenteDoMotorista, cobrancaDaSessao, carregadoresDoPonto,
} from '../../domain/db';
import { cent, repartir, gerarTxid, gerarPixCopiaECola } from '../../domain/engine/tarifa';
import { REGRAS } from '../../domain/catalogo';
import { pct, tarifaKWh } from '../../domain/formato';
import { encerrarSessao, pagarCobranca } from '../../data/acoes';
import {
  Card, KPI, AnelSoC, Tabela, brl, num, hora, Nota, Vazio, EstadoBadge, Badge,
  ChartTip, CHART, eixoProps, gradeProps,
} from '../../ui/kit';
import { Icone } from '../../ui/icones';
import { CenaCarro3D } from '../../ui/CenaCarro3D';
import { duracaoTexto, minutosAte100 } from '../../domain/engine/totem';
import { QR } from '../../ui/QR';
import { ComoCarregar } from './ComoCarregar';

const MEIO: Record<string, string> = {
  QR: 'QR do totem', CODIGO: 'Código digitado', APP: 'App', RFID: 'Cartão RFID', VISITANTE: 'Totem, sem app',
};

/** Sem recarga para mostrar: explica de onde ela nasce (o cabo no totem) e leva ao código. */
function SemRecarga({ aviso, codigo }: { aviso?: string; codigo?: string | null }) {
  return (
    <div className="stack">
      <Nota titulo={aviso ? 'Esta recarga não está ativa' : 'Nenhuma recarga em andamento'} tom={aviso ? 'amber' : 'teal'}>
        {aviso ?? 'Ela começa no totem: quando você conecta o cabo, o totem mostra o QR e o código da recarga.'}
      </Nota>
      <Card><ComoCarregar titulo="Como começar uma recarga" /></Card>
      <Link to={codigo ? `/motorista/vincular?c=${codigo}` : '/motorista/vincular'} className="btn primary" style={{ justifyContent: 'center' }}>
        Digitar código
      </Link>
    </div>
  );
}

export default function Recarga() {
  const { sessaoId } = useParams();
  const nav = useNavigate();
  const { perfil, motoristaId } = useApp();
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [params] = useSearchParams();
  // sem id: a recarga em andamento ou a recém-paga; com ?ponto= (celular do Palco), só desse ponto
  const sessao = sessaoId
    ? obterSessao(sessaoId)
    : sessaoRecenteDoMotorista(perfil?.motoristaId ?? motoristaId, params.get('ponto'));

  if (!sessao) return <SemRecarga />;
  if (sessao.estado === 'EXPIRADA') return <SemRecarga aviso={`O código venceu: ele vale ${REGRAS.codigoValidadeMin} minutos depois que o cabo é conectado. Desconecte e conecte o cabo de novo para o totem gerar outro.`} />;
  if (sessao.estado === 'ABERTA') return <SemRecarga aviso="Esta recarga ainda não foi confirmada. Leia o QR do totem com a câmera ou digite o código para iniciar." codigo={sessao.codigoVinculo} />;

  const ponto = obterPonto(sessao.pontoId)!;
  const regiao = regiaoDoPonto(ponto);
  const veiculo = obterVeiculo(sessao.veiculoId);
  const motorista = obterMotorista(sessao.motoristaId);
  const vaga = carregadoresDoPonto(sessao.pontoId).find((c) => c.id === sessao.carregadorId);
  const telemetria = telemetriaDaSessao(sessao.id);
  const cobranca = cobrancaDaSessao(sessao.id);
  const emCarga = ['AUTENTICADO', 'CARREGANDO', 'PAUSADO', 'ENCERRANDO'].includes(sessao.estado);
  const serie = telemetria.map((t) => ({ hora: hora(t.ts), potencia: t.potenciaKW, soc: t.soc }));

  // mesma estimativa do totem (até 100%, com o rendimento da recarga), para os dois aparelhos baterem
  const minutosRestantes = minutosAte100(sessao.socAtual, veiculo?.capacidadeKWh, sessao.potenciaAtualKW) ?? 0;
  const valor = cobranca?.valor ?? cent(sessao.energiaKWh * (sessao.tarifaAplicadaKWh ?? 0));
  const rep = repartir(valor, sessao.energiaKWh, regiao.custoEnergiaKWh);
  const precoTravado = Number(sessao.tarifaAplicadaKWh) || 0;

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
                <div><div className="kpi-label">Falta (est.)</div><div className="strong">{emCarga && minutosRestantes ? duracaoTexto(minutosRestantes) : '—'}</div></div>
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
          <KPI label="Preço travado" value={precoTravado > 0 ? tarifaKWh(precoTravado) : '—'} sm accent="red"
               foot={sessao.limiteValor ? `Para sozinho em ${brl(sessao.limiteValor)}` : 'Confirmado no início — não muda até o fim'} />
          <KPI label="Identificado por" value={MEIO[sessao.autorizacao] ?? 'QR do totem'} sm foot={motorista?.nome ?? ''} />
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
            <tr><td>Energia entregue ({num(sessao.energiaKWh, 2)} kWh × {brl(precoTravado)})</td><td className="r num strong">{brl(valor)}</td></tr>
            <tr><td className="muted">Custo da energia (distribuidora)</td><td className="r num muted">{brl(rep.custoEnergia)}</td></tr>
            <tr><td className="muted">Royalties GoodWe ({pct(REGRAS.royaltyPct)}) + fundo ({pct(REGRAS.fundoPct)})</td><td className="r num muted">{brl(cent(rep.royaltyGoodWe + rep.fundoMarketing))}</td></tr>
            <tr><td className="muted">Gateway de pagamento</td><td className="r num muted">{brl(rep.gateway)}</td></tr>
            <tr><td className="strong">Fica com o comércio</td><td className="r strong num kpi-accent-green">{brl(rep.liquidoLojista)}</td></tr>
          </Tabela>
        </Card>
      )}
    </div>
  );
}
