import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import {
  kpisDaRede, desempenhoPorRegiao, serieDiaria, rankingPontos, base,
} from '../../domain/db';
import { REGRAS } from '../../domain/catalogo';
import { Card, KPI, Tabela, Badge, Bar, brl, num, Nota, tipBRL } from '../../ui/kit';

export default function Visao() {
  const k = kpisDaRede();
  const regioes = desempenhoPorRegiao();
  const serie = serieDiaria(null, 30);
  const ranking = rankingPontos();
  const nav = useNavigate();

  const maxFat = Math.max(...regioes.map((r) => r.faturamento), 1);

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
                  <stop offset="0%" stopColor="#e4002b" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#e4002b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#eef1f6" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 10 }} stroke="#7a8798" minTickGap={24} />
              <YAxis tick={{ fontSize: 10 }} stroke="#7a8798" />
              <Tooltip formatter={tipBRL} />
              <Area type="monotone" dataKey="faturamento" stroke="#e4002b" fill="url(#gr)" strokeWidth={2} />
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

      <Card title="Top pontos da rede" sub="Ranking por faturamento no mês"
            action={<button className="btn sm" onClick={() => nav('/rede/pontos')}>Ver todos</button>}>
        <Tabela cabecalho={['#', 'Ponto', 'Formato', 'Região', '#Sessões', '#Energia', '#Faturamento', 'Uso/dia']}>
          {ranking.slice(0, 8).map((r, i) => {
            const regiao = base.pontos.find((p) => p.id === r.ponto.id);
            void regiao;
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
      </Card>
    </div>
  );
}
