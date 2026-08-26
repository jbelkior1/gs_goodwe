import { useEffect, useMemo, useRef, useState } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import { useApp } from '../../app/estado';
import {
  obterPonto, carregadoresDoPonto, sessoesAtivas, tarifaAtual, solarDoPonto,
} from '../../domain/db';
import { responderVolt, saudacaoVolt, type ContextoVolt } from '../../domain/engine/assistente';
import { brl, num, CHART, AnelSoC } from '../../ui/kit';
import { Icone } from '../../ui/icones';
import { Volt, type EstadoVolt } from '../../ui/Volt';

interface Mensagem { de: 'volt' | 'motorista'; texto: string }

/** Tela que roda dentro do totem do eletroposto: painel da recarga + o Volt. */
export default function Totem() {
  const { pontoId } = useApp();
  const ponto = obterPonto(pontoId)!;
  const carregadores = carregadoresDoPonto(pontoId);
  const solar = solarDoPonto(pontoId);
  const tarifa = tarifaAtual(pontoId);

  // semente: uma sessão real da base; se o ponto estiver vazio, abre uma demo
  const semente = sessoesAtivas(pontoId)[0];
  const precoKWh = semente?.tarifaAplicadaKWh ?? tarifa.precoFinalKWh;

  const [soc, setSoc] = useState(() => semente?.socAtual ?? 38);
  const [kw, setKw] = useState(() => semente?.potenciaAtualKW ?? 21.4);
  const [kwh, setKwh] = useState(() => semente?.energiaKWh ?? 6.2);
  // a curva já abre com histórico: rampa de partida + oscilação, como no equipamento
  const [curva, setCurva] = useState<{ t: number; kw: number }[]>(() => {
    const base = semente?.potenciaAtualKW ?? 21.4;
    return Array.from({ length: 28 }, (_, i) => ({
      t: i,
      kw: Math.max(2, base * Math.min(1, (i + 3) / 9) + Math.sin(i / 2.1) * (base * 0.09)),
    }));
  });
  const [relogio, setRelogio] = useState(() => new Date());

  // telemetria ao vivo: a potência oscila e cai depois dos 80% (curva CC/CV)
  useEffect(() => {
    const id = setInterval(() => {
      setRelogio(new Date());
      setSoc((s) => (s >= 99 ? 24 : s + 0.35));
      setKw((p) => {
        const teto = soc > 80 ? 12 : soc > 60 ? 24 : 34;
        const alvo = Math.min(teto, Math.max(5, p + (Math.random() - 0.5) * 3.2));
        return alvo;
      });
      setKwh((e) => e + kw / 3600 * 4);
      setCurva((c) => [...c.slice(1), { t: (c[c.length - 1]?.t ?? 0) + 1, kw }]);
    }, 1000);
    return () => clearInterval(id);
  }, [kw, soc]);

  const custo = kwh * precoKWh;
  const minutosRestantes = Math.max(1, Math.round(((80 - soc) / 100) * 62));
  const vagasLivres = carregadores.filter((c) => c.estado === 'DISPONIVEL').length;

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

  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensagens, estadoVolt]);

  const perguntar = (texto: string) => {
    const pergunta = texto.trim();
    if (!pergunta || estadoVolt === 'pensando') return;
    setMensagens((m) => [...m, { de: 'motorista', texto: pergunta }]);
    setRascunho('');
    setSugestoes([]);
    setEstadoVolt('pensando');

    // pequena pausa: o totem "pensando" deixa a conversa legível
    window.setTimeout(() => {
      const r = responderVolt(pergunta, contexto);
      setMensagens((m) => [...m, { de: 'volt', texto: r.texto }]);
      setSugestoes(r.sugestoes ?? []);
      setEstadoVolt('falando');
      window.setTimeout(() => setEstadoVolt('ocioso'), 1400);
    }, 620);
  };

  const horaFmt = relogio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="totem-tela">
      {/* ------------------------------------------------------ cabeçalho */}
      <header className="totem-topo">
        <span className="totem-marca">GOODWE</span>
        <span className="totem-divisor" />
        <span className="totem-eyebrow">Autoatendimento</span>
        <span className="meta" style={{ marginLeft: 'auto' }}>{horaFmt}</span>
      </header>

      {/* ------------------------------------------------------- painel */}
      <section className="totem-dash">
        <div className="totem-anel">
          <AnelSoC soc={soc} tamanho={118} />
          <div className="totem-anel-legenda">
            <span className="kpi-label">Bateria</span>
            <span className="tiny muted">{minutosRestantes} min até 80%</span>
          </div>
        </div>

        <div className="totem-metricas">
          <div className="totem-metrica">
            <span className="kpi-label">Potência</span>
            <span className="totem-num">{num(kw, 1)}<small> kW</small></span>
          </div>
          <div className="totem-metrica">
            <span className="kpi-label">Entregue</span>
            <span className="totem-num">{num(kwh, 1)}<small> kWh</small></span>
          </div>
          <div className="totem-metrica">
            <span className="kpi-label">A pagar</span>
            <span className="totem-num acento">{brl(custo)}</span>
          </div>
          <div className="totem-metrica">
            <span className="kpi-label">Preço travado</span>
            <span className="totem-num">{brl(precoKWh)}<small>/kWh</small></span>
          </div>
        </div>
      </section>

      <section className="totem-curva">
        <div className="row between">
          <span className="kpi-label">Curva de carga · tempo real</span>
          <span className="live-tag"><span className="dot pulse" />ao vivo</span>
        </div>
        <ResponsiveContainer width="100%" height={74}>
          <AreaChart data={curva} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="totemGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.serie1} stopOpacity={0.45} />
                <stop offset="100%" stopColor={CHART.serie1} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={[0, (max: number) => Math.max(12, max * 1.5)]} />
            <Area type="monotone" dataKey="kw" stroke={CHART.serie1Claro} strokeWidth={2}
                  fill="url(#totemGrad)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
        <div className="row between meta">
          <span>{vagasLivres}/{carregadores.length} VAGAS LIVRES</span>
          <span>{Math.round(solar.resumo.autossuficiencia * 100)}% SOL + BATERIA</span>
        </div>
      </section>

      {/* --------------------------------------------------------- volt */}
      <section className="totem-chat">
        <div className="totem-volt">
          <Volt estado={estadoVolt} tamanho={78} />
          <div>
            <div className="totem-volt-nome">Volt</div>
            <div className="tiny muted">
              {estadoVolt === 'pensando' ? 'consultando a sessão…' : 'assistente do eletroposto'}
            </div>
          </div>
        </div>

        <div className="totem-mensagens">
          {mensagens.map((m, i) => (
            <div key={i} className={`totem-balao ${m.de}`}>{m.texto}</div>
          ))}
          {estadoVolt === 'pensando' && (
            <div className="totem-balao volt totem-digitando"><span /><span /><span /></div>
          )}
          <div ref={fim} />
        </div>

        {sugestoes.length > 0 && (
          <div className="pill-row totem-sugestoes">
            {sugestoes.map((s) => (
              <button key={s} className="chip" onClick={() => perguntar(s)}>{s}</button>
            ))}
          </div>
        )}

        <form
          className="totem-entrada"
          onSubmit={(e) => { e.preventDefault(); perguntar(rascunho); }}
        >
          <input
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            placeholder="Pergunte ao Volt…"
            aria-label="Pergunte ao Volt"
          />
          <button type="submit" className="btn primary" aria-label="Enviar pergunta">
            <Icone nome="raio" tamanho={14} />
          </button>
        </form>
      </section>

      <footer className="totem-rodape meta">
        <span className="totem-rodape-ponto">{ponto.nome.toUpperCase()} · {carregadores.length} CONECTORES</span>
        <span>PONTO W</span>
      </footer>
    </div>
  );
}
