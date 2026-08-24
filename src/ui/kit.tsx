import type { ReactNode, CSSProperties } from 'react';

/** Componentes compartilhados por todas as telas do Ponto W. */

// ------------------------------------------------------------------ formato
export const brl = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const num = (v: number, casas = 0): string =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

export const pct = (v: number, casas = 0): string => `${(v * 100).toFixed(casas)}%`;

export const hora = (iso: string): string =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export const dataHora = (iso: string): string =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

export const dataCurta = (iso: string): string =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

export function duracao(inicio: string, fim?: string): string {
  const ms = (fim ? new Date(fim).getTime() : Date.now()) - new Date(inicio).getTime();
  const min = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}h${String(min % 60).padStart(2, '0')}` : `${min} min`;
}

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
export function KPI({
  label, value, foot, accent, sm, trend,
}: {
  label: string; value: ReactNode; foot?: ReactNode;
  accent?: 'red' | 'teal' | 'green' | 'solar'; sm?: boolean;
  /** variação percentual vs. período anterior (ex.: 0.12 = +12%) */
  trend?: number;
}) {
  return (
    <div className={`card kpi-card ${accent ? `on-${accent}` : ''}`}>
      <div className="row between">
        <div className="kpi-label">{label}</div>
        {trend !== undefined && <Trend valor={trend} />}
      </div>
      <div className={`kpi-value ${sm ? 'sm' : ''} ${accent ? `kpi-accent-${accent}` : ''}`}>
        {value}
      </div>
      {foot && <div className="kpi-foot">{foot}</div>}
    </div>
  );
}

/** Seta de variação vs. período anterior. */
export function Trend({ valor }: { valor: number }) {
  const dir = valor > 0.005 ? 'up' : valor < -0.005 ? 'down' : 'flat';
  const seta = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '—';
  return (
    <span className={`trend ${dir}`}>
      {seta} {Math.abs(valor * 100).toFixed(0)}%
    </span>
  );
}

// ------------------------------------------------------------------ badge
type Tom = 'green' | 'red' | 'teal' | 'amber' | 'gray' | 'solar';

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

/** Traduz o estado do carregador/sessão em cor e rótulo. */
export function EstadoBadge({ estado }: { estado: string }) {
  const mapa: Record<string, { tom: Tom; label: string; dot?: boolean; pulse?: boolean }> = {
    DISPONIVEL: { tom: 'green', label: 'Disponível', dot: true },
    OCUPADO: { tom: 'teal', label: 'Ocupado', dot: true, pulse: true },
    CARREGANDO: { tom: 'teal', label: 'Carregando', dot: true, pulse: true },
    PAUSADO: { tom: 'amber', label: 'Pausado', dot: true },
    AUTENTICADO: { tom: 'amber', label: 'Autenticado', dot: true },
    OFFLINE: { tom: 'red', label: 'Offline', dot: true },
    MANUTENCAO: { tom: 'gray', label: 'Manutenção' },
    CONCLUIDO: { tom: 'gray', label: 'Concluído' },
    FATURADO: { tom: 'green', label: 'Faturado' },
    PAGO: { tom: 'green', label: 'Pago' },
    PENDENTE: { tom: 'amber', label: 'Pendente' },
    FALHOU: { tom: 'red', label: 'Falhou' },
    ANALISE: { tom: 'teal', label: 'Em análise' },
    VISTORIA: { tom: 'amber', label: 'Vistoria' },
    PENDENTE_DOC: { tom: 'amber', label: 'Pend. documento' },
    APROVADO: { tom: 'green', label: 'Aprovado' },
    REPROVADO: { tom: 'red', label: 'Reprovado' },
  };
  const cfg = mapa[estado] ?? { tom: 'gray' as Tom, label: estado };
  return <Badge tom={cfg.tom} dot={cfg.dot} pulse={cfg.pulse}>{cfg.label}</Badge>;
}

// ------------------------------------------------------------------ barras
export function Bar({ valor, tom = 'var(--teal)', thick }: { valor: number; tom?: string; thick?: boolean }) {
  return (
    <div className={`bar ${thick ? 'thick' : ''}`}>
      <span style={{ width: `${Math.min(100, Math.max(0, valor * 100))}%`, background: tom }} />
    </div>
  );
}

/**
 * Barra da entrada elétrica do ponto: mostra quanto é carga do comércio,
 * quanto é recarga, e onde está o limite do disjuntor.
 */
export function LoadBar({
  comercioKW, recargaKW, limiteKW, solarKW = 0,
}: { comercioKW: number; recargaKW: number; limiteKW: number; solarKW?: number }) {
  const pc = Math.min(100, (comercioKW / limiteKW) * 100);
  const pr = Math.min(100 - pc, (recargaKW / limiteKW) * 100);
  const ps = Math.min(100 - pc - pr, (solarKW / limiteKW) * 100);
  return (
    <div>
      <div className="load-bar">
        <div className="load-seg comercio" style={{ width: `${pc}%` }} />
        <div className="load-seg recarga" style={{ left: `${pc}%`, width: `${pr}%` }} />
        {ps > 0 && (
          <div className="load-seg solar" style={{ left: `${pc + pr}%`, width: `${ps}%` }}
               title="Potência coberta pelo sol" />
        )}
        <div className="load-limit" style={{ left: '92%' }} title="Margem de segurança (92%)" />
      </div>
      <div className="row wrap tiny muted" style={{ marginTop: 6, gap: 14 }}>
        <span className="row" style={{ gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: '#9aa7b8' }} />
          Comércio {num(comercioKW, 1)} kW
        </span>
        <span className="row" style={{ gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--teal)' }} />
          Recarga {num(recargaKW, 1)} kW
        </span>
        {solarKW > 0 && (
          <span className="row" style={{ gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--solar)' }} />
            Sol {num(solarKW, 1)} kW
          </span>
        )}
        <span className="row" style={{ gap: 5 }}>
          <span style={{ width: 2, height: 11, background: 'var(--red)' }} />
          Limite {num(limiteKW, 1)} kW
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
  const cor = soc >= 80 ? 'var(--green)' : soc >= 40 ? 'var(--teal)' : 'var(--amber)';
  return (
    <div style={{ position: 'relative', width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} className="gauge-ring">
        <circle cx={tamanho / 2} cy={tamanho / 2} r={raio} fill="none" stroke="var(--line-2)" strokeWidth={9} />
        <circle
          cx={tamanho / 2} cy={tamanho / 2} r={raio} fill="none" stroke={cor} strokeWidth={9}
          strokeLinecap="round" strokeDasharray={`${preenchido} ${circ}`}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
        fontWeight: 800, fontSize: tamanho * 0.24, letterSpacing: '-1px',
      }}>
        {Math.round(soc)}%
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

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

// ------------------------------------------------------------------ nota
export function Nota({
  titulo, tom = 'red', children,
}: { titulo?: ReactNode; tom?: 'red' | 'teal' | 'amber' | 'gray'; children: ReactNode }) {
  return (
    <div className={`note ${tom === 'red' ? '' : tom}`}>
      {titulo && <b>{titulo}</b>}
      {children}
    </div>
  );
}

// -------------------------------------------- formatadores p/ tooltip Recharts
// O Recharts entrega o valor como ValueType (pode ser undefined), então os
// formatadores recebem `unknown` e convertem — evita conflito de tipo.
export const tipBRL = (v: unknown): string => brl(Number(v ?? 0));
export const tipKW = (v: unknown): string => `${num(Number(v ?? 0), 1)} kW`;
export const tipKWh = (v: unknown): string => `${num(Number(v ?? 0), 1)} kWh`;
export const tipPct = (v: unknown): string => `${num(Number(v ?? 0), 1)}%`;

// ------------------------------------------------- tooltip customizado (Recharts)
interface ItemTip { name?: string; value?: unknown; color?: string; dataKey?: string | number }

/**
 * Tooltip escuro no padrão do sistema. `fmt` decide como formatar o número.
 * Uso: <Tooltip content={<ChartTip fmt={brl} />} />
 */
export function ChartTip({
  active, payload, label, fmt = (v: number) => num(v, 1), sufixo = '',
}: {
  active?: boolean; payload?: ItemTip[]; label?: unknown;
  fmt?: (v: number) => string; sufixo?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      {label !== undefined && <div className="tip-label">{String(label)}</div>}
      {payload.map((p, i) => (
        <div className="tip-row" key={i}>
          <span className="tip-key" style={{ background: p.color ?? '#fff' }} />
          <span>{p.name ?? p.dataKey}</span>
          <span className="tip-val">{fmt(Number(p.value ?? 0))}{sufixo}</span>
        </div>
      ))}
    </div>
  );
}
