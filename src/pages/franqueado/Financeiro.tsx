import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  ComposedChart, Bar as RBar, Line, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from 'recharts';
import { useApp } from '../../app/estado';
import {
  cobrancasDoPonto, noMesAtual, kpisDoPonto, obterSessao, obterMotorista, economiaDoPonto,
  tarifaAtual, obterPonto, regiaoDoPonto, carregadoresDoPonto, pontoAtivo, resumoDoPonto,
} from '../../domain/db';
import { cent, curvaDoDia, decomporPreco, type FaixaTarifa } from '../../domain/engine/tarifa';
import { REGRAS, TARIFA } from '../../domain/catalogo';
import { brl, dataHora, delta, num, pct, plural, tarifaKWh } from '../../domain/formato';
import { fimDeSemana, horaLocal } from '../../domain/tempo';
import {
  Card, KPI, Tabela, EstadoBadge, Vazio, Nota, Badge, tipBRL,
  CHART, eixoProps, gradeProps,
} from '../../ui/kit';
import { LinhasDoPreco } from '../motorista/ComoCarregar';
import './financeiro.css';

/** parte do faturamento: fatias pequenas com uma casa (o Pix de 1,5% não aparece como 1% ou 2%) */
const pctParte = (f: number) => pct(f, f > 0 && f < 0.1 ? 1 : 0);

/** cor e nome de cada faixa de horário: o mesmo vocabulário no gráfico, na legenda e na dica */
const FAIXA: Record<FaixaTarifa, { nome: string; cor: string }> = {
  VALE: { nome: 'Vale', cor: CHART.serie2 },
  NORMAL: { nome: 'Normal', cor: CHART.neutro },
  PICO: { nome: 'Pico', cor: CHART.serie1 },
};

interface Barra {
  hora: number; rotulo: string; preco: number; piso: number; teto: number; faixa: FaixaTarifa; agora: boolean;
}

function DicaTarifa({ active, payload }: { active?: boolean; payload?: { payload: Barra }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="chart-tip">
      <div className="tip-label">{d.rotulo} · {FAIXA[d.faixa].nome}{d.agora ? ' · agora' : ''}</div>
      <div className="tip-row"><span className="tip-key" style={{ background: FAIXA[d.faixa].cor }} /><span>Preço</span><span className="tip-val">{tarifaKWh(d.preco)}</span></div>
      <div className="tip-row"><span className="tip-key" style={{ background: CHART.serie3 }} /><span>Piso</span><span className="tip-val">{tarifaKWh(d.piso)}</span></div>
      <div className="tip-row"><span className="tip-key" style={{ background: CHART.serie4 }} /><span>Teto</span><span className="tip-val">{tarifaKWh(d.teto)}</span></div>
    </div>
  );
}

export default function Financeiro() {
  const { pontoId } = useApp();
  const ponto = obterPonto(pontoId);
  if (!ponto) return <Nota titulo="Nenhum ponto">O financeiro aparece aqui quando a GoodWe aprovar a solicitação e o ponto existir.</Nota>;

  const kpis = kpisDoPonto(pontoId);
  const eco = economiaDoPonto(pontoId);
  const operando = pontoAtivo(ponto);

  const cobrancas = cobrancasDoPonto(pontoId).sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));
  const doMes = cobrancas.filter((c) => noMesAtual(c.criadaEm) && c.status === 'PAGO');

  const totais = doMes.reduce(
    (acc, c) => ({
      bruto: acc.bruto + c.valor,
      energia: acc.energia + c.custoEnergia,
      royalty: acc.royalty + c.royaltyGoodWe,
      fundo: acc.fundo + c.fundoMarketing,
      gateway: acc.gateway + c.gateway,
      liquido: acc.liquido + c.liquidoLojista,
    }),
    { bruto: 0, energia: 0, royalty: 0, fundo: 0, gateway: 0, liquido: 0 },
  );

  // a mensalidade da plataforma sai do líquido da recarga (mesma conta do KPI): a pizza soma o faturamento
  // proporcional aos dias do mês em que o ponto operou: o mesmo valor que o KPI Líquido desconta
  const plataforma = operando ? cent(resumoDoPonto(pontoId, 'mes').plataforma) : 0;
  const faltaPlataforma = Math.max(0, cent(plataforma - totais.liquido));
  const pizza = [
    { nome: 'Fica com o comércio', valor: Math.max(0, cent(totais.liquido - plataforma)), cor: CHART.serie2 },
    { nome: 'Custo de energia', valor: cent(totais.energia), cor: CHART.neutro },
    { nome: 'Royalties GoodWe', valor: cent(totais.royalty), cor: CHART.serie1 },
    { nome: 'Fundo de marketing', valor: cent(totais.fundo), cor: CHART.serie3 },
    { nome: 'Gateway de pagamento', valor: cent(totais.gateway), cor: CHART.serie4 },
    { nome: 'Mensalidade da plataforma', valor: Math.min(plataforma, Math.max(0, cent(totais.liquido))), cor: CHART.dim },
  ].filter((p) => p.valor > 0);

  const falhas = cobrancas.filter((c) => c.status === 'FALHOU').length;

  // ---- tarifa dinâmica (preço de agora e o dia inteiro, pelo mesmo motor do app e do totem)
  const regiao = regiaoDoPonto(ponto);
  const tarifa = tarifaAtual(pontoId);
  const vagas = carregadoresDoPonto(pontoId);
  const operantes = vagas.filter((v) => v.estado !== 'OFFLINE' && v.estado !== 'MANUTENCAO').length || vagas.length || 1;
  const agora = new Date();
  const horaAgora = horaLocal(agora);
  const hojeFds = fimDeSemana(agora);
  // ocupação neutra: um carro no ponto, para o gráfico mostrar a tabela de horários e não o movimento de agora
  const dia = curvaDoDia(ponto, regiao, 1 / operantes, { fimDeSemana: hojeFds, vagasOperantes: operantes, previa: !operando });
  const barras: Barra[] = dia.map((c, h) => ({
    hora: h, rotulo: `${h}h`, preco: c.precoFinalKWh, piso: c.pisoKWh ?? 0, teto: c.tetoKWh ?? 0, faixa: c.faixa ?? 'NORMAL', agora: h === horaAgora,
  }));
  const topo = Math.ceil(Math.max(...barras.map((b) => b.teto)) * 10) / 10;

  const dec = decomporPreco(tarifa.precoFinalKWh, tarifa.custoEnergiaKWh);
  const partes = [
    { nome: 'Energia da distribuidora', valor: dec.energia, cor: CHART.neutro },
    { nome: `GoodWe: royalty + fundo (${pct(REGRAS.royaltyPct + REGRAS.fundoPct)})`, valor: dec.goodwe, cor: CHART.serie1 },
    { nome: `Gateway (${pct(REGRAS.gatewayPct, 1)})`, valor: dec.gateway, cor: CHART.serie4 },
    { nome: 'Fica com o comércio', valor: dec.comercio, cor: CHART.serie2 },
  ];
  const sobe = tarifa.proxima && tarifa.proxima.precoKWh > tarifa.precoFinalKWh;

  return (
    <div className="stack">
      <div className="grid g4">
        <KPI label="Faturamento bruto (mês)" value={brl(totais.bruto)} accent="red"
             foot={`${doMes.length} ${doMes.length === 1 ? 'cobrança paga' : 'cobranças pagas'}`} />
        <KPI label="Custo de energia" value={brl(totais.energia)}
             foot="pago à distribuidora pelo comércio" />
        <KPI label="Royalties + fundo" value={brl(totais.royalty + totais.fundo)}
             foot={`${pct(REGRAS.royaltyPct + REGRAS.fundoPct)} sobre a recarga`} />
        <KPI label="Líquido do comércio" value={brl(kpis.liquidoMes)} accent="green"
             foot={operando
               ? `já descontada a plataforma (${brl(REGRAS.plataformaMes)}/mês)`
               : `a plataforma (${brl(REGRAS.plataformaMes)}/mês) só é cobrada depois da ativação`} />
      </div>

      {!operando && (
        <Nota titulo={(ponto.status ?? 'INSTALACAO') === 'SUSPENSO' ? 'Ponto suspenso' : 'Ponto em instalação'} tom="amber">
          O preço abaixo é uma prévia: ele só vale, e as cobranças só começam, quando o ponto estiver ativo.
        </Nota>
      )}

      <Card title="Tarifa dinâmica" sub="Preço por faixa de horário, com piso e teto"
            action={!operando ? <Badge tom="amber">Prévia</Badge> : undefined}>
        <div className="grid g-1-2">
          <div className="stack" style={{ gap: 12 }}>
            <div>
              <div className="kpi-label">{operando ? 'Preço agora' : 'Prévia do preço'}</div>
              <div className="kpi-value kpi-accent-red">{tarifaKWh(tarifa.precoFinalKWh)}</div>
              {tarifa.proxima && (
                <div className="tiny muted">
                  Às {tarifa.proxima.hora}h {sobe ? 'sobe' : 'cai'} para {tarifaKWh(tarifa.proxima.precoKWh)}
                </div>
              )}
            </div>
            <LinhasDoPreco linhas={tarifa.explicacao} />
            <div>
              <div className="row between">
                <div className="kpi-label">Margem líquida por kWh</div>
                <div className="strong kpi-accent-green">{brl(dec.comercio)} <span className="tiny muted">({pct(tarifa.precoFinalKWh ? dec.comercio / tarifa.precoFinalKWh : 0)})</span></div>
              </div>
              <div className="fin-barra" role="img"
                   aria-label={partes.map((p) => `${p.nome} ${brl(p.valor)}`).join(', ')}>
                {partes.map((p) => (
                  <span key={p.nome} title={`${p.nome}: ${brl(p.valor)}`}
                        style={{ flexGrow: Math.max(0.0001, p.valor), background: p.cor }} />
                ))}
              </div>
              <ul className="fin-partes">
                {partes.map((p) => (
                  <li key={p.nome}>
                    <span className="fin-cor" style={{ background: p.cor }} />
                    <span>{p.nome}</span>
                    <span className="val">{brl(p.valor)}</span>
                  </li>
                ))}
              </ul>
              <div className="tiny muted" style={{ marginTop: 6 }}>
                Por kWh vendido a {tarifaKWh(tarifa.precoFinalKWh)}.
              </div>
            </div>
          </div>

          <div>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={barras} margin={{ top: 18, right: 6, bottom: 0, left: 0 }}>
                <CartesianGrid {...gradeProps} />
                <XAxis dataKey="rotulo" {...eixoProps} minTickGap={8} />
                <YAxis {...eixoProps} width={58} domain={[0, topo]} tickFormatter={(v) => brl(Number(v))} />
                <Tooltip content={<DicaTarifa />} cursor={{ fill: CHART.neutroFill }} />
                <RBar dataKey="preco" name="Preço" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {barras.map((b) => (
                    <Cell key={b.hora} fill={FAIXA[b.faixa].cor}
                          stroke={b.agora ? CHART.texto : 'none'} strokeWidth={b.agora ? 1.5 : 0} />
                  ))}
                </RBar>
                <Line dataKey="teto" name="Teto" type="stepAfter" stroke={CHART.serie4} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                <Line dataKey="piso" name="Piso" type="stepAfter" stroke={CHART.serie3} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                <ReferenceLine x={`${horaAgora}h`} stroke={CHART.texto} strokeDasharray="2 3"
                               label={{ value: 'agora', position: 'top', fill: CHART.texto, fontSize: 10 }} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="fin-legenda">
              <span><i className="fin-cor" style={{ background: FAIXA.VALE.cor }} />Vale ({delta(TARIFA.multVale - 1)})</span>
              <span><i className="fin-cor" style={{ background: FAIXA.NORMAL.cor }} />Normal</span>
              <span><i className="fin-cor" style={{ background: FAIXA.PICO.cor }} />Pico ({delta(TARIFA.multPico - 1)})</span>
              <span><i className="fin-lin" style={{ borderColor: CHART.serie3 }} />Piso</span>
              <span><i className="fin-lin" style={{ borderColor: CHART.serie4 }} />Teto</span>
              <span><i className="fin-cor fin-agora" />Agora</span>
            </div>
            <div className="tiny muted" style={{ marginTop: 6 }}>
              {hojeFds
                ? 'Hoje é fim de semana: não há pico. '
                : `Dia útil: vale das ${TARIFA.valeIni}h às ${TARIFA.valeFim}h, pico das ${TARIFA.picoIni}h às ${TARIFA.picoFim}h; no fim de semana não há pico. `}
              As horas de transição (8h, 16h, 20h e 22h) suavizam o degrau. O gráfico usa um carro no ponto; com as últimas vagas ocupadas o preço sobe até {delta(TARIFA.escassezMax)}.
              O piso garante energia, taxas e {brl(TARIFA.margemMinKWh)} de margem por kWh.
            </div>
          </div>
        </div>
      </Card>

      <div className="grid g-1-2">
        <Card title="Para onde vai o faturamento" sub="Repartição do mês">
          {pizza.length === 0 ? (
            <Vazio>Ainda sem cobranças pagas no período</Vazio>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={pizza} dataKey="valor" nameKey="nome" innerRadius={50} outerRadius={80} paddingAngle={2} stroke="none" isAnimationActive={false}>
                    {pizza.map((p) => <Cell key={p.nome} fill={p.cor} />)}
                  </Pie>
                  <Tooltip formatter={tipBRL} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="fin-partes">
                {pizza.map((p) => (
                  <li key={p.nome}>
                    <span className="fin-cor" style={{ background: p.cor }} />
                    <span>{p.nome}</span>
                    <span className="val">{brl(p.valor)} <span className="muted">· {pctParte(totais.bruto ? p.valor / totais.bruto : 0)}</span></span>
                  </li>
                ))}
              </ul>
              {faltaPlataforma > 0 && (
                <Nota titulo="Mensalidade ainda não coberta" tom="amber">
                  A recarga do mês ainda não cobre a parte da mensalidade da plataforma até hoje ({brl(plataforma)} de {brl(REGRAS.plataformaMes)}): faltam {brl(faltaPlataforma)}.
                </Nota>
              )}
            </div>
          )}
        </Card>

        <Card title="Resultado da unidade" sub="Recarga + o movimento que ela traz para a loja">
          <Tabela cabecalho={['Linha', '#Valor no mês']}>
            <tr><td>Líquido da recarga</td><td className="r num">{brl(eco.liquidoRecarga)}</td></tr>
            <tr>
              <td>
                Margem do varejo incremental
                <div className="tiny muted">
                  {plural(kpis.sessoesMes, 'recarga', 'recargas')} × {pct(REGRAS.conversaoLoja)} que compram na loja ×{' '}
                  {brl(REGRAS.ticketVarejoIncremental)} × {pct(REGRAS.margemVarejo)} de margem
                </div>
              </td>
              <td className="r num kpi-accent-green">{brl(eco.margemVarejo)}</td>
            </tr>
            <tr>
              <td className="strong">Resultado do mês</td>
              <td className="r strong num" style={{ fontSize: 15 }}>{brl(eco.resultadoMes)}</td>
            </tr>
            <tr>
              <td>Payback do investimento ({brl(eco.capex)})</td>
              <td className="r num strong">
                {eco.paybackMeses === Infinity ? '—' : `${num(eco.paybackMeses, 0)} meses`}
              </td>
            </tr>
          </Tabela>
          <Nota titulo="Royalty não toca as vendas da loja" tom="teal">
            Royalties e fundo incidem apenas sobre a recarga. Tudo que o cliente gasta dentro do
            comércio é 100% do franqueado.
          </Nota>
        </Card>
      </div>

      <Card title="Cobranças" sub={falhas > 0 ? `${falhas} cobranças falharam no período` : 'Cobranças dos últimos dois meses e as que ainda estão a pagar'}>
        {cobrancas.length === 0 ? (
          <Vazio>{operando ? 'Nenhuma cobrança registrada.' : 'Sem cobranças: as recargas começam quando o ponto estiver ativo.'}</Vazio>
        ) : (
          <div className="scroll-y">
            <Tabela cabecalho={['Data', 'Motorista', 'txid', '#Bruto', '#Energia', `#GoodWe (${pct(REGRAS.royaltyPct + REGRAS.fundoPct)})`, '#Pix', '#Líquido', 'Status']}>
              {cobrancas.slice(0, 120).map((c) => {
                const s = obterSessao(c.sessaoId);
                const m = s ? obterMotorista(s.motoristaId) : undefined;
                return (
                  <tr key={c.id}>
                    <td className="tiny">{dataHora(c.criadaEm)}</td>
                    <td className="tiny">{m?.nome ?? '—'}</td>
                    <td className="tiny muted">{c.txid}</td>
                    <td className="r num">{brl(c.valor)}</td>
                    <td className="r num muted">{brl(c.custoEnergia)}</td>
                    <td className="r num muted">{brl(cent(c.royaltyGoodWe + c.fundoMarketing))}</td>
                    <td className="r num muted">{brl(c.gateway)}</td>
                    <td className="r num strong">{brl(c.liquidoLojista)}</td>
                    <td><EstadoBadge estado={c.status} /></td>
                  </tr>
                );
              })}
            </Tabela>
          </div>
        )}
      </Card>
    </div>
  );
}
