import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { base, inteligenciaDoPonto, rankingPontos, perfilHorario } from '../../domain/db';
import { REGRAS } from '../../domain/catalogo';
import { Card, KPI, Nota, Badge, Tabela, num, pct, brl, Vazio } from '../../ui/kit';

export default function IA() {
  const ranking = rankingPontos();

  // consolida recomendações e anomalias de toda a rede
  const insights = base.pontos
    .filter((p) => p.ativo)
    .map((p) => ({ ponto: p, ia: inteligenciaDoPonto(p.id) }));

  const recomendacoes = insights.flatMap((i) =>
    i.ia.recomendacoes.map((r) => ({ ...r, nomePonto: i.ponto.nome })),
  );
  const anomalias = insights.flatMap((i) =>
    i.ia.anomalias.map((a) => ({ ...a, nomePonto: i.ponto.nome })),
  );

  const criticas = recomendacoes.filter((r) => r.severidade === 'critico');
  const perfil = perfilHorario(null);
  const totalSessoes = perfil.reduce((t, h) => t + h.sessoes, 0);

  const curvaRede = perfil.map((h) => ({
    hora: `${h.hora}h`,
    sessoes: h.sessoes,
    participacao: totalSessoes ? Number(((h.sessoes / totalSessoes) * 100).toFixed(1)) : 0,
  }));

  const picoRede = [...perfil].sort((a, b) => b.sessoes - a.sessoes)[0];
  const abaixoLimiar = ranking.filter((r) => r.kpis.horasUsoDia < REGRAS.limiarViabilidadeHoras);

  return (
    <div className="stack">
      <div className="grid g4">
        <KPI label="Pico da rede" value={`${picoRede?.hora ?? '—'}h`} accent="red"
             foot={`${picoRede?.sessoes ?? 0} sessões nesse horário`} />
        <KPI label="Recomendações ativas" value={recomendacoes.length} accent="teal"
             foot={`${criticas.length} críticas`} />
        <KPI label="Anomalias detectadas" value={anomalias.length}
             accent={anomalias.length ? 'red' : 'green'} />
        <KPI label="Base de treino" value={num(base.sessoes.length)}
             foot="sessões acumuladas alimentando os modelos" />
      </div>

      <Nota titulo="Como a IA aprende (cold start)" tom="teal">
        No dia 1 não há histórico: os modelos partem de <b>regras + a curva pública do setor</b>.
        Conforme a rede opera, o peso do histórico real cresce e os modelos assumem. Hoje já são{' '}
        <b>{num(base.sessoes.length)} sessões</b> acumuladas — cada ponto novo deixa a rede inteira
        mais esperta. Esse é o ativo que a franquia entrega à GoodWe.
      </Nota>

      <Card title="Curva de demanda da rede" sub="Distribuição das recargas ao longo do dia — a base da previsão">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={curvaRede}>
            <defs>
              <linearGradient id="gia" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5b3fa8" stopOpacity={0.32} />
                <stop offset="100%" stopColor="#5b3fa8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#eef1f6" vertical={false} />
            <XAxis dataKey="hora" tick={{ fontSize: 10 }} stroke="#7a8798" minTickGap={16} />
            <YAxis tick={{ fontSize: 10 }} stroke="#7a8798" />
            <Tooltip />
            <Area type="monotone" dataKey="sessoes" stroke="#5b3fa8" fill="url(#gia)" strokeWidth={2}
                  name="Sessões" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid g2">
        <Card title="Recomendações da rede" sub="Cada uma muda uma decisão concreta">
          {recomendacoes.length === 0 ? (
            <Vazio>Nenhuma recomendação no momento.</Vazio>
          ) : (
            <div className="stack scroll-y">
              {recomendacoes.slice(0, 12).map((r) => (
                <Nota
                  key={r.id}
                  titulo={`${r.nomePonto} — ${r.titulo}`}
                  tom={r.severidade === 'critico' ? 'red' : r.severidade === 'atencao' ? 'amber' : 'teal'}
                >
                  {r.detalhe}
                  <div style={{ marginTop: 6 }}><Badge tom="gray">Decisão: {r.decisao}</Badge></div>
                </Nota>
              ))}
            </div>
          )}
        </Card>

        <Card title="Pontos abaixo do limiar" sub="Onde a IA recomenda ação da franqueadora">
          {abaixoLimiar.length === 0 ? (
            <Vazio>Todos os pontos estão acima do limiar de viabilidade.</Vazio>
          ) : (
            <Tabela cabecalho={['Ponto', 'Formato', '#Uso/dia', '#Faturamento', 'Ação sugerida']}>
              {abaixoLimiar.map((r) => (
                <tr key={r.ponto.id}>
                  <td className="strong tiny">{r.ponto.nome}</td>
                  <td><Badge tom="gray">{r.ponto.formato}</Badge></td>
                  <td className="r"><Badge tom="red">{num(r.kpis.horasUsoDia, 1)} h</Badge></td>
                  <td className="r num tiny">{brl(r.kpis.faturamentoMes)}</td>
                  <td className="tiny muted">
                    {r.kpis.sessoesMes < 30 ? 'Divulgar em apps de mapa e sinalizar a fachada'
                      : 'Rever preço e criar combo com a loja'}
                  </td>
                </tr>
              ))}
            </Tabela>
          )}
        </Card>
      </div>

      <Card title="O motor de decisão" sub="Onde a IA atua e o que ela muda">
        <Tabela cabecalho={['Modelo', 'Entrada', 'Saída', 'Decisão que muda']}>
          <tr>
            <td className="strong">Previsão de demanda</td>
            <td className="tiny">histórico de sessões, hora, dia da semana</td>
            <td className="tiny">curva de ocupação esperada</td>
            <td className="tiny">pré-alocação de potência e horário sugerido</td>
          </tr>
          <tr>
            <td className="strong">Precificação dinâmica</td>
            <td className="tiny">ocupação prevista, custo de energia da região</td>
            <td className="tiny">fator de tarifa por faixa</td>
            <td className="tiny">preço do kWh mostrado antes de iniciar</td>
          </tr>
          <tr>
            <td className="strong">Orquestração de potência</td>
            <td className="tiny">telemetria ao vivo + limite do ponto</td>
            <td className="tiny">limite de corrente por sessão</td>
            <td className="tiny">reduzir, pausar ou retomar a carga</td>
          </tr>
          <tr>
            <td className="strong">Viabilidade do ponto</td>
            <td className="tiny">fluxo, região, segmento, carga elétrica</td>
            <td className="tiny">score e horas de uso previstas</td>
            <td className="tiny">aprovar ou reprovar a homologação</td>
          </tr>
          <tr>
            <td className="strong">Síntese em linguagem</td>
            <td className="tiny">métricas da unidade e da rede</td>
            <td className="tiny">texto gerencial</td>
            <td className="tiny">o que o painel recomenda ao gestor</td>
          </tr>
        </Tabela>
        <div className="tiny muted" style={{ marginTop: 8 }}>
          Regra do projeto: se um modelo não muda nenhuma decisão, ele não entra no sistema.
          Cobertura atual: {pct(insights.length / Math.max(1, base.pontos.length))} dos pontos com
          análise ativa.
        </div>
      </Card>
    </div>
  );
}
