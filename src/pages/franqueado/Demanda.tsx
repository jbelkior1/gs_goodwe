import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import { useApp } from '../../app/estado';
import {
  demandaDoPonto, obterPonto, carregadoresDoPonto, obterSessao, obterVeiculo, obterMotorista,
  situacaoDaVaga, statusDoPonto,
} from '../../domain/db';
import { cargaComercioNaHora } from '../../domain/engine/demanda';
import { horaLocal } from '../../domain/tempo';
import { kw, num, pct } from '../../domain/formato';
import { BancadaVaga } from '../../ui/Bancada';
import {
  Card, KPI, LoadBar, Tabela, Badge, Nota, Vazio, Bar, ChartTip, StatusBadge, TextoSituacao,
  CHART, eixoProps, gradeProps, eixoKW,
} from '../../ui/kit';
import { Icone } from '../../ui/icones';

/** a bancada (simulação do carro) é da vitrine: só aparece no modo demonstração */
const DEMO = import.meta.env.VITE_MODO_DEMO === 'true';

/** Faixas de uso da entrada: normal até 85%, atenção de 85 a 92%, crítico acima de 92% (a margem de segurança). */
function faixaDaEntrada(u: number) {
  // o motor segura a entrada em 92%: só passa disso por arredondamento das potências, então há folga
  if (u > 0.925) return { tom: 'neg' as const, rotulo: 'Crítico', ico: 'alerta' as const };
  if (u >= 0.85) return { tom: 'warn' as const, rotulo: 'Atenção', ico: 'relogio' as const };
  return { tom: 'pos' as const, rotulo: 'Normal', ico: 'check' as const };
}

export default function Demanda() {
  const { pontoId } = useApp();
  const ponto = obterPonto(pontoId);
  if (!ponto) return <Nota titulo="Ponto não encontrado" tom="amber">Este ponto saiu da rede. Escolha outro ponto.</Nota>;

  const d = demandaDoPonto(pontoId);
  const carregadores = carregadoresDoPonto(pontoId);
  const agora = horaLocal();
  const faixa = faixaDaEntrada(d.utilizacaoEntrada);

  // carga do comércio ao longo do dia contra o limite
  const projecao = Array.from({ length: 24 }, (_, h) => ({ hora: `${h}h`, comercio: cargaComercioNaHora(ponto, h) }));

  return (
    <div className="stack">
      {statusDoPonto(ponto) === 'INSTALACAO' && (
        <Nota titulo="Ponto em instalação" tom="amber">
          O controle de demanda começa a trabalhar quando o ponto for ativado e os carregadores ficarem online.
        </Nota>
      )}

      <div className="grid g4">
        <KPI label="Limite da entrada" value={kw(ponto.limitePotenciaKW)}
             foot={`${num(ponto.limiteCorrenteA)} A · disjuntor do comércio`} />
        <KPI label="Carga do comércio" value={kw(d.cargaComercioKW)}
             foot="geladeiras, luzes, climatização" />
        <KPI label="Disponível para recarga" value={kw(d.disponivelParaRecargaKW)}
             foot="já com margem de segurança de 8%" />
        <KPI label="Uso da entrada" value={pct(d.utilizacaoEntrada)}
             foot={(
               <>
                 <span className={`tom-texto tom-${faixa.tom}`}><Icone nome={faixa.ico} tamanho={12} />{faixa.rotulo}</span>
                 {' · '}{d.emRestricao ? 'operando em restrição' : 'dentro do limite'}
               </>
             )} />
      </div>

      <Card title="Ocupação da entrada elétrica agora"
            sub="O motor nunca deixa a soma passar da margem de segurança — é isso que impede o disjuntor de abrir">
        <LoadBar
          comercioKW={d.cargaComercioKW}
          recargaKW={d.demandaConcedidaKW}
          limiteKW={ponto.limitePotenciaKW}
        />
        <div className="row wrap tiny muted" style={{ marginTop: 10, gap: 8 }}>
          <span>Faixas de uso:</span>
          <Badge tom="pos">Normal até 85%</Badge>
          <Badge tom="warn">Atenção de 85% a 92%</Badge>
          <Badge tom="neg">Crítico acima de 92%</Badge>
        </div>
        {d.emRestricao && (
          <div style={{ marginTop: 12 }}>
            <Nota titulo="Potência sendo limitada" tom="amber">
              As sessões pediram {kw(d.demandaSolicitadaKW)} e o sistema liberou{' '}
              {kw(d.demandaConcedidaKW)}. Quem está com a bateria mais vazia tem prioridade;
              quem já está quase cheio cede espaço.
            </Nota>
          </div>
        )}
      </Card>

      <Card title="Vagas do ponto" sub="Estado de cada carregador agora">
        {DEMO && (
          <div style={{ marginBottom: 12 }}>
            <Nota titulo="Simulação do carro (demonstração)" tom="info">
              Conecte um carro aqui ou no próprio totem para o totem mostrar o QR e o código.
            </Nota>
          </div>
        )}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))' }}>
          {carregadores.map((c) => {
            const aloc = d.alocacoes.find((a) => a.carregadorId === c.id);
            const s = situacaoDaVaga(c);
            return (
              <div key={c.id} className="card" style={{ boxShadow: 'none' }}>
                <div className="row between">
                  <span className="strong">{c.apelido}</span>
                  <StatusBadge estado={s.estado} />
                </div>
                <div className="tiny muted" style={{ marginTop: 2 }}>{c.modelo}</div>
                <div className="kpi-value sm" style={{ marginTop: 6 }}>
                  {kw(aloc?.potenciaConcedidaKW ?? 0)}
                </div>
                <div className="tiny muted">
                  {aloc ? `de ${kw(aloc.potenciaSolicitadaKW)} pedidos` : 'sem sessão'}
                </div>
                <div className="tiny" style={{ marginTop: 8, lineHeight: 1.5 }}>
                  <TextoSituacao texto={s.texto} codigo={s.codigo} />
                </div>
                {DEMO && (
                  <>
                    <div className="sep" style={{ margin: '10px 0' }} />
                    <div className="tiny muted" style={{ marginBottom: 6 }}>Simulação do carro</div>
                    <BancadaVaga vaga={c} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Alocação por sessão"
            sub="Pedido do carro × liberado pelo motor de demanda">
        {d.alocacoes.length === 0 ? (
          <Vazio>Nenhuma recarga ativa neste momento.</Vazio>
        ) : (
          <Tabela cabecalho={['Vaga', 'Motorista', 'Bateria', '#Pedido', '#Liberado', 'Situação', 'Motivo']}>
            {d.alocacoes.map((a) => {
              const s = obterSessao(a.sessaoId);
              const carregador = carregadores.find((c) => c.id === a.carregadorId);
              const motorista = s ? obterMotorista(s.motoristaId) : undefined;
              const veiculo = s ? obterVeiculo(s.veiculoId) : undefined;
              return (
                <tr key={a.sessaoId}>
                  <td className="strong">{carregador?.apelido}</td>
                  <td>
                    {motorista?.nome ?? (s?.autorizacao === 'VISITANTE' ? 'Visitante do totem' : '—')}
                    <div className="tiny muted">{veiculo?.montadora} {veiculo?.modelo}</div>
                  </td>
                  <td style={{ minWidth: 90 }}>
                    <div className="tiny num">{num(Math.round(s?.socAtual ?? 0))}%</div>
                    <Bar valor={(s?.socAtual ?? 0) / 100} />
                  </td>
                  <td className="r num">{kw(a.potenciaSolicitadaKW)}</td>
                  <td className="r num strong">{kw(a.potenciaConcedidaKW)}</td>
                  <td>
                    {a.pausado ? <StatusBadge estado="PAUSADO" />
                      : a.limitado ? <Badge tom="warn"><Icone nome="relogio" tamanho={12} />Reduzido</Badge>
                        : <Badge tom="pos"><Icone nome="check" tamanho={12} />Potência cheia</Badge>}
                  </td>
                  <td className="tiny muted">{a.motivo ?? '—'}</td>
                </tr>
              );
            })}
          </Tabela>
        )}
      </Card>

      <Card title="Carga do comércio ao longo do dia"
            sub="Quanto sobra para recarga em cada horário">
        <ResponsiveContainer width="100%" height={230}>
          <AreaChart data={projecao} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...gradeProps} />
            <XAxis dataKey="hora" {...eixoProps} minTickGap={20} />
            <YAxis {...eixoProps} width={62} tickFormatter={eixoKW} domain={[0, Math.ceil(ponto.limitePotenciaKW * 1.1)]} />
            <Tooltip content={<ChartTip fmt={(v) => kw(v)} nomes={{ comercio: 'Carga do comércio' }} />} />
            <ReferenceLine y={ponto.limitePotenciaKW} stroke={CHART.neg} strokeWidth={2}
                           label={{ value: `limite ${kw(ponto.limitePotenciaKW)}`, fontSize: 11, fill: CHART.neg, position: 'insideTopRight' }} />
            <ReferenceLine y={ponto.limitePotenciaKW * 0.92} stroke={CHART.meta} strokeDasharray="4 3"
                           label={{ value: 'margem de segurança (92%)', fontSize: 11, fill: CHART.meta, position: 'insideBottomRight' }} />
            <ReferenceLine x={`${agora}h`} stroke={CHART.texto} strokeOpacity={0.5} strokeDasharray="2 3"
                           label={{ value: 'agora', fontSize: 11, fill: CHART.rotulo, position: 'insideTopLeft' }} />
            <Area type="monotone" dataKey="comercio" stroke={CHART.neutro} fill={CHART.neutroFill} strokeWidth={2}
                  name="Carga do comércio" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
        <div className="tiny muted" style={{ marginTop: 6 }}>
          Quanto mais alta a carga do comércio, menos potência sobra — é nessas horas que o
          controle de demanda entra em ação.
        </div>
      </Card>
    </div>
  );
}
