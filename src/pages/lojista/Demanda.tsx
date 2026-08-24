import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import { useApp } from '../../app/estado';
import {
  demandaDoPonto, obterPonto, carregadoresDoPonto, obterSessao, obterVeiculo, obterMotorista,
} from '../../domain/db';
import { cargaComercioNaHora } from '../../domain/engine/demanda';
import { geracaoSolarKW } from '../../domain/engine/solar';
import { Card, KPI, LoadBar, Tabela, Badge, Nota, num, pct, Vazio, Bar, ChartTip, EstadoBadge } from '../../ui/kit';

export default function Demanda() {
  const { pontoId } = useApp();
  const ponto = obterPonto(pontoId)!;
  const d = demandaDoPonto(pontoId);
  const carregadores = carregadoresDoPonto(pontoId);
  const solarAgoraKW = geracaoSolarKW(ponto, new Date().getHours());

  // projeção da carga do comércio ao longo do dia vs. limite
  const projecao = Array.from({ length: 24 }, (_, h) => ({
    hora: `${h}h`,
    comercio: cargaComercioNaHora(ponto, h),
    limite: ponto.limitePotenciaKW,
  }));

  return (
    <div className="stack">
      <div className="grid g4">
        <KPI label="Limite da entrada" value={`${num(ponto.limitePotenciaKW, 1)} kW`}
             foot={`${ponto.limiteCorrenteA} A · disjuntor do comércio`} />
        <KPI label="Carga do comércio" value={`${num(d.cargaComercioKW, 1)} kW`}
             foot="geladeiras, luzes, climatização" />
        <KPI label="Disponível p/ recarga" value={`${num(d.disponivelParaRecargaKW + solarAgoraKW, 1)} kW`}
             accent="teal"
             foot={solarAgoraKW > 0
               ? `inclui ${num(solarAgoraKW, 1)} kW de geração solar`
               : 'já com margem de segurança de 8%'} />
        <KPI label="Uso da entrada" value={pct(d.utilizacaoEntrada)}
             accent={d.utilizacaoEntrada > 0.85 ? 'red' : 'green'}
             foot={d.emRestricao ? 'operando em restrição' : 'dentro do limite'} />
      </div>

      <Card title="Ocupação da entrada elétrica agora"
            sub="O motor nunca deixa a soma passar do limite — é isso que impede o disjuntor de abrir">
        <LoadBar
          comercioKW={d.cargaComercioKW}
          recargaKW={d.demandaConcedidaKW}
          limiteKW={ponto.limitePotenciaKW}
          solarKW={solarAgoraKW}
        />
        {solarAgoraKW > 0 && (
          <div style={{ marginTop: 11 }}>
            <Nota titulo="O sol está ajudando agora" tom="amber">
              A geração fotovoltaica entrega <b>{num(solarAgoraKW, 1)} kW</b> neste momento. Isso
              reduz o que o ponto puxa da rede e <b>libera folga na entrada elétrica</b> — na
              prática, mais carros carregando em potência cheia no horário de pico.
            </Nota>
          </div>
        )}
        {d.emRestricao && (
          <div style={{ marginTop: 12 }}>
            <Nota titulo="Potência sendo limitada" tom="amber">
              As sessões pediram {num(d.demandaSolicitadaKW, 1)} kW e o sistema liberou{' '}
              {num(d.demandaConcedidaKW, 1)} kW. Quem está com a bateria mais vazia tem prioridade;
              quem já está quase cheio cede espaço.
            </Nota>
          </div>
        )}
      </Card>

      <Card title="Vagas do ponto" sub="Estado de cada carregador agora">
        <div className="grid g4">
          {carregadores.map((c) => {
            const aloc = d.alocacoes.find((a) => a.carregadorId === c.id);
            return (
              <div key={c.id} className="card" style={{ boxShadow: 'none' }}>
                <div className="row between">
                  <span className="strong">{c.apelido}</span>
                  <EstadoBadge estado={c.estado} />
                </div>
                <div className="tiny muted" style={{ marginTop: 2 }}>{c.modelo}</div>
                <div className="kpi-value sm" style={{ marginTop: 6 }}>
                  {num(aloc?.potenciaConcedidaKW ?? 0, 1)} kW
                </div>
                <div className="tiny muted">
                  {aloc ? `de ${num(aloc.potenciaSolicitadaKW, 1)} kW pedidos` : 'sem sessão'}
                </div>
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
                    {motorista?.nome ?? '—'}
                    <div className="tiny muted">{veiculo?.montadora} {veiculo?.modelo}</div>
                  </td>
                  <td style={{ minWidth: 90 }}>
                    <div className="tiny num">{s ? Math.round(s.socAtual) : 0}%</div>
                    <Bar valor={(s?.socAtual ?? 0) / 100} />
                  </td>
                  <td className="r num">{num(a.potenciaSolicitadaKW, 1)} kW</td>
                  <td className="r num strong">{num(a.potenciaConcedidaKW, 1)} kW</td>
                  <td>
                    {a.pausado ? <Badge tom="amber" dot>Pausado</Badge>
                      : a.limitado ? <Badge tom="teal" dot>Reduzido</Badge>
                        : <Badge tom="green" dot>Potência cheia</Badge>}
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
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={projecao}>
            <CartesianGrid stroke="#eef1f6" vertical={false} />
            <XAxis dataKey="hora" tick={{ fontSize: 10 }} stroke="#7a8798" minTickGap={20} />
            <YAxis tick={{ fontSize: 10 }} stroke="#7a8798" unit=" kW" />
            <Tooltip content={<ChartTip fmt={(v) => `${num(v, 1)} kW`} />} />
            <ReferenceLine y={ponto.limitePotenciaKW} stroke="#e4002b" strokeDasharray="4 3"
                           label={{ value: 'limite', fontSize: 10, fill: '#e4002b', position: 'right' }} />
            <Area type="monotone" dataKey="comercio" stroke="#9aa7b8" fill="#dfe5ec" strokeWidth={2}
                  name="Carga do comércio" />
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
