import { useCallback, useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { API_PY, chamar, type Cotacao, type Meta, type Reparticao, type Sessao } from './api';
import './sessoes.css';

/**
 * Sessões de recarga (Sprint 4 · DSA). Esta tela não calcula nada: cada botão chama a API
 * em Python (backend/pontow) e mostra o resultado e o selo com o algoritmo e as comparações.
 */

type Aba = 'nova' | 'sessoes' | 'estatisticas' | 'relatorio' | 'complexidade';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v: number, casas = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const dataHora = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};
const duracao = (min: number) => (min ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : '—');
const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function Selo({ meta }: { meta: Meta | null }) {
  if (!meta) return null;
  return (
    <div className="sp-selo" title="Resposta do backend Python">
      <span className="sp-selo-py">Python</span>
      <code>{meta.rota}</code>
      {meta.algoritmo && <span>{meta.algoritmo}</span>}
      {meta.complexidade && <span className="sp-selo-o">{meta.complexidade}</span>}
      {meta.comparacoes != null && <strong>{num(meta.comparacoes)} comparações</strong>}
      <span>n = {num(meta.n)}</span>
      <span>{num(meta.ms, 1)} ms</span>
    </div>
  );
}

function Erro({ msg }: { msg: string | null }) {
  return msg ? <div className="sp-erro">{msg}</div> : null;
}

function TabelaSessoes({ sessoes, max = 400 }: { sessoes: Sessao[]; max?: number }) {
  return (
    <div className="sp-tabela-wrap">
      <table className="sp-tabela">
        <thead>
          <tr>
            <th>#</th><th>Início</th><th>Ponto</th><th>Vaga</th><th>Motorista</th><th>Veículo</th>
            <th>Faixa</th><th className="n">R$/kWh</th><th className="n">kWh</th><th className="n">Duração</th>
            <th className="n">Valor</th><th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {sessoes.slice(0, max).map((s) => (
            <tr key={s.id}>
              <td className="mono">{s.id}</td>
              <td>{dataHora(s.inicio)}</td>
              <td>{s.ponto}</td>
              <td className="n">{s.vaga}</td>
              <td>{s.motorista}</td>
              <td>{s.veiculo}</td>
              <td><span className={`sp-faixa sp-faixa-${s.faixa.toLowerCase()}`}>{s.faixa}</span></td>
              <td className="n">{num(s.tarifa_kwh, 2)}</td>
              <td className="n">{s.estado === 'FATURADO' ? num(s.energia_kwh, 1) : '—'}</td>
              <td className="n">{duracao(s.duracao_min)}</td>
              <td className="n">{s.estado === 'FATURADO' ? brl(s.valor) : '—'}</td>
              <td><span className={`sp-estado sp-estado-${s.estado.toLowerCase()}`}>{s.estado === 'FATURADO' ? 'Faturada' : 'Carregando'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {sessoes.length === 0 && <p className="sp-vazio">Nenhuma sessão encontrada.</p>}
    </div>
  );
}

function Repartir({ r }: { r: Reparticao }) {
  const linhas: [string, number][] = [
    ['Energia (distribuidora)', r.energia],
    ['GoodWe · royalty 6%', r.royalty_goodwe],
    ['GoodWe · fundo de marketing 2%', r.fundo_marketing],
    ['Pix 1,5%', r.pix],
    ['Fica com o comércio', r.comercio],
  ];
  return (
    <div className="sp-reparte">
      {linhas.map(([nome, v]) => (
        <div key={nome} className="sp-reparte-linha">
          <span>{nome}</span>
          <div className="sp-barra"><i style={{ width: `${r.valor ? (v / r.valor) * 100 : 0}%` }} /></div>
          <strong>{brl(v)}</strong>
        </div>
      ))}
      <div className="sp-reparte-linha sp-total"><span>Total pago</span><div /><strong>{brl(r.valor)}</strong></div>
    </div>
  );
}

// ---------------------------------------------------------------- aba: nova recarga
interface Catalogo { pontos: Record<string, number>; veiculos: string[]; motoristas: string[]; preco_base: number }

function NovaRecarga({ aoMudar }: { aoMudar: () => void }) {
  const [cat, setCat] = useState<Catalogo | null>(null);
  const [ponto, setPonto] = useState('FIAP Aclimação');
  const [vaga, setVaga] = useState(1);
  const [motorista, setMotorista] = useState('');
  const [veiculo, setVeiculo] = useState('BYD Dolphin');
  const [data, setData] = useState(hojeISO());
  const [hora, setHora] = useState('18:00');
  const [iniciada, setIniciada] = useState<{ sessao: Sessao; cotacao: Cotacao } | null>(null);
  const [abertas, setAbertas] = useState<Sessao[]>([]);
  const [energia, setEnergia] = useState<Record<number, string>>({});
  const [recibo, setRecibo] = useState<{ sessao: Sessao; reparticao: Reparticao } | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregarAbertas = useCallback(async () => {
    const r = await chamar<Sessao[]>('/sessoes?estado=CARREGANDO');
    setAbertas(r.dados);
  }, []);

  useEffect(() => {
    chamar<Catalogo>('/catalogo').then((r) => setCat(r.dados)).catch((e) => setErro(String(e.message ?? e)));
    carregarAbertas().catch(() => {});
  }, [carregarAbertas]);

  const iniciar = async () => {
    setErro(null);
    try {
      const r = await chamar<{ sessao: Sessao; cotacao: Cotacao }>('/sessoes', {
        ponto, vaga, motorista, veiculo, inicio: `${data}T${hora}`,
      });
      setIniciada(r.dados);
      setRecibo(null);
      setMeta(r.meta);
      setMotorista('');
      await carregarAbertas();
      aoMudar();
    } catch (e) { setErro((e as Error).message); }
  };

  const encerrar = async (id: number) => {
    setErro(null);
    try {
      const r = await chamar<{ sessao: Sessao; reparticao: Reparticao }>(`/sessoes/${id}/encerrar`, {
        energia_kwh: Number(String(energia[id] ?? '').replace(',', '.')),
      });
      setRecibo(r.dados);
      setIniciada(null);
      setMeta(r.meta);
      await carregarAbertas();
      aoMudar();
    } catch (e) { setErro((e as Error).message); }
  };

  const vagas = cat?.pontos[ponto] ?? 1;

  return (
    <div className="sp-grid2">
      <section className="sp-card">
        <h2>Iniciar recarga</h2>
        <p className="sp-dica">O carro conectou: o backend calcula o preço do kWh e o trava na sessão.</p>
        <div className="sp-form">
          <label>Ponto
            <select value={ponto} onChange={(e) => { setPonto(e.target.value); setVaga(1); }}>
              {cat && Object.entries(cat.pontos).map(([p, n]) => <option key={p} value={p}>{p} ({n} vaga{n > 1 ? 's' : ''})</option>)}
            </select>
          </label>
          <label>Vaga
            <select value={vaga} onChange={(e) => setVaga(Number(e.target.value))}>
              {Array.from({ length: vagas }, (_, i) => <option key={i} value={i + 1}>Vaga {i + 1}</option>)}
            </select>
          </label>
          <label>Motorista
            <input value={motorista} onChange={(e) => setMotorista(e.target.value)} placeholder="Nome do motorista" list="sp-motoristas" />
            <datalist id="sp-motoristas">{cat?.motoristas.map((m) => <option key={m} value={m} />)}</datalist>
          </label>
          <label>Veículo
            <select value={veiculo} onChange={(e) => setVeiculo(e.target.value)}>
              {cat?.veiculos.map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
          <label>Data<input type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
          <label>Hora de início<input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></label>
        </div>
        <button className="sp-btn sp-btn-red" onClick={iniciar} disabled={!cat}>Iniciar recarga</button>
        <Erro msg={erro} />

        {iniciada && (
          <div className="sp-resultado">
            <div className="sp-resultado-topo">
              <span>Sessão <strong>#{iniciada.sessao.id}</strong> · {iniciada.sessao.ponto} · vaga {iniciada.sessao.vaga}</span>
              <span className={`sp-faixa sp-faixa-${iniciada.cotacao.faixa.toLowerCase()}`}>{iniciada.cotacao.faixa}</span>
            </div>
            <div className="sp-preco">{brl(iniciada.cotacao.preco_kwh)}<small>/kWh · preço travado</small></div>
            <ul className="sp-explica">{iniciada.cotacao.explicacao.map((l) => <li key={l}>{l}</li>)}</ul>
            <p className="sp-dica">Piso {brl(iniciada.cotacao.piso)} · teto {brl(iniciada.cotacao.teto)}</p>
          </div>
        )}
        {recibo && (
          <div className="sp-resultado">
            <div className="sp-resultado-topo">
              <span>Recibo da sessão <strong>#{recibo.sessao.id}</strong> · {recibo.sessao.motorista}</span>
              <span>{num(recibo.sessao.energia_kwh, 1)} kWh × {brl(recibo.sessao.tarifa_kwh)}</span>
            </div>
            <div className="sp-preco">{brl(recibo.sessao.valor)}<small> · {duracao(recibo.sessao.duracao_min)} na vaga</small></div>
            <Repartir r={recibo.reparticao} />
          </div>
        )}
        <Selo meta={meta} />
      </section>

      <section className="sp-card">
        <h2>Em andamento <span className="sp-contador">{abertas.length}</span></h2>
        <p className="sp-dica">Informe a energia entregue para encerrar e faturar.</p>
        {abertas.length === 0 && <p className="sp-vazio">Nenhuma recarga em andamento.</p>}
        {abertas.map((s) => (
          <div key={s.id} className="sp-aberta">
            <div>
              <strong>#{s.id} · {s.motorista}</strong>
              <span>{s.ponto} · vaga {s.vaga} · {s.veiculo}</span>
              <span>desde {dataHora(s.inicio)} · {brl(s.tarifa_kwh)}/kWh ({s.faixa})</span>
            </div>
            <div className="sp-aberta-acao">
              <input inputMode="decimal" placeholder="kWh" value={energia[s.id] ?? ''}
                onChange={(e) => setEnergia({ ...energia, [s.id]: e.target.value })} />
              <button className="sp-btn" onClick={() => encerrar(s.id)} disabled={!energia[s.id]}>Encerrar</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- aba: sessões (listagem, busca e ordenação)
function ListaSessoes({ versao }: { versao: number }) {
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [termo, setTermo] = useState('');
  const [campo, setCampo] = useState('valor');
  const [ordem, setOrdem] = useState('desc');
  const [algoritmo, setAlgoritmo] = useState('merge');
  const [titulo, setTitulo] = useState('Todas as sessões, por número');

  const rodar = async (caminho: string, t: string) => {
    setErro(null);
    try {
      const r = await chamar<Sessao[]>(caminho);
      setSessoes(r.dados);
      setMeta(r.meta);
      setTitulo(t);
    } catch (e) { setErro((e as Error).message); }
  };

  const listar = () => rodar('/sessoes', 'Todas as sessões, por número');
  useEffect(() => { listar(); }, [versao]); // eslint-disable-line react-hooks/exhaustive-deps

  const buscar = () => {
    const t = termo.trim().replace(/^#/, '');
    if (!t) return listar();
    if (/^\d+$/.test(t)) return rodar(`/sessoes/busca?id=${t}`, `Busca pelo número ${t}`);
    return rodar(`/sessoes/busca?texto=${encodeURIComponent(t)}`, `Busca por “${t}”`);
  };

  const ordenar = () => rodar(
    `/sessoes/ordenar?campo=${campo}&ordem=${ordem}&algoritmo=${algoritmo}`,
    `Ordenadas por ${campo} (${ordem === 'desc' ? 'maior → menor' : 'menor → maior'}) com ${algoritmo === 'merge' ? 'Merge Sort' : 'Insertion Sort'}`,
  );

  return (
    <section className="sp-card">
      <div className="sp-barra-ferramentas">
        <div className="sp-grupo">
          <span className="sp-rotulo">Buscar</span>
          <input value={termo} onChange={(e) => setTermo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()}
            placeholder="nº da sessão (binária) ou motorista, ponto, veículo (linear)" className="sp-busca" />
          <button className="sp-btn" onClick={buscar}>Buscar</button>
          <button className="sp-btn sp-btn-ghost" onClick={() => { setTermo(''); listar(); }}>Listar todas</button>
        </div>
        <div className="sp-grupo">
          <span className="sp-rotulo">Ordenar</span>
          <select value={campo} onChange={(e) => setCampo(e.target.value)}>
            <option value="valor">valor</option><option value="energia">energia</option>
            <option value="duracao">duração</option><option value="inicio">início</option>
            <option value="tarifa">tarifa</option><option value="motorista">motorista</option>
            <option value="id">número</option>
          </select>
          <select value={ordem} onChange={(e) => setOrdem(e.target.value)}>
            <option value="desc">maior → menor</option><option value="asc">menor → maior</option>
          </select>
          <select value={algoritmo} onChange={(e) => setAlgoritmo(e.target.value)}>
            <option value="merge">Merge Sort · O(n log n)</option>
            <option value="insertion">Insertion Sort · O(n²)</option>
          </select>
          <button className="sp-btn sp-btn-red" onClick={ordenar}>Ordenar</button>
        </div>
      </div>
      <Erro msg={erro} />
      <div className="sp-lista-topo">
        <h2>{titulo} <span className="sp-contador">{sessoes.length}</span></h2>
        <Selo meta={meta} />
      </div>
      <TabelaSessoes sessoes={sessoes} />
    </section>
  );
}

// ---------------------------------------------------------------- aba: estatísticas
interface Grupo { sessoes: number; energia_kwh: number; receita: number }
interface Estat {
  total_sessoes: number; sessoes_faturadas: number; em_andamento: number; energia_total_kwh: number;
  receita_total: number; ticket_medio: number; energia_media_kwh: number; duracao_media_min: number;
  tarifa_media_kwh: number; mediana_valor: number; maior_recarga: Sessao | null; menor_recarga: Sessao | null;
  por_ponto: Record<string, Grupo>; por_faixa: Record<string, Grupo>;
}

function Cartao({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return <div className="sp-kpi"><span>{rotulo}</span><strong>{valor}</strong>{sub && <small>{sub}</small>}</div>;
}

function TabelaGrupos({ titulo, grupos }: { titulo: string; grupos: Record<string, Grupo> }) {
  return (
    <div>
      <h3>{titulo}</h3>
      <table className="sp-tabela">
        <thead><tr><th>{titulo.replace('Por ', '')}</th><th className="n">Sessões</th><th className="n">kWh</th><th className="n">Receita</th></tr></thead>
        <tbody>
          {Object.entries(grupos).map(([nome, g]) => (
            <tr key={nome}><td>{nome}</td><td className="n">{g.sessoes}</td><td className="n">{num(g.energia_kwh, 1)}</td><td className="n">{brl(g.receita)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Estatisticas({ versao }: { versao: number }) {
  const [e, setE] = useState<Estat | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    chamar<Estat>('/estatisticas').then((r) => { setE(r.dados); setMeta(r.meta); }).catch((x) => setErro(x.message));
  }, [versao]);
  if (!e) return <Erro msg={erro} />;
  return (
    <section className="sp-card">
      <div className="sp-lista-topo"><h2>Estatísticas das sessões</h2><Selo meta={meta} /></div>
      <div className="sp-kpis">
        <Cartao rotulo="Sessões" valor={num(e.total_sessoes)} sub={`${e.sessoes_faturadas} faturadas · ${e.em_andamento} carregando`} />
        <Cartao rotulo="Energia entregue" valor={`${num(e.energia_total_kwh, 1)} kWh`} sub={`média ${num(e.energia_media_kwh, 1)} kWh`} />
        <Cartao rotulo="Receita" valor={brl(e.receita_total)} sub={`tarifa média ${brl(e.tarifa_media_kwh)}/kWh`} />
        <Cartao rotulo="Ticket médio" valor={brl(e.ticket_medio)} sub={`mediana ${brl(e.mediana_valor)}`} />
        <Cartao rotulo="Duração média" valor={duracao(e.duracao_media_min)} sub="tempo na vaga" />
        <Cartao rotulo="Maior recarga" valor={e.maior_recarga ? brl(e.maior_recarga.valor) : '—'}
          sub={e.maior_recarga ? `#${e.maior_recarga.id} · ${e.maior_recarga.motorista}` : ''} />
        <Cartao rotulo="Menor recarga" valor={e.menor_recarga ? brl(e.menor_recarga.valor) : '—'}
          sub={e.menor_recarga ? `#${e.menor_recarga.id} · ${e.menor_recarga.motorista}` : ''} />
      </div>
      <div className="sp-grid2">
        <TabelaGrupos titulo="Por ponto" grupos={e.por_ponto} />
        <TabelaGrupos titulo="Por faixa de horário" grupos={e.por_faixa} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- aba: relatório
interface Rel {
  periodo: { inicio: string | null; fim: string | null };
  resumo: { total_sessoes: number; sessoes_faturadas: number; em_andamento: number; energia_total_kwh: number; receita_total: number; ticket_medio: number; duracao_media_min: number; tarifa_media_kwh: number };
  reparticao: Reparticao;
  top5_recargas: Sessao[];
  ranking_pontos: ({ ponto: string } & Grupo)[];
}

function Relatorio({ versao }: { versao: number }) {
  const [r, setR] = useState<Rel | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const gerar = useCallback(() => {
    chamar<Rel>('/relatorio').then((x) => { setR(x.dados); setMeta(x.meta); }).catch((x) => setErro(x.message));
  }, []);
  useEffect(() => { gerar(); }, [gerar, versao]);
  if (!r) return <Erro msg={erro} />;
  return (
    <section className="sp-card sp-relatorio">
      <div className="sp-lista-topo">
        <h2>Relatório final</h2>
        <div className="sp-grupo">
          <button className="sp-btn" onClick={gerar}>Gerar de novo</button>
          <a className="sp-btn sp-btn-red" href={`${API_PY}/relatorio.csv`}>Baixar CSV</a>
        </div>
      </div>
      <p className="sp-dica">Período: {dataHora(r.periodo.inicio)} a {dataHora(r.periodo.fim)}</p>
      <div className="sp-kpis">
        <Cartao rotulo="Sessões" valor={num(r.resumo.total_sessoes)} sub={`${r.resumo.em_andamento} em andamento`} />
        <Cartao rotulo="Energia" valor={`${num(r.resumo.energia_total_kwh, 1)} kWh`} />
        <Cartao rotulo="Faturamento" valor={brl(r.resumo.receita_total)} />
        <Cartao rotulo="Ticket médio" valor={brl(r.resumo.ticket_medio)} />
        <Cartao rotulo="Duração média" valor={duracao(r.resumo.duracao_media_min)} />
      </div>
      <div className="sp-grid2">
        <div><h3>Para onde foi o dinheiro</h3><Repartir r={r.reparticao} /></div>
        <div>
          <h3>Ranking dos pontos (Merge Sort por receita)</h3>
          <table className="sp-tabela">
            <thead><tr><th>#</th><th>Ponto</th><th className="n">Sessões</th><th className="n">kWh</th><th className="n">Receita</th></tr></thead>
            <tbody>{r.ranking_pontos.map((p, i) => (
              <tr key={p.ponto}><td>{i + 1}º</td><td>{p.ponto}</td><td className="n">{p.sessoes}</td><td className="n">{num(p.energia_kwh, 1)}</td><td className="n">{brl(p.receita)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      <h3>As 5 maiores recargas</h3>
      <TabelaSessoes sessoes={r.top5_recargas} />
      <Selo meta={meta} />
    </section>
  );
}

// ---------------------------------------------------------------- aba: complexidade
interface Medida { n: number; tarifa: number; busca_binaria: number; busca_linear: number; merge_sort: number; insertion_sort: number; ms: Record<string, number> }

const SERIES: [keyof Medida, string, string, string][] = [
  ['tarifa', 'Tarifa (inserir/calcular)', 'O(1)', '#9aa0a6'],
  ['busca_binaria', 'Busca binária', 'O(log n)', '#3ddc97'],
  ['busca_linear', 'Busca linear', 'O(n)', '#5ab0ff'],
  ['merge_sort', 'Merge Sort', 'O(n log n)', '#ffb020'],
  ['insertion_sort', 'Insertion Sort', 'O(n²)', '#ff4d5a'],
];

function Complexidade() {
  const [m, setM] = useState<Medida[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const medir = async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await chamar<Medida[]>('/complexidade');
      setM(r.dados);
      setMeta(r.meta);
    } catch (e) { setErro((e as Error).message); }
    setCarregando(false);
  };
  const dados = useMemo(() => m?.map((l) => ({ ...l, nome: num(l.n) })) ?? [], [m]);
  return (
    <section className="sp-card">
      <div className="sp-lista-topo">
        <h2>O que acontece quando o número de sessões aumenta?</h2>
        <button className="sp-btn sp-btn-red" onClick={medir} disabled={carregando}>{carregando ? 'Medindo no Python…' : 'Medir no Python'}</button>
      </div>
      <p className="sp-dica">O backend gera n sessões e roda os nossos algoritmos contando as comparações (pior caso nas buscas, caso médio nas ordenações).</p>
      <Erro msg={erro} />
      {m && (
        <>
          <table className="sp-tabela">
            <thead>
              <tr><th className="n">n sessões</th>{SERIES.map(([k, nome, o]) => <th key={k} className="n">{nome}<br /><small>{o}</small></th>)}</tr>
            </thead>
            <tbody>{m.map((l) => (
              <tr key={l.n}>
                <td className="n mono">{num(l.n)}</td>
                {SERIES.map(([k]) => <td key={k} className="n mono">{num(l[k] as number)}<br /><small>{num(l.ms[k as string] ?? 0, 2)} ms</small></td>)}
              </tr>
            ))}</tbody>
          </table>
          <div className="sp-grafico">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={dados} margin={{ top: 10, right: 24, left: 10, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,.08)" />
                <XAxis dataKey="nome" stroke="rgba(244,242,238,.6)" label={{ value: 'n sessões', position: 'insideBottomRight', offset: -2, fill: 'rgba(244,242,238,.6)' }} />
                <YAxis scale="log" domain={[1, 'auto']} allowDataOverflow stroke="rgba(244,242,238,.6)" width={80}
                  tickFormatter={(v: number) => num(v)} />
                <Tooltip formatter={(v) => num(Number(v))} contentStyle={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,.15)' }} />
                <Legend />
                {SERIES.map(([k, nome, o, cor]) => (
                  <Line key={k} type="monotone" dataKey={k} name={`${nome} ${o}`} stroke={cor} strokeWidth={2.5} dot isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <p className="sp-dica">Eixo vertical em escala logarítmica: cada linha da grade vale 10× a anterior.</p>
          </div>
        </>
      )}
      <Selo meta={meta} />
    </section>
  );
}

// ---------------------------------------------------------------- página
export default function SessoesPython() {
  const [aba, setAba] = useState<Aba>('nova');
  const [versao, setVersao] = useState(0);
  const [status, setStatus] = useState<'ok' | 'fora' | 'testando'>('testando');
  const [n, setN] = useState(0);

  useEffect(() => {
    chamar<unknown>('/catalogo').then((r) => { setStatus('ok'); setN(r.meta.n); }).catch(() => setStatus('fora'));
  }, [versao]);

  const abas: [Aba, string][] = [
    ['nova', 'Nova recarga'], ['sessoes', 'Sessões'], ['estatisticas', 'Estatísticas'],
    ['relatorio', 'Relatório'], ['complexidade', 'Complexidade'],
  ];

  return (
    <div className="sp">
      <header className="sp-topo">
        <div>
          <div className="sp-marca"><span className="sp-w">W</span> Ponto W · Sessões de recarga</div>
          <p>Sprint 4 · Data Structures and Algorithms — a interface chama o backend em Python.</p>
        </div>
        <div className={`sp-status sp-status-${status}`}>
          <i />
          {status === 'ok' && <>Backend Python conectado · {num(n)} sessões · <a href={`${API_PY}/docs`} target="_blank" rel="noreferrer">{API_PY}/docs</a></>}
          {status === 'fora' && <>Backend Python fora do ar em {API_PY} — rode <code>uvicorn pontow.api:app --port 8000</code> na pasta backend</>}
          {status === 'testando' && <>Conectando ao backend Python…</>}
        </div>
      </header>
      <nav className="sp-abas">
        {abas.map(([id, nome]) => (
          <button key={id} className={aba === id ? 'ativa' : ''} onClick={() => setAba(id)}>{nome}</button>
        ))}
      </nav>
      <main>
        {aba === 'nova' && <NovaRecarga aoMudar={() => setVersao((v) => v + 1)} />}
        {aba === 'sessoes' && <ListaSessoes versao={versao} />}
        {aba === 'estatisticas' && <Estatisticas versao={versao} />}
        {aba === 'relatorio' && <Relatorio versao={versao} />}
        {aba === 'complexidade' && <Complexidade />}
      </main>
    </div>
  );
}
