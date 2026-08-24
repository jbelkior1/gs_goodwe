import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { useApp } from '../../app/estado';
import { inteligenciaDoPonto, obterPonto } from '../../domain/db';
import { REGRAS } from '../../domain/catalogo';
import { Card, KPI, Nota, Badge, brl, num, pct, Vazio, Tabela, tipPct } from '../../ui/kit';

export default function Inteligencia() {
  const { pontoId } = useApp();
  const ponto = obterPonto(pontoId)!;
  const { previsao, recomendacoes, resumo, anomalias, kpis } = inteligenciaDoPonto(pontoId);

  const dados = previsao.map((p) => ({
    hora: `${p.hora}h`,
    ocupacao: Number((p.ocupacaoPrevista * 100).toFixed(1)),
    energia: p.energiaPrevistaKWh,
  }));
  const pico = [...previsao].sort((a, b) => b.ocupacaoPrevista - a.ocupacaoPrevista)[0];

  return (
    <div className="stack">
      <Card title="Resumo gerencial" sub="A IA traduz os números em texto — o que fazer, não só o que aconteceu">
        <p style={{ fontSize: 13.5 }}>{resumo}</p>
      </Card>

      <div className="grid g4">
        <KPI label="Pico previsto" value={`${pico?.hora ?? '—'}h`} accent="red"
             foot={`ocupação ~${pct(pico?.ocupacaoPrevista ?? 0)}`} />
        <KPI label="Uso atual" value={`${num(kpis.horasUsoDia, 1)} h/dia`}
             accent={kpis.horasUsoDia >= REGRAS.limiarViabilidadeHoras ? 'green' : 'red'}
             foot={`limiar ${REGRAS.limiarViabilidadeHoras} h/dia`} />
        <KPI label="Ticket médio" value={brl(kpis.ticketMedio)} foot="por sessão" />
        <KPI label="Anomalias" value={anomalias.length}
             accent={anomalias.length ? 'red' : 'green'} foot="detectadas automaticamente" />
      </div>

      <Card title="Previsão de ocupação por hora"
            sub="Mistura o histórico real do ponto com a curva do setor — quanto mais dados, mais o histórico pesa">
        <ResponsiveContainer width="100%" height={230}>
          <AreaChart data={dados}>
            <defs>
              <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0f8b8d" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#0f8b8d" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#eef1f6" vertical={false} />
            <XAxis dataKey="hora" tick={{ fontSize: 10 }} stroke="#7a8798" minTickGap={16} />
            <YAxis tick={{ fontSize: 10 }} stroke="#7a8798" unit="%" />
            <Tooltip formatter={tipPct} />
            <Area type="monotone" dataKey="ocupacao" stroke="#0f8b8d" fill="url(#gi)" strokeWidth={2}
                  name="Ocupação prevista" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid g-2-1">
        <Card title="Recomendações" sub="Cada uma muda uma decisão concreta do sistema">
          {recomendacoes.length === 0 ? (
            <Vazio>Nada crítico no momento — o ponto está operando dentro do esperado.</Vazio>
          ) : (
            <div className="stack">
              {recomendacoes.map((r) => (
                <Nota
                  key={r.id}
                  titulo={r.titulo}
                  tom={r.severidade === 'critico' ? 'red' : r.severidade === 'atencao' ? 'amber' : 'teal'}
                >
                  {r.detalhe}
                  <div style={{ marginTop: 6 }}>
                    <Badge tom="gray">Decisão afetada: {r.decisao}</Badge>
                  </div>
                </Nota>
              ))}
            </div>
          )}
        </Card>

        <Card title="Anomalias" sub="Monitoramento contínuo">
          {anomalias.length === 0 ? (
            <Vazio>Nenhuma anomalia detectada.</Vazio>
          ) : (
            <div className="stack">
              {anomalias.map((a) => (
                <Nota key={a.id} titulo={a.tipo} tom="amber">{a.detalhe}</Nota>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Onde a IA age neste ponto" sub={`${ponto.nome} · ${ponto.formato}`}>
        <Tabela cabecalho={['A IA faz', 'Muda a decisão de...']}>
          <tr><td className="strong">Prever demanda</td><td>quanta potência pré-alocar e que horário sugerir ao motorista</td></tr>
          <tr><td className="strong">Precificar</td><td>o preço do kWh mostrado antes de iniciar a sessão</td></tr>
          <tr><td className="strong">Controlar potência</td><td>reduzir ou pausar carga para não estourar o disjuntor</td></tr>
          <tr><td className="strong">Resumir em linguagem</td><td>o que o painel recomenda ao lojista</td></tr>
        </Tabela>
      </Card>
    </div>
  );
}
