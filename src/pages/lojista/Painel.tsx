import {
  AreaChart, Area, BarChart, Bar as RBar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { useApp } from '../../app/estado';
import {
  kpisDoPonto, serieDiaria, perfilHorario, obterPonto, economiaDoPonto,
  sessoesAtivas, inteligenciaDoPonto, carregadoresDoPonto, solarDoPonto,
} from '../../domain/db';
import { REGRAS } from '../../domain/catalogo';
import { Card, KPI, Nota, brl, num, pct, Badge, Bar, ChartTip, CHART, eixoProps, gradeProps } from '../../ui/kit';
import { Icone } from '../../ui/icones';

export default function Painel() {
  const { pontoId } = useApp();
  const ponto = obterPonto(pontoId)!;
  const kpis = kpisDoPonto(pontoId);
  const eco = economiaDoPonto(pontoId);
  const serie = serieDiaria(pontoId, 30);
  const horario = perfilHorario(pontoId);
  const ativas = sessoesAtivas(pontoId);
  const carregadores = carregadoresDoPonto(pontoId);
  const { resumo } = inteligenciaDoPonto(pontoId);
  const solar = solarDoPonto(pontoId);

  // variação vs. mês anterior (mesma janela de dias), para as setas de tendência
  const metade = Math.floor(serie.length / 2);
  const somaFat = (arr: typeof serie) => arr.reduce((t, d) => t + d.faturamento, 0);
  const anterior = somaFat(serie.slice(0, metade));
  const atual = somaFat(serie.slice(metade));
  const tendencia = anterior > 0 ? (atual - anterior) / anterior : 0;

  return (
    <div className="stack">
      <div className="grid g4">
        <KPI label="Faturamento do mês" value={brl(kpis.faturamentoMes)} accent="red"
             trend={tendencia}
             foot={`${kpis.sessoesMes} sessões · ticket ${brl(kpis.ticketMedio)}`} />
        <KPI label="Energia entregue" value={`${num(kpis.energiaMesKWh)} kWh`} accent="teal"
             foot={`custo ${brl(kpis.custoEnergiaMes)}`} />
        <KPI label="Resultado líquido" value={brl(kpis.liquidoMes)} accent="green"
             foot={`royalties ${brl(kpis.royaltiesMes)} já descontados`} />
        <KPI label="Uso por carregador" value={`${num(kpis.horasUsoDia, 1)} h/dia`}
             accent={eco.acimaDoLimiar ? 'green' : 'red'}
             foot={`limiar de viabilidade: ${REGRAS.limiarViabilidadeHoras} h/dia`} />
      </div>

      {!eco.acimaDoLimiar && (
        <Nota titulo="Este ponto está abaixo do limiar de viabilidade">
          Com {num(kpis.horasUsoDia, 1)} h/dia por carregador, a unidade não se paga no prazo esperado
          (mínimo {REGRAS.limiarViabilidadeHoras} h/dia). Veja as ações sugeridas na aba Inteligência.
        </Nota>
      )}

      <div className="grid g-2-1">
        <Card title="Faturamento e energia" sub="Últimos 30 dias">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={serie}>
              <defs>
                <linearGradient id="gf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART.serie1} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={CHART.serie1} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gradeProps} />
              <XAxis dataKey="dia" {...eixoProps} minTickGap={24} />
              <YAxis {...eixoProps} />
              <Tooltip content={<ChartTip fmt={brl} />} />
              <Area type="monotone" dataKey="faturamento" stroke={CHART.serie1Claro} fill="url(#gf)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <div className="stack">
          <Card title="Agora no ponto">
            <div className="row between">
              <div>
                <div className="kpi-value sm">{ativas.length}/{carregadores.length}</div>
                <div className="tiny muted">vagas ocupadas</div>
              </div>
              {ativas.length > 0 && <Badge tom="teal" dot pulse>ao vivo</Badge>}
            </div>
            <div style={{ marginTop: 10 }}>
              <Bar valor={carregadores.length ? ativas.length / carregadores.length : 0} thick />
            </div>
            <div className="sep" />
            <div className="tiny muted">
              {ponto.formato} · {ponto.segmento}<br />{ponto.endereco}
            </div>
          </Card>

          <Card title="Retorno da unidade">
            <div className="row between tiny"><span className="muted">Investimento</span><span className="num">{brl(eco.capex)}</span></div>
            <div className="row between tiny"><span className="muted">Líquido recarga/mês</span><span className="num">{brl(eco.liquidoRecarga)}</span></div>
            <div className="row between tiny"><span className="muted">Ganho no varejo/mês</span><span className="num kpi-accent-green">{brl(eco.margemVarejo)}</span></div>
            <div className="sep" />
            <div className="row between">
              <span className="strong tiny">Payback estimado</span>
              <span className="strong num">{eco.paybackMeses === Infinity ? '—' : `${num(eco.paybackMeses, 0)} meses`}</span>
            </div>
            <div className="tiny muted" style={{ marginTop: 6 }}>
              Quase metade do resultado vem do movimento que a recarga traz para a loja.
            </div>
          </Card>
        </div>
      </div>

      <div className="grid g-2-1">
        <Card title="Movimento por hora" sub="Quando os clientes param aqui para carregar">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={horario}>
              <CartesianGrid {...gradeProps} />
              <XAxis dataKey="hora" {...eixoProps} tickFormatter={(h) => `${h}h`} />
              <YAxis {...eixoProps} />
              <Tooltip content={<ChartTip fmt={(v) => `${v} sessões`} />} />
              <RBar dataKey="sessoes" fill={CHART.serie1} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Leitura da IA" sub="Resumo gerencial automático">
          <p className="tiny">{resumo}</p>
        </Card>
      </div>

      <Card
        title="Ecossistema GoodWe no ponto"
        sub="Modos Prioridade Solar e FV + Bateria do HCA G2 — quanto da energia vem do sol"
        action={
          solar.resumo.temEcossistema ? (
            <div className="pill-row">
              <Badge tom="solar"><Icone nome="sol" tamanho={12} /> {num(solar.resumo.potenciaFVkWp, 1)} kWp</Badge>
              {solar.resumo.capacidadeBateriaKWh > 0 && (
                <Badge tom="teal"><Icone nome="bateria" tamanho={12} /> {num(solar.resumo.capacidadeBateriaKWh)} kWh</Badge>
              )}
            </div>
          ) : <Badge tom="gray">sem geração própria</Badge>
        }
      >
        {solar.resumo.temEcossistema ? (
          <div className="grid g-2-1">
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={solar.mix.map((m) => ({ ...m, rotulo: `${m.hora}h` }))}>
                <CartesianGrid {...gradeProps} />
                <XAxis dataKey="rotulo" {...eixoProps} minTickGap={16} />
                <YAxis {...eixoProps} unit=" kW" />
                <Tooltip content={<ChartTip fmt={(v) => `${num(v, 1)} kW`} />} />
                <Area type="monotone" dataKey="solarKW" stackId="1" name="Solar"
                      stroke={CHART.serie3} fill="rgba(255,176,32,.28)" strokeWidth={2} />
                <Area type="monotone" dataKey="baterialKW" stackId="1" name="Bateria"
                      stroke={CHART.serie2} fill="rgba(61,220,151,.22)" strokeWidth={2} />
                <Area type="monotone" dataKey="redeKW" stackId="1" name="Rede"
                      stroke={CHART.neutro} fill={CHART.neutroFill} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>

            <div className="stack" style={{ gap: 11 }}>
              <div>
                <div className="kpi-label">Autossuficiência</div>
                <div className="kpi-value sm kpi-accent-solar">{pct(solar.resumo.autossuficiencia)}</div>
                <div className="tiny muted">da energia do ponto vem de sol e bateria</div>
              </div>
              <div>
                <div className="kpi-label">Economia na energia vendida</div>
                <div className="kpi-value sm kpi-accent-green">{brl(solar.resumo.economiaRecargaMes)}</div>
                <div className="tiny muted">
                  parte da recarga que veio do sol · a conta de luz inteira do comércio economiza{' '}
                  {brl(solar.resumo.economiaMes)}/mês
                </div>
              </div>
              <div>
                <div className="kpi-label">CO₂ evitado</div>
                <div className="kpi-value sm">{num(solar.resumo.co2EvitadoMesKg, 1)} kg</div>
                <div className="tiny muted">por mês (fator médio do SIN)</div>
              </div>
            </div>
          </div>
        ) : (
          <Nota titulo="Oportunidade: este ponto ainda não tem geração própria" tom="amber">
            Instalar inversor e painéis GoodWe aqui reduziria o custo do kWh vendido e liberaria
            potência na entrada elétrica em horário de pico — menos pausa na recarga e mais margem
            para o franqueado. É a porta de entrada natural para o ecossistema GoodWe.
          </Nota>
        )}
      </Card>
    </div>
  );
}
