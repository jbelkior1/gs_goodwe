import { useMemo, useState, type ReactNode, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  ComposedChart, Bar as RBar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Icone, type NomeIcone } from './icones';
import {
  brl, num, pct, kwh, kw, delta as fDelta, horaMin, dataHora as fDataHora, dataAno,
} from '../domain/formato';
import type { DiaSerie, ItemAtencao } from '../domain/db';

/** Componentes compartilhados por todas as telas do Ponto W. */

// ------------------------------------------------------------------ paleta
/**
 * Paleta de dado do padrão GoodWe/ChargeGrid.
 *
 * Todo gráfico do produto puxa daqui — nenhuma tela declara hexadecimal solto. A série
 * principal dos painéis (`dado`) é o azul informativo; o vermelho da marca não é cor de dado
 * nem de estado (ADR-0014). `serie1` segue como o "vermelho GoodWe" das telas que o usam
 * (royalties), claro o bastante para ler a legenda (5,7:1 sobre o painel; o #e60012 antigo dava 3,9:1).
 */
export const CHART = {
  bg: '#0a0a0b',
  painel: '#121215',
  texto: '#f4f2ee',
  dim: 'rgba(244,242,238,.54)',
  dim2: 'rgba(244,242,238,.34)',
  /** rótulo de eixo e legenda: 6:1 sobre o painel */
  rotulo: 'rgba(244,242,238,.64)',
  grade: 'rgba(244,242,238,.06)',
  eixo: 'rgba(244,242,238,.20)',
  serie1: '#ff4d57',
  serie1Claro: '#ff8f96',
  serie2: '#3ddc97',
  serie3: '#ffb020',
  serie4: '#f4f2ee',
  neutro: 'rgba(244,242,238,.28)',
  neutroFill: 'rgba(244,242,238,.10)',
  /** série principal dos painéis (barras do dia) */
  dado: '#5ab0ff',
  /** média móvel */
  media: '#f4f2ee',
  /** linha de meta ou de limite */
  meta: '#ffb020',
  pos: '#3ddc97',
  neg: '#ff7a70',
  warn: '#ffb020',
  info: '#5ab0ff',
} as const;

/** Props comuns de eixo/grade — mantém todos os gráficos idênticos. */
export const eixoProps = {
  tick: { fontSize: 11, fill: CHART.rotulo },
  stroke: CHART.eixo,
  tickLine: false,
  axisLine: { stroke: CHART.grade },
} as const;

export const gradeProps = { stroke: CHART.grade, vertical: false } as const;

// ------------------------------------------------------------------ formato
// Tudo vem de src/domain/formato.ts (pt-BR, relógio de Brasília). Os nomes abaixo seguem
// exportados porque o resto do app os importa do kit.
export { brl, num, pct };
export const hora = (iso: string): string => horaMin(iso);
export const dataHora = (iso: string): string => fDataHora(iso);
export const dataCurta = (iso: string): string => dataAno(iso);

export function duracao(inicio: string, fim?: string): string {
  const ms = (fim ? new Date(fim).getTime() : Date.now()) - new Date(inicio).getTime();
  const min = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}h${String(min % 60).padStart(2, '0')}` : `${min} min`;
}

// formatadores de eixo do Recharts: o número nunca aparece cru
export const eixoBRL = (v: number): string =>
  Math.abs(v) >= 1000 ? `R$ ${num(v / 1000, Number.isInteger(v / 1000) ? 0 : 1)} mil` : `R$ ${num(v)}`;
export const eixoKWh = (v: number): string => kwh(v);
export const eixoKW = (v: number): string => `${num(v)} kW`;
export const eixoNum = (v: number): string => num(v);
export const eixoHoraDoDia = (h: number): string => `${h}h`;

// ------------------------------------------------------------------ card
export function Card({
  title, sub, action, children, className = '', style,
}: {
  title?: ReactNode; sub?: ReactNode; action?: ReactNode;
  children: ReactNode; className?: string; style?: CSSProperties;
}) {
  return (
    <div className={`card ${className}`} style={style}>
      {(title || action) && (
        <div className="card-head">
          <div>
            {title && <div className="card-title">{title}</div>}
            {sub && <div className="card-sub">{sub}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ kpi
export interface DeltaKPI {
  /** variação em fração (0,05 = +5%); null quando não há base para comparar */
  valor: number | null;
  /** a base escrita: "vs 1–20 set" */
  base?: string;
  /** métrica em que cair é bom (custo, tempo de espera) */
  inverso?: boolean;
}

/** Variação com a base escrita. A cor só vem aqui: positivo, negativo ou neutro. */
export function Delta({ valor, base, inverso }: DeltaKPI) {
  if (valor === null) {
    return <span className="delta flat tom-neu"><Icone nome="traco" tamanho={12} />sem base de comparação</span>;
  }
  const dir = valor > 0.005 ? 'up' : valor < -0.005 ? 'down' : 'flat';
  const bom = dir === 'flat' ? null : (dir === 'up') !== Boolean(inverso);
  const tom = bom === null ? 'tom-neu' : bom ? 'tom-pos' : 'tom-neg';
  const seta: NomeIcone = dir === 'up' ? 'setaCima' : dir === 'down' ? 'setaBaixo' : 'traco';
  return (
    <>
      <span className={`delta ${dir} ${tom}`}><Icone nome={seta} tamanho={12} />{fDelta(valor)}</span>
      {base && <span>{base}</span>}
    </>
  );
}

export interface MetaKPI {
  /** "meta 2,3 h/dia" */
  rotulo: string;
  atingida: boolean;
  /** 0–1: quanto da meta já foi alcançado (opcional, desenha a barra) */
  progresso?: number;
}

export function KPI({
  label, value, unit, foot, accent: _accent, sm, trend, delta, meta, estimado,
}: {
  label: string; value: ReactNode; foot?: ReactNode;
  /** legado: o valor do KPI fica sempre na cor do texto (cor só no delta e nos selos) */
  accent?: 'red' | 'teal' | 'green'; sm?: boolean;
  unit?: string;
  /** legado: variação sem base escrita; prefira `delta` */
  trend?: number;
  delta?: DeltaKPI;
  meta?: MetaKPI;
  /** número que é projeção ou previsão, não resultado já realizado */
  estimado?: boolean;
}) {
  return (
    <div className="card kpi-card">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="kpi-label">{label}</div>
        {estimado && <span className="selo" title="Projeção a partir do ritmo atual, não é resultado já realizado">estimado</span>}
        {trend !== undefined && <Trend valor={trend} />}
      </div>
      <div className={`kpi-value ${sm ? 'sm' : ''}`}>
        {value}{unit && <span className="kpi-unit">{unit}</span>}
      </div>
      {delta && <div className="kpi-delta"><Delta {...delta} /></div>}
      {meta && (
        <div className="kpi-meta">
          <div className="meta-linha">
            <span className={`tom-texto ${meta.atingida ? 'tom-pos' : 'tom-warn'}`}>
              <Icone nome={meta.atingida ? 'check' : 'alerta'} tamanho={12} />
              {meta.atingida ? 'dentro da meta' : 'abaixo da meta'}
            </span>
            <span>· {meta.rotulo}</span>
          </div>
          {meta.progresso !== undefined && <Bar valor={meta.progresso} />}
        </div>
      )}
      {foot && <div className="kpi-foot">{foot}</div>}
    </div>
  );
}

/** Seta de variação vs. período anterior (legado: sem a base escrita). */
export function Trend({ valor }: { valor: number }) {
  const dir = valor > 0.005 ? 'up' : valor < -0.005 ? 'down' : 'flat';
  const seta = dir === 'up' ? 'setaCima' : dir === 'down' ? 'setaBaixo' : 'traco';
  return (
    <span className={`trend ${dir}`}>
      <Icone nome={seta} tamanho={12} />
      {fDelta(valor)}
    </span>
  );
}

// ------------------------------------------------------------------ badge
/** os cinco tons de estado; os nomes antigos (green, red, teal, amber, gray) seguem valendo */
type Tom = 'pos' | 'neg' | 'warn' | 'info' | 'neu' | 'green' | 'red' | 'teal' | 'amber' | 'gray';

export function Badge({
  children, tom = 'gray', dot, pulse,
}: {
  children: ReactNode; tom?: Tom; dot?: boolean; pulse?: boolean;
}) {
  return (
    <span className={`badge ${tom}`}>
      {dot && <span className={`dot ${pulse ? 'pulse' : ''}`} />}
      {children}
    </span>
  );
}

type TomEstado = 'pos' | 'info' | 'warn' | 'neg' | 'neu';

/**
 * Estado → tom e palavra. Positivo: operando, disponível, pago. Informativo: ocupado, carregando,
 * aguardando QR. Atenção: instalação, pendente, vistoria, pausado. Negativo: offline, falhou,
 * reprovado, suspenso. Neutro: manutenção, concluído. Sempre com ícone e palavra, nunca só cor.
 */
const ESTADOS: Record<string, { tom: TomEstado; rotulo: string; vivo?: boolean }> = {
  DISPONIVEL: { tom: 'pos', rotulo: 'Disponível' },
  OPERANDO: { tom: 'pos', rotulo: 'Operando' },
  ATIVO: { tom: 'pos', rotulo: 'Operando' },
  PAGO: { tom: 'pos', rotulo: 'Pago' },
  FATURADO: { tom: 'pos', rotulo: 'Pago' },
  APROVADO: { tom: 'pos', rotulo: 'Aprovado' },
  OCUPADO: { tom: 'info', rotulo: 'Ocupado', vivo: true },
  CARREGANDO: { tom: 'info', rotulo: 'Carregando', vivo: true },
  ABERTA: { tom: 'info', rotulo: 'Aguardando QR', vivo: true },
  AUTENTICADO: { tom: 'info', rotulo: 'Liberando', vivo: true },
  ENCERRANDO: { tom: 'info', rotulo: 'Encerrando', vivo: true },
  ANALISE: { tom: 'info', rotulo: 'Em análise' },
  INSTALACAO: { tom: 'warn', rotulo: 'Em instalação' },
  PENDENTE: { tom: 'warn', rotulo: 'Pendente' },
  A_PAGAR: { tom: 'warn', rotulo: 'A pagar' },
  PENDENTE_DOC: { tom: 'warn', rotulo: 'Falta documento' },
  VISTORIA: { tom: 'warn', rotulo: 'Vistoria' },
  PAUSADO: { tom: 'warn', rotulo: 'Pausado' },
  OFFLINE: { tom: 'neg', rotulo: 'Offline' },
  SEM_SINAL: { tom: 'neg', rotulo: 'Sem sinal' },
  FALHOU: { tom: 'neg', rotulo: 'Falhou' },
  REPROVADO: { tom: 'neg', rotulo: 'Reprovado' },
  SUSPENSO: { tom: 'neg', rotulo: 'Suspenso' },
  MANUTENCAO: { tom: 'neu', rotulo: 'Manutenção' },
  CONCLUIDO: { tom: 'neu', rotulo: 'Concluído' },
  EXPIRADA: { tom: 'neu', rotulo: 'Expirada' },
};

const ICONE_DO_TOM: Record<TomEstado, NomeIcone> = {
  pos: 'check', info: 'pulso', warn: 'relogio', neg: 'alerta', neu: 'traco',
};

export function StatusBadge({ estado, rotulo }: { estado: string; rotulo?: string }) {
  const cfg = ESTADOS[estado] ?? { tom: 'neu' as TomEstado, rotulo: estado };
  return (
    <span className={`badge ${cfg.tom}`}>
      {cfg.vivo ? <span className="dot pulse" /> : <Icone nome={ICONE_DO_TOM[cfg.tom]} tamanho={12} />}
      {rotulo ?? cfg.rotulo}
    </span>
  );
}

/** Traduz o estado do carregador/sessão em cor e rótulo (nome antigo de StatusBadge). */
export function EstadoBadge({ estado }: { estado: string }) {
  return <StatusBadge estado={estado} />;
}

/** Severidade de um item de atenção: palavra e ícone, não só cor. */
export function SeveridadeBadge({ severidade }: { severidade: ItemAtencao['severidade'] }) {
  const cfg = severidade === 'critico'
    ? { tom: 'neg', rotulo: 'Crítico', ico: 'alerta' as NomeIcone }
    : severidade === 'atencao'
      ? { tom: 'warn', rotulo: 'Atenção', ico: 'relogio' as NomeIcone }
      : { tom: 'info', rotulo: 'Dica', ico: 'pulso' as NomeIcone };
  return <span className={`badge ${cfg.tom}`}><Icone nome={cfg.ico} tamanho={12} />{cfg.rotulo}</span>;
}

// ------------------------------------------------------------------ barras
export function Bar({ valor, tom, thick }: { valor: number; tom?: string; thick?: boolean }) {
  return (
    <div className={`bar ${thick ? 'thick' : ''}`}>
      <span style={{ width: `${Math.min(100, Math.max(0, valor * 100))}%`, background: tom }} />
    </div>
  );
}

/**
 * Barra da entrada elétrica do ponto: quanto é carga do comércio, quanto é recarga, e onde está
 * a margem de segurança (92%). O fim da barra é o limite do disjuntor. As faixas de fundo seguem
 * o uso da entrada: até 85% normal, de 85 a 92% atenção, acima de 92% crítico.
 */
export function LoadBar({
  comercioKW, recargaKW, limiteKW,
}: { comercioKW: number; recargaKW: number; limiteKW: number }) {
  const pc = Math.min(100, (comercioKW / limiteKW) * 100);
  const pr = Math.min(100 - pc, (recargaKW / limiteKW) * 100);
  return (
    <div>
      <div className="load-bar">
        <div className="load-seg comercio" style={{ width: `${pc}%` }} />
        <div className="load-seg recarga" style={{ left: `${pc}%`, width: `${pr}%` }} />
        <div className="load-limit" style={{ left: '92%' }} title="Margem de segurança (92% do limite)" />
        <div className="load-fim" title="Limite da entrada (disjuntor)" />
      </div>
      <div className="legenda">
        <span className="chave">
          <span className="amostra" style={{ background: 'rgba(244,242,238,.30)' }} />
          Comércio {kw(comercioKW)}
        </span>
        <span className="chave">
          <span className="amostra" style={{ background: 'var(--info)' }} />
          Recarga {kw(recargaKW)}
        </span>
        <span className="chave">
          <span className="traco tracejado" style={{ color: 'var(--warn)' }} />
          margem de segurança (92%) · {kw(limiteKW * 0.92)}
        </span>
        <span className="chave">
          <span className="traco" style={{ color: 'var(--neg)', borderTopWidth: 3 }} />
          limite da entrada · {kw(limiteKW)}
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ anel SoC
export function AnelSoC({ soc, tamanho = 120 }: { soc: number; tamanho?: number }) {
  const raio = tamanho / 2 - 9;
  const circ = 2 * Math.PI * raio;
  const preenchido = (Math.min(100, Math.max(0, soc)) / 100) * circ;
  // cheio é positivo; no meio do caminho é informativo (recarga em andamento); baixo pede atenção
  const cor = soc >= 80 ? CHART.pos : soc >= 40 ? CHART.info : CHART.warn;
  return (
    <div style={{ position: 'relative', width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} className="gauge-ring">
        <circle cx={tamanho / 2} cy={tamanho / 2} r={raio} fill="none"
                stroke="rgba(244,242,238,.08)" strokeWidth={7} />
        <circle
          cx={tamanho / 2} cy={tamanho / 2} r={raio} fill="none" stroke={cor} strokeWidth={7}
          strokeLinecap="round" strokeDasharray={`${preenchido} ${circ}`}
        />
        <circle cx={tamanho / 2} cy={tamanho / 2} r={raio - 11} fill="none"
                stroke="rgba(244,242,238,.10)" strokeWidth={1} strokeDasharray="2 5" />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
        fontWeight: 500, fontSize: tamanho * 0.24, letterSpacing: '-.035em',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {num(Math.round(soc))}%
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tabela
export function Tabela({ cabecalho, children }: { cabecalho: ReactNode[]; children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>{cabecalho.map((c, i) => <th key={i} className={typeof c === 'string' && c.startsWith('#') ? 'r' : ''}>{typeof c === 'string' ? c.replace(/^#/, '') : c}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export interface ColunaOrdenavel<T> {
  id: string;
  rotulo: ReactNode;
  direita?: boolean;
  /** valor usado para ordenar; sem ele a coluna não ordena */
  valor?: (linha: T) => number | string | null;
  celula: (linha: T) => ReactNode;
}

/** Tabela cujas colunas ordenam ao clicar no cabeçalho (primeiro clique: maior primeiro nos números, A–Z no texto). */
export function TabelaOrdenavel<T>({
  colunas, linhas, chave, ordemInicial, vazio,
}: {
  colunas: ColunaOrdenavel<T>[];
  linhas: T[];
  chave: (linha: T) => string;
  ordemInicial?: { id: string; dir: 'asc' | 'desc' };
  vazio?: ReactNode;
}) {
  const [ordem, setOrdem] = useState(ordemInicial);
  const coluna = colunas.find((c) => c.id === ordem?.id);
  const ordenadas = useMemo(() => {
    const valor = coluna?.valor;
    if (!valor || !ordem) return linhas;
    const sinal = ordem.dir === 'asc' ? 1 : -1;
    return [...linhas].sort((a, b) => {
      const x = valor(a);
      const y = valor(b);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === 'string' || typeof y === 'string') return sinal * String(x).localeCompare(String(y), 'pt-BR');
      return sinal * (x - y);
    });
  }, [linhas, coluna, ordem]);

  const clicar = (c: ColunaOrdenavel<T>) => {
    if (!c.valor) return;
    if (ordem?.id === c.id) { setOrdem({ id: c.id, dir: ordem.dir === 'asc' ? 'desc' : 'asc' }); return; }
    const texto = linhas.length > 0 && typeof c.valor(linhas[0]) === 'string';
    setOrdem({ id: c.id, dir: texto ? 'asc' : 'desc' });
  };

  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            {colunas.map((c) => {
              const ativa = ordem?.id === c.id;
              return (
                <th
                  key={c.id} className={c.direita ? 'r' : ''}
                  aria-sort={ativa ? (ordem!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.valor ? (
                    <button type="button" onClick={() => clicar(c)}>
                      {c.rotulo}
                      {ativa && <Icone nome={ordem!.dir === 'asc' ? 'setaCima' : 'setaBaixo'} tamanho={11} />}
                    </button>
                  ) : c.rotulo}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((l) => (
            <tr key={chave(l)}>
              {colunas.map((c) => <td key={c.id} className={c.direita ? 'r' : ''}>{c.celula(l)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {ordenadas.length === 0 && vazio}
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** Estado vazio com explicação e, se couber, o atalho para resolver. */
export function EmptyState({
  icone = 'pulso', titulo, children, acao,
}: { icone?: NomeIcone; titulo: ReactNode; children?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="estado-vazio">
      <span className="ico"><Icone nome={icone} tamanho={18} /></span>
      <div className="titulo">{titulo}</div>
      {children && <div className="texto">{children}</div>}
      {acao}
    </div>
  );
}

/** O texto da vaga, com o código do QR em destaque quando há um. */
export function TextoSituacao({ texto, codigo }: { texto: string; codigo?: string }) {
  const i = codigo ? texto.indexOf(codigo) : -1;
  if (!codigo || i < 0) return <>{texto}</>;
  return <>{texto.slice(0, i)}<span className="codigo-qr">{codigo}</span>{texto.slice(i + codigo.length)}</>;
}

// ------------------------------------------------------------------ nota
export function Nota({
  titulo, tom = 'red', children,
}: { titulo?: ReactNode; tom?: 'red' | 'teal' | 'amber' | 'gray' | 'neg' | 'info' | 'warn' | 'pos' | 'neu'; children: ReactNode }) {
  return (
    <div className={`note ${tom === 'red' ? '' : tom}`}>
      {titulo && <div className="note-titulo">{titulo}</div>}
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ controle segmentado
/** Alternância curta (período, métrica, ordenação). Cada opção é um botão com estado pressionado. */
export function Segmentado<T extends string>({
  valor, opcoes, aoMudar, rotulo, cheio,
}: {
  valor: T; opcoes: { id: T; rotulo: string }[]; aoMudar: (v: T) => void; rotulo: string;
  /** ocupa a largura toda do pai, com as opções repartidas por igual */
  cheio?: boolean;
}) {
  return (
    <div className={`seg${cheio ? ' cheio' : ''}`} role="group" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.id} type="button" aria-pressed={o.id === valor} onClick={() => aoMudar(o.id)}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ moldura de gráfico
/** Card de gráfico: título, subtítulo, "dados até", alternância e estado vazio padronizados. */
export function ChartFrame({
  titulo, sub, dadosAte, acao, vazio, legenda, children,
}: {
  titulo: ReactNode; sub?: ReactNode;
  /** ISO do último dado que entrou na conta */
  dadosAte?: string | null;
  acao?: ReactNode;
  /** quando informado, no lugar do gráfico aparece o estado vazio */
  vazio?: { titulo: string; texto?: ReactNode; acao?: ReactNode } | null;
  legenda?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card
      title={titulo} sub={sub}
      action={(dadosAte || acao) ? (
        <div className="acoes">
          {dadosAte && <span className="dados-ate"><Icone nome="relogio" tamanho={12} />dados até {fDataHora(dadosAte)}</span>}
          {acao}
        </div>
      ) : undefined}
    >
      {vazio ? (
        <EmptyState icone="painel" titulo={vazio.titulo} acao={vazio.acao}>{vazio.texto}</EmptyState>
      ) : (
        <>
          {children}
          {legenda && <div className="legenda">{legenda}</div>}
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------- lista "Precisa da sua atenção"
/** Itens por gravidade, cada um com o atalho para resolver; sem itens, a confirmação de que está tudo certo. */
export function ListaAtencao({
  itens, max = 5, vazio, aoVer, rotuloVer = 'Ver na tabela',
}: {
  itens: ItemAtencao[];
  max?: number;
  vazio: ReactNode;
  /** ação para item sem link (ex.: filtrar a tabela pelo ponto) */
  aoVer?: (item: ItemAtencao) => void;
  rotuloVer?: string;
}) {
  const [todos, setTodos] = useState(false);
  if (itens.length === 0) {
    return <EmptyState icone="check" titulo="Tudo certo por aqui">{vazio}</EmptyState>;
  }
  const visiveis = todos ? itens : itens.slice(0, max);
  return (
    <div>
      <div className="atencao">
        {visiveis.map((i) => (
          <div key={i.id} className="atencao-item">
            <SeveridadeBadge severidade={i.severidade} />
            <div>
              <div className="titulo">{i.titulo}</div>
              <div className="detalhe">{i.detalhe}</div>
            </div>
            {i.acao ? (
              <Link className="btn sm" to={i.acao.to}>{i.acao.rotulo}</Link>
            ) : aoVer && i.pontoId ? (
              <button type="button" className="btn sm" onClick={() => aoVer(i)}>{rotuloVer}</button>
            ) : <span />}
          </div>
        ))}
      </div>
      {itens.length > max && (
        <button type="button" className="btn sm" style={{ marginTop: 10 }} onClick={() => setTodos((v) => !v)}>
          {todos ? 'Mostrar menos' : `Ver todas (${num(itens.length)})`}
        </button>
      )}
    </div>
  );
}

// -------------------------------------------- formatadores p/ tooltip Recharts
// O Recharts entrega o valor como ValueType (pode ser undefined), então os
// formatadores recebem `unknown` e convertem — evita conflito de tipo.
export const tipBRL = (v: unknown): string => brl(Number(v ?? 0));
export const tipKW = (v: unknown): string => kw(Number(v ?? 0));
export const tipKWh = (v: unknown): string => kwh(Number(v ?? 0));
export const tipPct = (v: unknown): string => `${num(Number(v ?? 0), 1)}%`;

// ------------------------------------------------- tooltip customizado (Recharts)
interface ItemTip { name?: string; value?: unknown; color?: string; dataKey?: string | number }

/**
 * Tooltip escuro no padrão do sistema. `fmt` decide como formatar o número e `nomes` traduz o
 * nome da série (o dataKey vira palavra de gente). Série sem valor (média de hoje) não aparece.
 * Uso: <Tooltip content={<ChartTip fmt={brl} nomes={{ faturamento: 'Receita' }} />} />
 */
export function ChartTip({
  active, payload, label, fmt = (v: number) => num(v, 1), sufixo = '', nomes,
}: {
  active?: boolean; payload?: ItemTip[]; label?: unknown;
  fmt?: (v: number) => string; sufixo?: string;
  nomes?: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      {label !== undefined && <div className="tip-label">{String(label)}</div>}
      {payload.filter((p) => p.value != null).map((p, i) => {
        const chave = String(p.dataKey ?? p.name ?? '');
        return (
          <div className="tip-row" key={i}>
            <span className="tip-key" style={{ background: p.color ?? '#fff' }} />
            <span>{nomes?.[chave] ?? p.name ?? chave}</span>
            <span className="tip-val">{fmt(Number(p.value ?? 0))}{sufixo}</span>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------- gráfico diário (barras + média móvel)
export type MetricaDia = 'faturamento' | 'energia' | 'sessoes';

export const METRICAS_DIA: Record<MetricaDia, {
  rotulo: string; rotuloMedia: string; fmt: (v: number) => string; eixo: (v: number) => string;
  largura: number; media: 'mediaFaturamento' | 'mediaEnergia' | 'mediaSessoes';
}> = {
  faturamento: { rotulo: 'Receita', rotuloMedia: 'Média de 7 dias', fmt: brl, eixo: eixoBRL, largura: 68, media: 'mediaFaturamento' },
  energia: { rotulo: 'Energia', rotuloMedia: 'Média de 7 dias', fmt: kwh, eixo: eixoKWh, largura: 64, media: 'mediaEnergia' },
  sessoes: { rotulo: 'Sessões', rotuloMedia: 'Média de 7 dias', fmt: (v) => num(v, v % 1 ? 1 : 0), eixo: eixoNum, largura: 40, media: 'mediaSessoes' },
};

interface LinhaDia { dia: string; valor: number; media: number | null; parcial: boolean }

/** Barra do dia; hoje (parcial) fica vazada para não parecer queda. */
function BarraDia(p: { x?: number; y?: number; width?: number; height?: number; payload?: LinhaDia }) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = p;
  if (!(height > 0)) return <g />;
  const parcial = Boolean(payload?.parcial);
  return (
    <rect
      x={x} y={y} width={width} height={height} rx={2}
      fill={CHART.dado} fillOpacity={parcial ? 0.18 : 0.85}
      stroke={parcial ? CHART.dado : 'none'} strokeDasharray={parcial ? '3 2' : undefined}
    />
  );
}

function TipDia({ active, payload, metrica }: {
  active?: boolean; payload?: { payload?: LinhaDia }[]; metrica: MetricaDia;
}) {
  const linha = payload?.[0]?.payload;
  if (!active || !linha) return null;
  const m = METRICAS_DIA[metrica];
  return (
    <div className="chart-tip">
      <div className="tip-label">{linha.dia}{linha.parcial ? ' · hoje (parcial)' : ''}</div>
      <div className="tip-row">
        <span className="tip-key" style={{ background: CHART.dado }} />
        <span>{m.rotulo}</span>
        <span className="tip-val">{m.fmt(linha.valor)}</span>
      </div>
      {linha.media !== null && (
        <div className="tip-row">
          <span className="tip-key" style={{ background: CHART.media }} />
          <span>{m.rotuloMedia}</span>
          <span className="tip-val">{m.fmt(linha.media)}</span>
        </div>
      )}
    </div>
  );
}

/** Barras diárias com média móvel de 7 dias; o último dia, se for hoje, aparece como parcial. */
export function GraficoDiario({
  serie, metrica, altura = 250,
}: { serie: DiaSerie[]; metrica: MetricaDia; altura?: number }) {
  const m = METRICAS_DIA[metrica];
  const dados: LinhaDia[] = serie.map((d) => ({
    dia: d.dia,
    valor: metrica === 'faturamento' ? d.faturamento : metrica === 'energia' ? d.energia : d.sessoes,
    media: d[m.media],
    parcial: d.parcial,
  }));
  const temParcial = dados.some((d) => d.parcial);
  return (
    <>
      <ResponsiveContainer width="100%" height={altura}>
        <ComposedChart data={dados} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid {...gradeProps} />
          <XAxis dataKey="dia" {...eixoProps} minTickGap={22} interval="preserveStartEnd" />
          <YAxis {...eixoProps} width={m.largura} tickFormatter={m.eixo} />
          <Tooltip cursor={{ fill: 'rgba(244,242,238,.05)' }} content={<TipDia metrica={metrica} />} />
          <RBar dataKey="valor" shape={BarraDia} isAnimationActive={false} />
          <Line dataKey="media" stroke={CHART.media} strokeWidth={2} dot={false} connectNulls={false}
                isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="legenda">
        <span className="chave"><span className="amostra" style={{ background: CHART.dado }} />{m.rotulo} por dia</span>
        <span className="chave"><span className="traco" style={{ color: CHART.media }} />Média móvel de 7 dias</span>
        {temParcial && (
          <span className="chave">
            <span className="amostra" style={{ border: `1px dashed ${CHART.dado}`, background: 'rgba(90,176,255,.18)' }} />
            hoje (parcial)
          </span>
        )}
      </div>
    </>
  );
}
