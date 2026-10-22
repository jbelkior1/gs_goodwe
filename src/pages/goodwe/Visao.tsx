import { useRef, useState } from 'react';
import {
  resumoDaRede, kpisDaRede, desempenhoPorRegiao, serieDoPeriodo, rankingPontos, base,
  atencaoDaRede, dadosAte, type ItemAtencao,
} from '../../domain/db';
import { REGRAS } from '../../domain/catalogo';
import { brl, brlCurto, dataHora, horas, kwh, num, plural } from '../../domain/formato';
import {
  Card, KPI, Badge, Bar, ChartFrame, GraficoDiario, ListaAtencao, StatusBadge, TabelaOrdenavel,
  EmptyState, type ColunaOrdenavel,
} from '../../ui/kit';
import { Icone } from '../../ui/icones';
import { AgoraNaRede } from './AgoraNaRede';

type LinhaPonto = ReturnType<typeof rankingPontos>[number];

const dm = (chave: string) => `${chave.slice(8, 10)}/${chave.slice(5, 7)}`;
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function Visao() {
  const [busca, setBusca] = useState('');
  const [todasZonas, setTodasZonas] = useState(false);
  const tabelaRef = useRef<HTMLDivElement>(null);

  const r = resumoDaRede('mes');
  const k = kpisDaRede();
  const regioes = desempenhoPorRegiao();
  const serie = serieDoPeriodo(null, 'mes');
  const ranking = rankingPontos();
  const atencao = atencaoDaRede();
  const ate = dadosAte();
  const base_ = r.periodo.anterior.base;
  const meta = REGRAS.limiarViabilidadeHoras;

  const maxFat = Math.max(...regioes.map((x) => x.faturamento), 1);
  const zonas = todasZonas ? regioes : regioes.slice(0, 6);

  // "Ver na tabela": filtra pelo nome do ponto e leva a tela até lá
  const verNaTabela = (item: ItemAtencao) => {
    const ponto = base.pontos.find((p) => p.id === item.pontoId);
    if (!ponto) return;
    setBusca(ponto.nome);
    tabelaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const termo = semAcento(busca.trim());
  const linhas = termo
    ? ranking.filter((l) => semAcento([
        l.ponto.nome, l.regiao.zona, l.regiao.cidade, l.regiao.uf, l.ponto.segmento, l.ponto.formato, l.status,
      ].join(' ')).includes(termo))
    : ranking;

  const colunas: ColunaOrdenavel<LinhaPonto>[] = [
    {
      id: 'ponto', rotulo: 'Ponto', valor: (l) => l.ponto.nome,
      celula: (l) => <span className="strong">{l.ponto.nome}</span>,
    },
    {
      id: 'zona', rotulo: 'Zona', valor: (l) => l.regiao.zona,
      celula: (l) => <span className="tiny muted">{l.regiao.zona} · {l.regiao.cidade}/{l.regiao.uf}</span>,
    },
    { id: 'formato', rotulo: 'Formato', valor: (l) => l.ponto.formato, celula: (l) => <Badge tom="neu">{l.ponto.formato}</Badge> },
    { id: 'segmento', rotulo: 'Segmento', valor: (l) => l.ponto.segmento, celula: (l) => <span className="tiny muted">{l.ponto.segmento}</span> },
    { id: 'status', rotulo: 'Status', valor: (l) => l.status, celula: (l) => <StatusBadge estado={l.status} /> },
    { id: 'sessoes', rotulo: 'Sessões', direita: true, valor: (l) => l.kpis.sessoesMes, celula: (l) => <span className="num">{num(l.kpis.sessoesMes)}</span> },
    { id: 'energia', rotulo: 'Energia', direita: true, valor: (l) => l.kpis.energiaMesKWh, celula: (l) => <span className="num">{kwh(l.kpis.energiaMesKWh)}</span> },
    {
      id: 'receita', rotulo: 'Receita', direita: true, valor: (l) => l.kpis.faturamentoMes,
      celula: (l) => <span className="num strong">{brl(l.kpis.faturamentoMes)}</span>,
    },
    {
      id: 'uso', rotulo: 'Uso por vaga', valor: (l) => (l.status === 'ATIVO' ? l.kpis.horasUsoDia : null),
      celula: (l) => l.status !== 'ATIVO' ? <span className="muted">—</span> : (
        <Badge tom={l.kpis.horasUsoDia >= meta ? 'pos' : 'warn'}>
          <Icone nome={l.kpis.horasUsoDia >= meta ? 'check' : 'alerta'} tamanho={12} />
          {horas(l.kpis.horasUsoDia)}/dia
        </Badge>
      ),
    },
    {
      id: 'alertas', rotulo: 'Alertas', valor: (l) => l.alertas.length,
      celula: (l) => l.alertas.length === 0 ? <span className="muted">—</span> : (
        <span className="pill-row">
          {l.alertas.map((a) => (
            <Badge key={a} tom={a.includes('sinal') ? 'neg' : 'warn'}>
              <Icone nome="alerta" tamanho={12} />{a}
            </Badge>
          ))}
        </span>
      ),
    },
  ];

  return (
    <div className="stack">
      <div className="cabeca-pagina">
        <span className="muted tiny">
          Mês atual · {dm(r.periodo.inicio)} a {dm(r.periodo.fim)} · comparado com {base_.replace('vs ', '')}
        </span>
        {ate && <span className="dados-ate"><Icone nome="relogio" tamanho={12} />dados até {dataHora(ate)}</span>}
      </div>

      <div className="grid g6">
        <KPI label="Pontos operando" value={num(r.pontosOperando)}
             foot={(
               <>
                 de {plural(r.pontosTotal, 'ponto', 'pontos')} · {num(r.pontosInstalacao)} em instalação · {plural(r.pontosSuspensos, 'suspenso', 'suspensos')}.<br />
                 {plural(k.carregadoresTotal, 'vaga', 'vagas')} e {num(k.potenciaInstaladaKW)} kW instalados nos pontos em operação
               </>
             )} />
        <KPI label="Receita da rede" value={brl(r.receita)}
             delta={{ valor: r.variacao.receita, base: base_ }}
             foot="no mês, todos os pontos" />
        <KPI label="Receita GoodWe" value={brl(r.receitaGoodWe)}
             delta={{ valor: r.variacao.receitaGoodWe, base: base_ }}
             foot={(
               <>
                 royalties, fundo e plataforma até hoje.<br />
                 Ritmo de {brlCurto(r.receitaGoodWeMensal)}/mês; projeção de {brlCurto(r.projecaoAnual)}/ano{' '}
                 <span className="selo">estimado</span>
               </>
             )} />
        <KPI label="Energia entregue" value={kwh(r.energia)}
             delta={{ valor: r.variacao.energia, base: base_ }}
             foot="no mês, todos os pontos" />
        <KPI label="Sessões" value={num(r.sessoes)}
             delta={{ valor: r.variacao.sessoes, base: base_ }}
             foot={r.sessoes ? `ticket médio ${brl(r.receita / r.sessoes)}` : 'nenhuma recarga fechada no mês'} />
        <KPI label="Uso médio por vaga" value={num(r.horasUsoDia, 1)} unit="h/dia"
             meta={{ rotulo: `meta de ${horas(meta)}/dia`, atingida: r.horasUsoDia >= meta, progresso: Math.min(1, r.horasUsoDia / meta) }}
             foot={`média ponderada pelas ${plural(r.vagasOperando, 'vaga', 'vagas')} em operação`} />
      </div>

      <AgoraNaRede />

      <Card
        title={`Precisa de atenção${atencao.length ? ` (${num(atencao.length)})` : ''}`}
        sub="Vagas sem sinal, pontos abaixo da meta de uso e pedidos de franquia parados"
      >
        <ListaAtencao
          itens={atencao}
          max={5}
          aoVer={verNaTabela}
          vazio="Todas as vagas estão respondendo, os pontos estão dentro da meta e não há pedido parado."
        />
      </Card>

      <div className="grid g-2-1">
        <ChartFrame
          titulo="Receita diária da rede"
          sub="Do dia 1 até hoje · barras diárias e média móvel de 7 dias"
          dadosAte={ate}
          vazio={r.semDados
            ? { titulo: 'Sem recargas fechadas no mês', texto: 'O gráfico aparece quando a rede fechar a primeira recarga do mês.' }
            : null}
        >
          <GraficoDiario serie={serie} metrica="faturamento" altura={260} />
        </ChartFrame>

        <Card title="Desempenho por zona" sub="Onde a rede fatura mais no mês">
          {regioes.length === 0 ? (
            <EmptyState icone="mapa" titulo="Nenhuma zona com ponto ainda" />
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {zonas.map((z) => (
                <div key={z.regiao.id}>
                  <div className="row between tiny">
                    <span className="strong">{z.rotulo}</span>
                    <span className="num">{brl(z.faturamento)}</span>
                  </div>
                  <Bar valor={z.faturamento / maxFat} />
                  <div className="tiny muted">
                    {plural(z.pontos, 'ponto', 'pontos')} · {kwh(z.energia)} · {plural(z.sessoes, 'sessão', 'sessões')}
                    {z.operando < z.pontos ? ` · ${num(z.pontos - z.operando)} fora de operação` : ''}
                  </div>
                </div>
              ))}
              {regioes.length > 6 && (
                <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setTodasZonas((v) => !v)}>
                  {todasZonas ? 'Mostrar menos' : `Ver todas (${num(regioes.length)})`}
                </button>
              )}
            </div>
          )}
        </Card>
      </div>

      <div ref={tabelaRef} style={{ scrollMarginTop: 90 }}>
        <Card
          title="Pontos da rede"
          sub={`Mês atual · ${num(linhas.length)} de ${plural(ranking.length, 'ponto', 'pontos')}. Clique no cabeçalho para ordenar.`}
          action={
            <input
              className="busca" type="search" value={busca} placeholder="Buscar ponto, zona ou segmento"
              aria-label="Buscar ponto" onChange={(e) => setBusca(e.target.value)}
            />
          }
        >
          <div className="scroll-y" style={{ maxHeight: 520 }}>
            <TabelaOrdenavel
              colunas={colunas}
              linhas={linhas}
              chave={(l) => l.ponto.id}
              ordemInicial={{ id: 'receita', dir: 'desc' }}
              vazio={(
                <EmptyState icone="mapaLupa" titulo="Nenhum ponto encontrado"
                            acao={<button type="button" className="btn sm" onClick={() => setBusca('')}>Limpar a busca</button>}>
                  Tente outro nome, zona ou segmento.
                </EmptyState>
              )}
            />
          </div>
        </Card>
      </div>

    </div>
  );
}
