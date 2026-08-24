import {
  AreaChart, Area, BarChart, Bar as RBar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { useApp } from '../../app/estado';
import {
  kpisDoPonto, serieDiaria, perfilHorario, obterPonto, economiaDoPonto,
  sessoesAtivas, inteligenciaDoPonto, carregadoresDoPonto,
} from '../../domain/db';
import { REGRAS } from '../../domain/catalogo';
import { Card, KPI, Nota, brl, num, Badge, Bar, tipBRL } from '../../ui/kit';

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

  return (
    <div className="stack">
      <div className="grid g4">
        <KPI label="Faturamento do mês" value={brl(kpis.faturamentoMes)} accent="red"
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
                  <stop offset="0%" stopColor="#e4002b" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#e4002b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#eef1f6" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 10 }} stroke="#7a8798" minTickGap={24} />
              <YAxis tick={{ fontSize: 10 }} stroke="#7a8798" />
              <Tooltip formatter={tipBRL} />
              <Area type="monotone" dataKey="faturamento" stroke="#e4002b" fill="url(#gf)" strokeWidth={2} />
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
              <CartesianGrid stroke="#eef1f6" vertical={false} />
              <XAxis dataKey="hora" tick={{ fontSize: 10 }} stroke="#7a8798" tickFormatter={(h) => `${h}h`} />
              <YAxis tick={{ fontSize: 10 }} stroke="#7a8798" />
              <Tooltip labelFormatter={(h) => `${h}h`} />
              <RBar dataKey="sessoes" fill="#0f8b8d" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Leitura da IA" sub="Resumo gerencial automático">
          <p className="tiny">{resumo}</p>
        </Card>
      </div>
    </div>
  );
}
