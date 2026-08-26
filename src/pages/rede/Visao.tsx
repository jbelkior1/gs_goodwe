import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  kpisDaRede, desempenhoPorRegiao, serieDiaria, rankingPontos, base, noMesAtual, solarDaRede,
} from '../../domain/db';
import { REGRAS, MODELOS_CARREGADOR } from '../../domain/catalogo';
import {
  Card, KPI, Tabela, Badge, Bar, brl, num, Nota, ChartTip,
  CHART, eixoProps, gradeProps,
} from '../../ui/kit';

export default function Visao() {
  const k = kpisDaRede();
  const regioes = desempenhoPorRegiao();
  const serie = serieDiaria(null, 30);
  const ranking = rankingPontos();

  const maxFat = Math.max(...regioes.map((r) => r.faturamento), 1);

  // ---- receita da franqueadora e frota (abas de royalties e frota, embutidas aqui)
  const cobrancasMes = base.cobrancas.filter((c) => noMesAtual(c.criadaEm) && c.status === 'PAGO');
  const recorrente =
    cobrancasMes.reduce((t, c) => t + c.royaltyGoodWe + c.fundoMarketing, 0) +
    base.pontos.filter((p) => p.ativo).length * REGRAS.plataformaMes;
  const potenciaInstalada = base.carregadores.reduce(
    (t, c) => t + MODELOS_CARREGADOR[c.modelo].potenciaKW, 0,
  );
  const solar = solarDaRede();

  return (
    <div className="stack">
      <div className="grid g5">
        <KPI label="Pontos ativos" value={`${k.pontosAtivos}/${k.pontosTotal}`} accent="red"
             foot={`${k.carregadoresTotal} carregadores`} />
        <KPI label="Faturamento da rede" value={brl(k.faturamentoRedeMes)}
             foot="no mês, todos os pontos" />
        <KPI label="Royalties + fundo" value={brl(k.royaltiesMes)} accent="green"
             foot="receita da franqueadora" />
        <KPI label="Energia entregue" value={`${num(k.energiaMesKWh)} kWh`} accent="teal"
             foot={`${k.sessoesMes} sessões`} />
        <KPI label="Abaixo do limiar" value={k.pontosAbaixoDoLimiar}
             accent={k.pontosAbaixoDoLimiar > 0 ? 'red' : 'green'}
             foot={`< ${REGRAS.limiarViabilidadeHoras} h/dia por carregador`} />
      </div>

      {k.pontosAbaixoDoLimiar > 0 && (
        <Nota titulo={`${k.pontosAbaixoDoLimiar} pontos precisam de atenção`}>
          Esses pontos operam abaixo de {REGRAS.limiarViabilidadeHoras} h/dia por carregador e não
          se pagam no prazo esperado. É exatamente o cenário que a homologação existe para evitar —
          e onde a rede deve agir com plano de ativação comercial.
        </Nota>
      )}

      <div className="grid g-2-1">
        <Card title="Faturamento consolidado" sub="Rede inteira, últimos 30 dias">
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={serie}>
              <defs>
                <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART.serie1} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={CHART.serie1} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gradeProps} />
              <XAxis dataKey="dia" {...eixoProps} minTickGap={24} />
              <YAxis {...eixoProps} />
              <Tooltip content={<ChartTip fmt={brl} />} />
              <Area type="monotone" dataKey="faturamento" stroke={CHART.serie1Claro} fill="url(#gr)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Desempenho por região" sub="Onde a rede fatura mais">
          <div className="stack" style={{ gap: 9 }}>
            {regioes.slice(0, 8).map((r) => (
              <div key={r.regiao.id}>
                <div className="row between tiny">
                  <span className="strong">{r.regiao.cidade}/{r.regiao.uf}</span>
                  <span className="num">{brl(r.faturamento)}</span>
                </div>
                <Bar valor={r.faturamento / maxFat} />
                <div className="tiny muted">{r.pontos} ponto(s) · {num(r.energia)} kWh · {r.sessoes} sessões</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid g4">
        <KPI label="Recorrente GoodWe/mês" value={brl(recorrente)} sm accent="red"
             foot="royalties 6% + fundo 2% + plataforma" />
        <KPI label="Projeção anual" value={brl(recorrente * 12)} sm accent="green"
             foot="mantendo a base atual" />
        <KPI label="Potência instalada" value={`${num(potenciaInstalada)} kW`} sm accent="teal"
             foot={`${k.carregadoresTotal} carregadores na rede`} />
        <KPI label="Carregadores offline" value={k.carregadoresOffline} sm
             accent={k.carregadoresOffline ? 'red' : 'green'}
             foot="sem telemetria — não aceitam sessão" />
      </div>

      <Card
        title="Ecossistema GoodWe na rede"
        sub="Cada ponto é também um cliente potencial de inversor, bateria e solar"
      >
        <div className="grid g4">
          <div>
            <div className="kpi-label">Pontos com geração própria</div>
            <div className="kpi-value sm kpi-accent-solar">
              {solar.pontosComSolar}<span className="tiny muted">/{base.pontos.length}</span>
            </div>
            <div className="tiny muted">{num(solar.potenciaFVkWp, 1)} kWp instalados</div>
          </div>
          <div>
            <div className="kpi-label">Com bateria</div>
            <div className="kpi-value sm kpi-accent-teal">{solar.pontosComBateria}</div>
            <div className="tiny muted">modo FV + Bateria ativo</div>
          </div>
          <div>
            <div className="kpi-label">Solar na energia vendida</div>
            <div className="kpi-value sm kpi-accent-green">{brl(solar.economiaRecargaMes)}</div>
            <div className="tiny muted">economia no custo da recarga, por mês</div>
          </div>
          <div>
            <div className="kpi-label">Oportunidade aberta</div>
            <div className="kpi-value sm kpi-accent-red">{solar.pontosSemSolar}</div>
            <div className="tiny muted">pontos ainda sem solar — leads qualificados</div>
          </div>
        </div>
        <div className="sep" />
        <div className="tiny muted">
          A franquia de recarga funciona como canal de aquisição: cada comércio que entra na rede
          instala carga elétrica nova e vira candidato natural a inversor, bateria e geração solar
          GoodWe. Também são <b>{num(solar.co2EvitadoMesKg, 1)} kg de CO₂</b> evitados por mês.
        </div>
      </Card>

      <Card title="Ranking de pontos" sub="Desempenho de cada unidade no mês">
        <div className="scroll-y">
        <Tabela cabecalho={['#', 'Ponto', 'Formato', 'Região', '#Sessões', '#Energia', '#Faturamento', 'Uso/dia']}>
          {ranking.map((r, i) => {
            const ok = r.kpis.horasUsoDia >= REGRAS.limiarViabilidadeHoras;
            return (
              <tr key={r.ponto.id}>
                <td className="muted">{i + 1}</td>
                <td className="strong">{r.ponto.nome}</td>
                <td><Badge tom="gray">{r.ponto.formato}</Badge></td>
                <td className="tiny muted">{r.ponto.segmento}</td>
                <td className="r num">{r.kpis.sessoesMes}</td>
                <td className="r num">{num(r.kpis.energiaMesKWh)} kWh</td>
                <td className="r num strong">{brl(r.kpis.faturamentoMes)}</td>
                <td>
                  <Badge tom={ok ? 'green' : 'red'}>{num(r.kpis.horasUsoDia, 1)} h</Badge>
                </td>
              </tr>
            );
          })}
        </Tabela>
        </div>
      </Card>
    </div>
  );
}
