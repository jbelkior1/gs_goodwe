import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { useApp } from '../../app/estado';
import {
  carregadoresDoPonto, obterPonto, sessoesAtivas, solarDoPonto, tarifaAtual,
} from '../../domain/db';
import { responderVolt, saudacaoVolt, type ContextoVolt } from '../../domain/engine/assistente';
import { gerarTxid } from '../../domain/engine/tarifa';
import { brl, num, CHART, Badge } from '../../ui/kit';
import { Icone } from '../../ui/icones';
import { CenaCarro3D } from '../../ui/CenaCarro3D';
import { Volt, type EstadoVolt } from '../../ui/Volt';

interface Mensagem { de: 'volt' | 'motorista'; texto: string }

/**
 * Tela que roda dentro do totem.
 *
 * O layout é uma grade de linhas explícitas com `overflow: hidden`: painel,
 * indicadores, curva e rodapé têm altura própria e a conversa fica com a
 * sobra. Assim nada se sobrepõe nem empurra o rodapé para fora, em qualquer
 * altura de tela — só o histórico da conversa rola, por natureza.
 */
export default function Totem() {
  const { pontoId } = useApp();
  const [etapa, setEtapa] = useState<'carregando' | 'pagando' | 'pago'>('carregando');
  const ponto = obterPonto(pontoId)!;
  const carregadores = carregadoresDoPonto(pontoId);
  const solar = solarDoPonto(pontoId);
  const tarifa = tarifaAtual(pontoId);

  const semente = sessoesAtivas(pontoId)[0];
  const precoKWh = semente?.tarifaAplicadaKWh ?? tarifa.precoFinalKWh;

  const [soc, setSoc] = useState(() => semente?.socAtual ?? 38);
  const [kw, setKw] = useState(() => semente?.potenciaAtualKW ?? 21.4);
  const [kwh, setKwh] = useState(() => semente?.energiaKWh ?? 6.2);
  const [relogio, setRelogio] = useState(() => new Date());
  const [curva, setCurva] = useState<{ t: number; kw: number }[]>(() => {
    const p = semente?.potenciaAtualKW ?? 21.4;
    return Array.from({ length: 32 }, (_, i) => ({
      t: i,
      kw: Math.max(2, p * Math.min(1, (i + 3) / 9) + Math.sin(i / 2.1) * (p * 0.09)),
    }));
  });

  // telemetria ao vivo: a potência cai depois dos 80% (curva CC/CV do carro)
  useEffect(() => {
    const id = setInterval(() => {
      setRelogio(new Date());
      setSoc((s) => (s >= 99 ? 24 : s + 0.35));
      setKw((p) => {
        const teto = soc > 80 ? 12 : soc > 60 ? 24 : 34;
        return Math.min(teto, Math.max(5, p + (Math.random() - 0.5) * 3.2));
      });
      setKwh((e) => e + (kw / 3600) * 4);
      setCurva((c) => [...c.slice(1), { t: (c[c.length - 1]?.t ?? 0) + 1, kw }]);
    }, 1000);
    return () => clearInterval(id);
  }, [kw, soc]);

  const custo = kwh * precoKWh;
  const minutosRestantes = Math.max(1, Math.round(((80 - soc) / 100) * 62));
  const vagasLivres = carregadores.filter((c) => c.estado === 'DISPONIVEL').length;
  const socLimitado = Math.min(100, Math.max(0, soc));

  const contexto: ContextoVolt = useMemo(() => ({
    ponto,
    sessao: {
      socAtual: soc, energiaKWh: kwh, potenciaAtualKW: kw,
      tarifaAplicadaKWh: precoKWh, custoAcumulado: custo,
    },
    minutosRestantes,
    autossuficiencia: solar.resumo.autossuficiencia,
    vagasLivres,
    totalVagas: carregadores.length,
  }), [ponto, soc, kwh, kw, precoKWh, custo, minutosRestantes, solar, vagasLivres, carregadores.length]);

  // ------------------------------------------------------------------ chat
  const [mensagens, setMensagens] = useState<Mensagem[]>(
    () => [{ de: 'volt', texto: saudacaoVolt(contexto).texto }],
  );
  const [sugestoes, setSugestoes] = useState<string[]>(() => saudacaoVolt(contexto).sugestoes ?? []);
  const [rascunho, setRascunho] = useState('');
  const [estadoVolt, setEstadoVolt] = useState<EstadoVolt>('ocioso');
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [mensagens, estadoVolt]);

  const perguntar = (texto: string) => {
    const pergunta = texto.trim();
    if (!pergunta || estadoVolt === 'pensando') return;
    setMensagens((m) => [...m, { de: 'motorista', texto: pergunta }]);
    setRascunho('');
    setSugestoes([]);
    setEstadoVolt('pensando');

    window.setTimeout(() => {
      const r = responderVolt(pergunta, contexto);
      setMensagens((m) => [...m, { de: 'volt', texto: r.texto }]);
      setSugestoes(r.sugestoes ?? []);
      setEstadoVolt('falando');
      window.setTimeout(() => setEstadoVolt('ocioso'), 1400);
    }, 620);
  };

  const horaFmt = relogio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const raio = 62;
  const circ = 2 * Math.PI * raio;

  return (
    <div className="tt">
      {/* ------------------------------------------------------ cabeçalho */}
      <header className="tt-topo">
        <span className="tt-marca">GOODWE</span>
        <span className="tt-tag">Autoatendimento</span>
        <span className="tt-hora meta">{horaFmt}</span>
      </header>

      {/* ------------------------------------------ painel principal */}
      <section className="tt-hero" style={{ justifyContent: 'center' }}>
        <div className="tt-anel">
          <svg viewBox="0 0 150 150" className="tt-anel-svg">
            <circle cx="75" cy="75" r={raio} className="tt-anel-trilho" />
            <circle
              cx="75" cy="75" r={raio} className="tt-anel-carga"
              strokeDasharray={`${(socLimitado / 100) * circ} ${circ}`}
            />
            <circle cx="75" cy="75" r={raio - 13} className="tt-anel-pontilhado" />
          </svg>
          <div className="tt-anel-centro">
            <span className="tt-anel-num">{Math.round(soc)}<small>%</small></span>
            <span className="tt-anel-cap">bateria</span>
          </div>
        </div>

        <CenaCarro3D />
      </section>

      <section className="tt-resumo" style={{ display: 'flex', flexDirection: 'column', gap: 15, padding: '15px', borderBottom: '1px solid var(--k-line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="tt-rotulo">Potência agora</span>
            <div className="tt-grande">{num(kw, 1)}<small>kW</small></div>
          </div>
          <div style={{ width: 1, height: 30, background: 'var(--k-line)' }} />
          <div style={{ textAlign: 'right' }}>
            <span className="tt-rotulo">Total a pagar</span>
            <div className="tt-grande tt-acento">{brl(custo)}</div>
          </div>
        </div>
        {etapa === 'carregando' ? (
          <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} onClick={() => setEtapa('pagando')}>
            Encerrar e Pagar
          </button>
        ) : (
          <div className="tt-eta" style={{ justifyContent: 'center' }}>
            Sessão encerrada
          </div>
        )}
      </section>

      {/* ------------------------------------------------- indicadores */}
      <section className="tt-tiles">
        <div className="tt-tile">
          <span className="tt-rotulo">Entregue</span>
          <span className="tt-medio">{num(kwh, 1)}<small>kWh</small></span>
        </div>
        <div className="tt-tile">
          <span className="tt-rotulo">Preço/kWh</span>
          <span className="tt-medio">{brl(precoKWh)}</span>
        </div>
        <div className="tt-tile">
          <span className="tt-rotulo">Vagas</span>
          <span className="tt-medio">{vagasLivres}<small>/{carregadores.length}</small></span>
        </div>
        <div className="tt-tile">
          <span className="tt-rotulo">Solar</span>
          <span className="tt-medio tt-solar">
            {Math.round(solar.resumo.autossuficiencia * 100)}<small>%</small>
          </span>
        </div>
      </section>

      {etapa === 'carregando' ? (
        <>
          {/* ------------------------------------------------------- curva */}
          <section className="tt-curva">
            <div className="tt-curva-topo">
              <span className="tt-rotulo">Curva de carga</span>
              <span className="live-tag"><span className="dot pulse" />ao vivo</span>
            </div>
            <div className="tt-curva-graf">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={curva} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="ttGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART.serie1} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={CHART.serie1} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis hide domain={[0, (max: number) => Math.max(12, max * 1.45)]} />
                  <Area type="monotone" dataKey="kw" stroke={CHART.serie1Claro} strokeWidth={2}
                        fill="url(#ttGrad)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* --------------------------------------------------------- Volt */}
          <section className="tt-chat">
            <div className="tt-chat-topo">
              <Volt estado={estadoVolt} tamanho={46} />
              <div className="tt-chat-id">
                <span className="tt-chat-nome">Volt</span>
                <span className="tt-chat-estado">
                  {estadoVolt === 'pensando' ? 'consultando a sessão…' : 'pergunte o que quiser'}
                </span>
              </div>
            </div>

            <div className="tt-mensagens">
              {mensagens.map((m, i) => (
                <div key={i} className={`tt-balao ${m.de}`}>{m.texto}</div>
              ))}
              {estadoVolt === 'pensando' && (
                <div className="tt-balao volt tt-digitando"><span /><span /><span /></div>
              )}
              <div ref={fim} />
            </div>

            <div className="tt-acoes">
              {sugestoes.length > 0 && (
                <div className="tt-sugestoes">
                  {sugestoes.slice(0, 3).map((s) => (
                    <button key={s} className="chip" onClick={() => perguntar(s)}>{s}</button>
                  ))}
                </div>
              )}
              <form className="tt-entrada" onSubmit={(e) => { e.preventDefault(); perguntar(rascunho); }}>
                <input
                  value={rascunho}
                  onChange={(e) => setRascunho(e.target.value)}
                  placeholder="Pergunte ao Volt…"
                  aria-label="Pergunte ao Volt"
                />
                <button type="submit" className="btn primary" aria-label="Enviar pergunta">
                  <Icone nome="setaDireita" tamanho={15} />
                </button>
              </form>
            </div>
          </section>
        </>
      ) : (
        <section style={{ gridRow: '5 / 7', display: 'flex', flexDirection: 'column', padding: '20px 24px', overflowY: 'auto' }}>
          {etapa === 'pagando' && (
              <div className="stack" style={{ alignItems: 'center', background: 'var(--k-panel)', padding: 30, borderRadius: 16 }}>
                <h2 style={{ fontSize: 18, marginBottom: 10 }}>Pague com Pix</h2>
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(window.location.origin + import.meta.env.BASE_URL + 'seja-goodwe')}`}
                  alt="QR Code Pix"
                  style={{ width: 150, height: 150, borderRadius: 8 }}
                />
                <div className="tiny muted" style={{ marginTop: 10 }}>txid {gerarTxid(semente?.id ?? '123')}</div>
                <div className="kpi-value kpi-accent-red" style={{ margin: '10px 0' }}>{brl(custo)}</div>
                <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => setEtapa('pago')}>
                  Simular pagamento
                </button>
              </div>
          )}
          {etapa === 'pago' && (
              <div className="stack" style={{ alignItems: 'center', textAlign: 'center', background: 'var(--k-panel)', padding: 30, borderRadius: 16 }}>
                <Icone nome="check" tamanho={54} cor="var(--k-ok)" style={{ marginBottom: 10 }} />
                <div className="strong" style={{ fontSize: 18 }}>Recibo emitido</div>
                <div className="tiny muted" style={{ marginBottom: 20 }}>Sessão {semente?.id ?? '123'} · {brl(custo)}</div>
                <Badge tom="green" dot>Pago via Pix</Badge>
                <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 20 }}
                        onClick={() => {
                          setSoc(38); setKwh(6.2); setKw(21.4); setEtapa('carregando');
                        }}>
                  Nova Recarga
                </button>
              </div>
          )}
        </section>
      )}

      <footer className="tt-rodape meta">
        <span className="tt-rodape-ponto">{ponto.nome.toUpperCase()}</span>
        <span>{ponto.formato.toUpperCase()} · {carregadores.length} CONECTORES</span>
      </footer>
    </div>
  );
}

