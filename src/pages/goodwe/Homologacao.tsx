import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base, obterRegiao, previsaoDeUso } from '../../domain/db';
import { analisarViabilidade, cargaNecessariaKW } from '../../domain/engine/ia';
import { decidirSolicitacao } from '../../data/acoes';
import { useApp } from '../../app/estado';
import { FORMATOS, REGRAS } from '../../domain/catalogo';
import { brl, horas, kw, kwh, num, plural, relativo } from '../../domain/formato';
import {
  Card, KPI, Badge, StatusBadge, Bar, Nota, Tabela, Segmentado, EmptyState, dataCurta,
} from '../../ui/kit';
import { Icone } from '../../ui/icones';

type Ordem = 'novas' | 'score' | 'antigas';

const ORDENS: { id: Ordem; rotulo: string }[] = [
  { id: 'novas', rotulo: 'Mais novas' },
  { id: 'score', rotulo: 'Maior score' },
  { id: 'antigas', rotulo: 'Mais antigas' },
];

const EM_ABERTO = ['ANALISE', 'VISTORIA', 'PENDENTE_DOC'];
const diasDesde = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export default function Homologacao() {
  useApp();
  const [params] = useSearchParams();
  const [selecionada, setSelecionada] = useState(params.get('solicitacao') ?? '');
  const [ordem, setOrdem] = useState<Ordem>('novas');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const solicitacoes = [...base.homologacoes].sort((a, b) =>
    ordem === 'score'
      ? b.scoreViabilidade - a.scoreViabilidade || b.criadoEm.localeCompare(a.criadoEm)
      : ordem === 'antigas'
        ? a.criadoEm.localeCompare(b.criadoEm)
        : b.criadoEm.localeCompare(a.criadoEm));
  const atual = solicitacoes.find((h) => h.id === selecionada) ?? solicitacoes[0];

  const regiao = atual ? obterRegiao(atual.regiaoId) : undefined;
  const analise = atual && regiao
    ? analisarViabilidade(
        {
          fluxoDiarioPessoas: atual.fluxoDiarioPessoas,
          cargaDisponivelKW: atual.cargaDisponivelKW,
          formatoDesejado: atual.formatoDesejado,
          segmento: atual.segmento,
        },
        regiao,
      )
    : undefined;
  const previsao = atual && analise
    ? previsaoDeUso(atual.formatoDesejado, atual.regiaoId, analise.horasUsoPrevistas)
    : undefined;

  const decidir = (d: 'APROVADO' | 'REPROVADO' | 'VISTORIA') => () => {
    if (!atual || ocupado) return;
    if (d === 'APROVADO' && analise?.veredito === 'REPROVAR'
      && !window.confirm('A análise recomenda reprovar este ponto. Aprovar mesmo assim?')) return;
    setMsg(''); setOcupado(true);
    decidirSolicitacao(atual.id, d).then(() => setMsg(d === 'APROVADO' ? 'Aprovado: ponto criado em instalação para o franqueado.' : 'Decisão registrada.'))
      .catch((e: Error) => setMsg(e.message))
      .finally(() => setOcupado(false));
  };

  const emAndamento = solicitacoes.filter((h) => EM_ABERTO.includes(h.status));
  const paradas = emAndamento.filter((h) => diasDesde(h.criadoEm) > 7).length;
  // viável = passa no limiar de uso E tem carga elétrica suficiente para o formato
  const aprovaveis = solicitacoes.filter((h) => {
    const a = analisarViabilidade(
      {
        fluxoDiarioPessoas: h.fluxoDiarioPessoas,
        cargaDisponivelKW: h.cargaDisponivelKW,
        formatoDesejado: h.formatoDesejado,
        segmento: h.segmento,
      },
      obterRegiao(h.regiaoId),
    );
    return a.veredito !== 'REPROVAR';
  }).length;

  const veredito = analise?.veredito === 'APROVAR'
    ? { tom: 'pos' as const, rotulo: 'Aprovar', ico: 'check' as const }
    : analise?.veredito === 'APROVAR_COM_RESSALVA'
      ? { tom: 'warn' as const, rotulo: 'Aprovar com ressalva', ico: 'relogio' as const }
      : { tom: 'neg' as const, rotulo: 'Reprovar', ico: 'alerta' as const };
  const decidida = atual?.status === 'APROVADO';

  return (
    <div className="stack">
      <div className="grid g4">
        <KPI label="Solicitações" value={num(solicitacoes.length)} foot="pedidos de franquia recebidos" />
        <KPI label="Em andamento" value={num(emAndamento.length)}
             foot={paradas > 0 ? `${plural(paradas, 'parado', 'parados')} há mais de 7 dias` : 'aguardando análise ou vistoria'} />
        <KPI label="Viáveis pela IA" value={num(aprovaveis)}
             foot={`com ao menos ${horas(REGRAS.limiarViabilidadeHoras)}/dia previstas e carga suficiente`} />
        <KPI label="Taxa de análise" value={brl(1500)}
             foot="abatida da taxa de franquia se aprovado" />
      </div>

      <Nota titulo="Por que a homologação existe" tom="info">
        A unidade só se paga acima de {horas(REGRAS.limiarViabilidadeHoras)}/dia por carregador. Aprovar um
        ponto fraco prejudica o franqueado e suja a marca da rede. Por isso a IA estima a utilização
        esperada <b>antes</b> de a GoodWe dizer sim — é a decisão de negócio mais direta do sistema.
      </Nota>

      <div className="grid g-1-2">
        <Card title="Fila de solicitações" sub="Selecione para ver o parecer">
          <div style={{ marginBottom: 12 }}>
            <Segmentado cheio rotulo="Ordenar a fila" valor={ordem} opcoes={ORDENS} aoMudar={setOrdem} />
          </div>
          {solicitacoes.length === 0 ? (
            <EmptyState icone="check" titulo="Nenhum pedido na fila">
              Os pedidos feitos em Seja GoodWe aparecem aqui para análise.
            </EmptyState>
          ) : (
            <div className="stack scroll-y" style={{ gap: 7, maxHeight: 640 }}>
              {solicitacoes.map((h) => (
                <button
                  key={h.id} type="button" className="fila-item"
                  aria-current={h.id === atual?.id} onClick={() => setSelecionada(h.id)}
                >
                  <div className="row between">
                    <span className="strong tiny">{h.comercio}</span>
                    <StatusBadge estado={h.status} />
                  </div>
                  <div className="tiny muted">
                    {obterRegiao(h.regiaoId).cidade} · {h.formatoDesejado} · score {num(h.scoreViabilidade)} · {relativo(h.criadoEm)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {atual && analise && regiao && previsao && (
          <div className="stack">
            <Card
              title={atual.comercio}
              sub={`${atual.cnpj} · ${regiao.cidade}/${regiao.uf} · aberto em ${dataCurta(atual.criadoEm)} (${relativo(atual.criadoEm)})`}
              action={<StatusBadge estado={atual.status} />}
            >
              <div className="grid g3">
                <div>
                  <div className="kpi-label">Score de viabilidade</div>
                  <div className="kpi-value sm">{num(analise.score)}<span className="tiny muted">/100</span></div>
                </div>
                <div>
                  <div className="kpi-label">Uso previsto</div>
                  <div className="kpi-value sm">{num(analise.horasUsoPrevistas, 1)}<span className="kpi-unit">h/dia</span></div>
                  <div className="tiny muted">meta de {horas(REGRAS.limiarViabilidadeHoras)}/dia por vaga</div>
                </div>
                <div>
                  <div className="kpi-label">Veredito da IA</div>
                  <div style={{ marginTop: 6 }}>
                    <Badge tom={veredito.tom}><Icone nome={veredito.ico} tamanho={12} />{veredito.rotulo}</Badge>
                  </div>
                </div>
              </div>

              <div className="sep" />
              <div className="stack" style={{ gap: 8 }}>
                {analise.fatores.map((f) => (
                  <div key={f.rotulo}>
                    <div className="row between tiny">
                      <span>{f.rotulo} <span className="muted">(peso {num(f.peso * 100)}%)</span></span>
                      <span className="num">{num(f.nota * 100)}/100</span>
                    </div>
                    <Bar valor={f.nota} tom={f.nota > 0.7 ? 'var(--pos)' : f.nota > 0.45 ? 'var(--warn)' : 'var(--neg)'} />
                  </div>
                ))}
              </div>

              <div className="sep" />
              <Nota
                titulo="Parecer técnico"
                tom={analise.veredito === 'REPROVAR' ? 'neg' : analise.veredito === 'APROVAR' ? 'pos' : 'warn'}
              >
                {analise.parecer}
              </Nota>
            </Card>

            <Card
              title="Previsão financeira"
              sub="Se o uso previsto acontecer, por mês, para o comércio"
              action={<span className="selo">estimado</span>}
            >
              <Tabela cabecalho={['Item', '#Valor']}>
                <tr><td>Uso previsto ({atual.formatoDesejado}, {plural(previsao.vagas, 'vaga', 'vagas')})</td><td className="r num">{horas(previsao.horasUsoDia)}/dia por vaga</td></tr>
                <tr><td>Energia entregue</td><td className="r num">{kwh(previsao.energiaMesKWh)}</td></tr>
                <tr><td className="strong">Receita bruta</td><td className="r num strong">{brl(previsao.receitaMes)}</td></tr>
                <tr><td className="muted">Custo da energia</td><td className="r num">− {brl(previsao.custoEnergiaMes)}</td></tr>
                <tr><td className="muted">Royalties e fundo de marketing</td><td className="r num">− {brl(previsao.royaltiesMes)}</td></tr>
                <tr><td className="muted">Taxa do Pix</td><td className="r num">− {brl(previsao.gatewayMes)}</td></tr>
                <tr><td className="muted">Mensalidade da plataforma</td><td className="r num">− {brl(previsao.plataformaMes)}</td></tr>
                <tr><td className="muted">Ganho no varejo da loja</td><td className="r num">+ {brl(previsao.margemVarejoMes)}</td></tr>
                <tr><td className="strong">Resultado do comércio</td><td className="r num strong">{brl(previsao.resultadoMes)}</td></tr>
                <tr>
                  <td>Payback do investimento ({brl(previsao.capex)})</td>
                  <td className="r num strong">{Number.isFinite(previsao.paybackMeses) ? `${num(previsao.paybackMeses)} meses` : '—'}</td>
                </tr>
              </Tabela>
              <div className="tiny muted" style={{ marginTop: 8 }}>
                Estimativa com a energia média por hora de recarga e o preço médio da rede hoje. Não é promessa de resultado.
              </div>
            </Card>

            <Card title="Dados declarados pelo comerciante">
              <Tabela cabecalho={['Item', '#Valor']}>
                <tr><td>Segmento</td><td className="r">{atual.segmento}</td></tr>
                <tr><td>Formato desejado</td><td className="r">{atual.formatoDesejado} ({plural(FORMATOS[atual.formatoDesejado].carregadores, 'vaga', 'vagas')})</td></tr>
                <tr><td>Fluxo diário de pessoas</td><td className="r num">{num(atual.fluxoDiarioPessoas)}</td></tr>
                <tr><td>Carga elétrica disponível</td><td className="r num">{kw(atual.cargaDisponivelKW)}</td></tr>
                <tr><td>Necessário para o formato</td><td className="r num">{kw(cargaNecessariaKW(atual.formatoDesejado))}</td></tr>
                <tr><td>Investimento estimado</td><td className="r num">{brl(FORMATOS[atual.formatoDesejado].capex)}</td></tr>
                <tr><td>Taxa de franquia</td><td className="r num">{brl(FORMATOS[atual.formatoDesejado].taxaFranquia)}</td></tr>
              </Tabela>
              <div className="row wrap" style={{ marginTop: 10 }}>
                <button className="btn primary" disabled={ocupado || decidida} onClick={decidir('APROVADO')}>
                  {ocupado ? 'Registrando…' : 'Aprovar e emitir COF'}
                </button>
                <button className="btn" disabled={ocupado || decidida} onClick={decidir('VISTORIA')}>Solicitar vistoria</button>
                <button className="btn" disabled={ocupado || decidida} onClick={decidir('REPROVADO')}>Reprovar</button>
              </div>
              {msg && <div className="tiny" style={{ marginTop: 6 }} role="status">{msg}</div>}
              {decidida && <div className="tiny muted" style={{ marginTop: 6 }}>Pedido já aprovado: o ponto foi criado e não pode ser desfeito por aqui.</div>}
              <div className="tiny muted" style={{ marginTop: 6 }}>
                A COF (Circular de Oferta de Franquia) deve ser entregue no mínimo 10 dias antes da
                assinatura — Lei 13.966/2019, Art. 2º, §1º.
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
