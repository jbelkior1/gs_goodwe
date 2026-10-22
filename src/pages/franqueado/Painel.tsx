import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar as RBar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { useApp } from '../../app/estado';
import {
  obterPonto, statusDoPonto, PERIODOS, resumoDoPonto, projecaoDoPonto, serieDoPeriodo, perfilHorario,
  economiaDoPonto, inteligenciaDoPonto, carregadoresDoPonto, situacaoDaVaga,
  atencaoDoPonto, checklistAtivacao, previsaoDoPonto, dadosAte, type PeriodoId,
} from '../../domain/db';
import { REGRAS } from '../../domain/catalogo';
import { brl, horas, kwh, num, pct } from '../../domain/formato';
import {
  Card, KPI, Nota, Badge, Bar, ChartTip, CHART, eixoProps, gradeProps, StatusBadge, Segmentado,
  ChartFrame, GraficoDiario, ListaAtencao, EmptyState, TextoSituacao, METRICAS_DIA,
  type MetricaDia,
} from '../../ui/kit';
import { Icone } from '../../ui/icones';
import { totensDoPonto } from '../../data/totens';

const dm = (chave: string) => `${chave.slice(8, 10)}/${chave.slice(5, 7)}`;
const OCUPADAS = ['OCUPADO', 'ABERTA', 'AUTENTICADO', 'CARREGANDO', 'PAUSADO', 'ENCERRANDO', 'CONCLUIDO', 'PAGO'];

/** Barra da hora; a hora de maior movimento ganha destaque. */
function BarraHora(p: { x?: number; y?: number; width?: number; height?: number; payload?: { pico?: boolean } }) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = p;
  if (!(height > 0)) return <g />;
  return <rect x={x} y={y} width={width} height={height} rx={2} fill={CHART.dado} fillOpacity={payload?.pico ? 0.95 : 0.45} />;
}

/** o totem pareado mora na tabela totens: consulta ao abrir e a cada 10 s (o franqueado pareia em outra tela) */
function useTotemPareado(pontoId: string): boolean | undefined {
  const [pareado, setPareado] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    const ler = () => totensDoPonto(pontoId)
      .then((t) => { if (vivo) setPareado(t.some((x) => !!x.pareadoEm)); })
      .catch(() => { if (vivo) setPareado(undefined); });
    ler();
    const id = setInterval(ler, 10_000);
    return () => { vivo = false; clearInterval(id); };
  }, [pontoId]);
  return pareado;
}

function Checklist({ pontoId }: { pontoId: string }) {
  const passos = checklistAtivacao(pontoId, useTotemPareado(pontoId));
  return (
    <div className="checklist">
      {passos.map((p, i) => (
        <div className="passo" key={p.id}>
          <span className={`marca ${p.feito === true ? 'tom-pos' : p.feito === false ? 'tom-warn' : 'tom-neu'}`}>
            {p.feito === true ? <Icone nome="check" tamanho={13} /> : i + 1}
          </span>
          <div>
            <div className="titulo">{p.titulo}</div>
            <div className="detalhe">{p.detalhe}</div>
          </div>
          {p.feito === true ? <Badge tom="pos">Feito</Badge>
            : p.feito === false ? <Badge tom="warn">A fazer</Badge>
              : <Badge tom="neu">Confirme no ponto</Badge>}
        </div>
      ))}
    </div>
  );
}

/** As vagas do ponto agora, cada uma com o estado em palavras. */
function AgoraNoPonto({ pontoId }: { pontoId: string }) {
  const vagas = carregadoresDoPonto(pontoId).map((c) => ({ c, s: situacaoDaVaga(c) }));
  const ocupadas = vagas.filter((v) => OCUPADAS.includes(v.s.estado)).length;
  return (
    <Card
      title="Agora no ponto"
      sub={`${num(ocupadas)} de ${num(vagas.length)} ${vagas.length === 1 ? 'vaga ocupada' : 'vagas ocupadas'}`}
      action={vagas.some((v) => v.s.estado === 'CARREGANDO') ? <Badge tom="info" dot pulse>ao vivo</Badge> : undefined}
    >
      <div style={{ marginBottom: 12 }}>
        <Bar valor={vagas.length ? ocupadas / vagas.length : 0} thick />
      </div>
      {vagas.length === 0 ? (
        <EmptyState icone="tomada" titulo="Nenhuma vaga cadastrada">As vagas do formato aparecem aqui quando o ponto é concedido.</EmptyState>
      ) : vagas.map(({ c, s }) => (
        <div className="vaga-item" key={c.id}>
          <div className="topo">
            <span className="strong">{c.apelido}</span>
            <StatusBadge estado={s.estado} />
          </div>
          <div className="texto"><TextoSituacao texto={s.texto} codigo={s.codigo} /></div>
        </div>
      ))}
    </Card>
  );
}

export default function Painel() {
  const { pontoId } = useApp();
  const [periodo, setPeriodo] = useState<PeriodoId>('mes');
  const [metrica, setMetrica] = useState<MetricaDia>('faturamento');
  const ponto = obterPonto(pontoId);
  if (!ponto) return <Nota titulo="Ponto não encontrado" tom="amber">Este ponto saiu da rede. Escolha outro ponto.</Nota>;

  const status = statusDoPonto(ponto);

  // ------------------------------------------------------------ ponto ainda em instalação
  if (status === 'INSTALACAO') {
    const prev = previsaoDoPonto(pontoId);
    return (
      <div className="stack">
        <Nota titulo="Este ponto ainda está em instalação" tom="amber">
          As vendas começam quando o ponto for ativado. Siga os passos abaixo; os números reais aparecem
          aqui assim que o primeiro motorista carregar.
        </Nota>

        <div className="grid g-2-1">
          <Card
            title="Para ativar o ponto"
            sub="Dos dados do local até o ponto aparecer no mapa do motorista"
            action={<Link className="btn primary" to="/franqueado/ponto">Abrir Meu ponto e totem</Link>}
          >
            <Checklist pontoId={pontoId} />
          </Card>
          <AgoraNoPonto pontoId={pontoId} />
        </div>

        <Card
          title="O que esperar deste ponto"
          sub="Previsão da homologação — ainda não é resultado"
        >
          {prev ? (
            <div className="grid g4">
              <KPI label="Uso previsto por vaga" value={num(prev.horasUsoDia, 1)} unit="h/dia" estimado
                   meta={{ rotulo: `meta de ${horas(REGRAS.limiarViabilidadeHoras)}/dia`, atingida: prev.horasUsoDia >= REGRAS.limiarViabilidadeHoras }} />
              <KPI label="Receita bruta" value={brl(prev.receitaMes)} unit="/mês" estimado
                   foot={`${kwh(prev.energiaMesKWh)} em ${num(prev.sessoesMes)} sessões por mês`} />
              <KPI label="Resultado do comércio" value={brl(prev.resultadoMes)} unit="/mês" estimado
                   foot="depois de energia, royalties, plataforma e ganho no varejo" />
              <KPI label="Payback" value={Number.isFinite(prev.paybackMeses) ? `${num(prev.paybackMeses)} meses` : '—'} estimado
                   foot={`sobre ${brl(prev.capex)} de investimento`} />
            </div>
          ) : (
            <EmptyState icone="painel" titulo="Sem previsão para este ponto">
              A previsão vem da análise de viabilidade do pedido de franquia, e este ponto não tem um pedido ligado.
            </EmptyState>
          )}
        </Card>
      </div>
    );
  }

  // ------------------------------------------------------------ ponto operando (ou suspenso, com o histórico)
  const r = resumoDoPonto(pontoId, periodo);
  const proj = projecaoDoPonto(pontoId, periodo);
  const serie = serieDoPeriodo(pontoId, periodo);
  const horario = perfilHorario(pontoId, periodo);
  const eco = economiaDoPonto(pontoId);
  const { resumo } = inteligenciaDoPonto(pontoId);
  const atencao = atencaoDoPonto(pontoId);
  const ate = dadosAte(pontoId);
  const base = r.periodo.anterior.base;
  const meta = REGRAS.limiarViabilidadeHoras;
  const nomePeriodo = periodo === 'mes' ? 'no mês' : periodo === '7d' ? 'nos últimos 7 dias' : 'nos últimos 30 dias';

  const semDados = r.semDados
    ? {
        titulo: `Sem recargas fechadas ${nomePeriodo}`,
        texto: 'Os gráficos aparecem assim que o ponto fechar a primeira recarga do período.',
        acao: periodo !== '30d'
          ? <button type="button" className="btn sm" onClick={() => setPeriodo('30d')}>Ver os últimos 30 dias</button>
          : <Link className="btn sm" to="/franqueado/ponto">Ver as vagas do ponto</Link>,
      }
    : null;

  const pico = horario.reduce((m, h) => (h.sessoes > m.sessoes ? h : m), horario[0]);
  const dadosHora = horario.map((h) => ({ rotulo: `${h.hora}h`, sessoes: h.sessoes, pico: h.hora === pico.hora && h.total > 0 }));

  return (
    <div className="stack">
      <div className="cabeca-pagina">
        <span className="muted tiny">
          {periodo === 'mes' ? 'Mês atual' : `Últimos ${r.periodo.rotulo}`} · {dm(r.periodo.inicio)} a {dm(r.periodo.fim)}
          {' '}· comparado com {base.replace('vs ', '')}
        </span>
        <Segmentado rotulo="Período" valor={periodo} opcoes={PERIODOS} aoMudar={setPeriodo} />
      </div>

      {status === 'SUSPENSO' && (
        <Nota titulo="Ponto suspenso" tom="neg">
          O ponto não aceita novas recargas. O histórico abaixo continua disponível; fale com a GoodWe para reativar.
        </Nota>
      )}

      <div className="grid g6">
        <KPI label="Receita bruta" value={brl(r.receita)}
             delta={{ valor: r.variacao.receita, base }}
             foot={`ticket médio ${brl(r.ticketMedio)}`} />
        <KPI label="Resultado do comércio" value={brl(r.resultado)}
             delta={{ valor: r.variacao.resultado, base }}
             foot={`depois de energia, royalties e ${brl(r.plataforma)} de plataforma (proporcional aos dias)`} />
        <KPI label="Energia entregue" value={kwh(r.energia)}
             delta={{ valor: r.variacao.energia, base }}
             foot={`custo de energia ${brl(r.custoEnergia)}`} />
        <KPI label="Sessões" value={num(r.sessoes)}
             delta={{ valor: r.variacao.sessoes, base }}
             foot={`${num(r.sessoes / r.periodo.diasDecorridos, 1)} por dia`} />
        <KPI label="Uso por vaga" value={num(r.horasUsoDia, 1)} unit="h/dia"
             delta={{ valor: r.variacao.horasUsoDia, base }}
             meta={{ rotulo: `meta de ${horas(meta)}/dia`, atingida: r.horasUsoDia >= meta, progresso: Math.min(1, r.horasUsoDia / meta) }} />
        <KPI label="Payback projetado"
             value={Number.isFinite(proj.paybackMeses) ? `${num(proj.paybackMeses)} meses` : '—'} estimado
             foot={Number.isFinite(proj.paybackMeses)
               ? `no ritmo de ${brl(proj.resultadoMensal)} por mês sobre ${brl(proj.capex)} investidos${proj.confiavel ? '' : ' · poucos dados, pode mudar bastante'}`
               : 'no ritmo atual a unidade ainda não dá retorno'} />
      </div>

      <div className="grid g-2-1">
        <Card title="Precisa da sua atenção" sub="Recomendações da IA, alertas e vagas fora do ar">
          <ListaAtencao
            itens={atencao}
            vazio="Nenhuma recomendação, alerta ou vaga fora do ar neste momento."
          />
        </Card>
        <AgoraNoPonto pontoId={pontoId} />
      </div>

      <div className="grid g-2-1">
        <ChartFrame
          titulo="Receita, energia e sessões por dia"
          sub={`${r.periodo.rotulo === 'Mês atual' ? 'Do dia 1 até hoje' : `Últimos ${r.periodo.rotulo}`} · barras diárias e média móvel de 7 dias`}
          dadosAte={ate}
          vazio={semDados}
          acao={
            <Segmentado
              rotulo="Métrica" valor={metrica} aoMudar={setMetrica}
              opcoes={(Object.keys(METRICAS_DIA) as MetricaDia[]).map((id) => ({ id, rotulo: METRICAS_DIA[id].rotulo }))}
            />
          }
        >
          <GraficoDiario serie={serie} metrica={metrica} />
        </ChartFrame>

        <Card title="Retorno da unidade" sub={`Mês atual · dia ${num(Math.ceil(eco.diasDecorridos))} de ${num(eco.diasNoMes)}`}>
          <div className="row between tiny"><span className="muted">Investimento</span><span className="num">{brl(eco.capex)}</span></div>
          <div className="row between tiny"><span className="muted">Líquido da recarga no mês</span><span className="num">{brl(eco.liquidoRecarga)}</span></div>
          <div className="row between tiny"><span className="muted">Ganho no varejo no mês</span><span className="num">{brl(eco.margemVarejo)}</span></div>
          <div className="row between tiny"><span className="muted">Resultado no mês, até hoje</span><span className="num strong">{brl(eco.resultadoMes)}</span></div>
          <div className="sep" />
          <div className="row between tiny">
            <span className="muted">Resultado por mês, no ritmo atual <span className="selo">projeção</span></span>
            <span className="num">{brl(eco.resultadoMesProjetado)}</span>
          </div>
          <div className="row between" style={{ marginTop: 8 }}>
            <span className="strong tiny">Payback estimado</span>
            <span className="strong num">{Number.isFinite(eco.paybackMeses) ? `${num(eco.paybackMeses)} meses` : '—'}</span>
          </div>
          <div className="tiny muted" style={{ marginTop: 8 }}>
            {eco.resultadoMes > 0
              ? `${pct(eco.participacaoVarejo)} do resultado vem do movimento que a recarga traz para a loja.`
              : 'O ganho no varejo entra assim que as recargas trouxerem clientes para a loja.'}
          </div>
        </Card>
      </div>

      <div className="grid g-2-1">
        <ChartFrame
          titulo="Movimento por hora"
          sub={`Média de sessões por dia, ${periodo === 'mes' ? 'no mês' : periodo === '7d' ? 'nos últimos 7 dias' : 'nos últimos 30 dias'}`}
          vazio={r.sessoes < 5
            ? { titulo: 'Poucos dados para mostrar o movimento', texto: 'O gráfico aparece quando o período tiver pelo menos 5 recargas fechadas.' }
            : null}
          acao={r.sessoes >= 5 && pico.total > 0
            ? <span className="dados-ate">pico às {pico.hora}h · {num(pico.sessoes, 1)} sessões por dia</span>
            : undefined}
        >
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={dadosHora} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <CartesianGrid {...gradeProps} />
              <XAxis dataKey="rotulo" {...eixoProps} interval={1} />
              <YAxis {...eixoProps} width={36} tickFormatter={(v: number) => num(v, v % 1 ? 1 : 0)} />
              <Tooltip
                cursor={{ fill: 'rgba(244,242,238,.05)' }}
                content={<ChartTip fmt={(v) => `${num(v, 1)} sessões por dia`} nomes={{ sessoes: 'Média' }} />}
              />
              <RBar dataKey="sessoes" shape={BarraHora} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        <Card title="Leitura da IA" sub="Resumo gerencial automático do mês">
          <p className="tiny" style={{ lineHeight: 1.65 }}>{resumo}</p>
        </Card>
      </div>

    </div>
  );
}
