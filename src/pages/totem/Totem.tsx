import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { useApp } from '../../app/estado';
import {
  carregadoresDoPonto, cobrancaDaSessao, obterMotorista, obterPonto, obterVeiculo, sessaoDaVaga, semSinal,
  solarDoPonto, tarifaAtual, telemetriaDaSessao,
} from '../../domain/db';
import { responderVolt, saudacaoVolt, type ContextoVolt } from '../../domain/engine/assistente';
import { gerarPixCopiaECola, gerarTxid } from '../../domain/engine/tarifa';
import { encerrarSessao, iniciarVisitante, pagarCobranca } from '../../data/acoes';
import { brl, num, CHART, Badge, EstadoBadge } from '../../ui/kit';
import { Icone } from '../../ui/icones';
import { CenaCarro3D } from '../../ui/CenaCarro3D';
import { Volt, type EstadoVolt } from '../../ui/Volt';
import { QR, linkDoApp } from '../../ui/QR';

interface Mensagem { de: 'volt' | 'motorista'; texto: string }
const CHAVE_PONTO = 'pontow.totem.ponto';

/**
 * Tela do totem (MVP): mostra as vagas do ponto ao vivo. Carro conectado → QR com o código da
 * sessão; o motorista lê no celular e a recarga aparece aqui e no app ao mesmo tempo.
 */
export default function Totem({ orientacao = 'vertical', aparelho = false }: { orientacao?: 'vertical' | 'horizontal'; aparelho?: boolean }) {
  const { pontoId: pontoDoPainel } = useApp();
  const [params] = useSearchParams();
  // o totem real lembra o ponto em que foi instalado (aberto uma vez com ?ponto=); a vitrine segue o painel
  const pontoId = (() => {
    const daUrl = params.get('ponto');
    if (!aparelho) return daUrl ?? pontoDoPainel;
    try {
      if (daUrl) { localStorage.setItem(CHAVE_PONTO, daUrl); return daUrl; }
      return localStorage.getItem(CHAVE_PONTO) ?? pontoDoPainel;
    } catch { return daUrl ?? pontoDoPainel; }
  })();
  const ponto = obterPonto(pontoId);
  const vagas = carregadoresDoPonto(pontoId);
  const [vagaId, setVagaId] = useState<string>('');
  const vagaSel = vagas.find((v) => v.id === vagaId) ?? vagas.find((v) => sessaoDaVaga(v.id)) ?? vagas[0];
  const sessao = vagaSel ? sessaoDaVaga(vagaSel.id) : undefined;
  const cobranca = sessao ? cobrancaDaSessao(sessao.id) : undefined;
  const veiculo = obterVeiculo(sessao?.veiculoId ?? vagaSel?.carro?.veiculoId);
  const motorista = obterMotorista(sessao?.motoristaId);
  const tarifa = ponto ? tarifaAtual(pontoId) : undefined;
  const solar = ponto ? solarDoPonto(pontoId) : undefined;
  const [relogio, setRelogio] = useState(() => new Date());
  const [erro, setErro] = useState('');
  useEffect(() => { const id = setInterval(() => setRelogio(new Date()), 15000); return () => clearInterval(id); }, []);

  const emCarga = !!sessao && ['AUTENTICADO', 'CARREGANDO', 'PAUSADO', 'ENCERRANDO'].includes(sessao.estado);
  const soc = sessao?.socAtual ?? vagaSel?.carro?.socReal ?? 0;
  const kw = emCarga ? sessao!.potenciaAtualKW : 0;
  const kwh = sessao?.energiaKWh ?? 0;
  const custo = cobranca?.valor ?? sessao?.custoAcumulado ?? 0;
  const precoKWh = sessao?.tarifaAplicadaKWh ?? tarifa?.precoFinalKWh ?? 0;
  const vagasLivres = vagas.filter((c) => c.estado === 'DISPONIVEL' && !c.carro).length;
  const faltaKWh = veiculo ? veiculo.capacidadeKWh * ((100 - soc) / 100) : 0;
  const minutosRestantes = kw > 0 ? Math.max(1, Math.round((faltaKWh / kw) * 60)) : 0;
  const curva = sessao ? telemetriaDaSessao(sessao.id).map((t, i) => ({ t: i, kw: t.potenciaKW })) : [];
  if (emCarga) curva.push({ t: curva.length, kw });

  const contexto: ContextoVolt | null = useMemo(() => (ponto ? {
    ponto,
    sessao: { socAtual: soc, energiaKWh: kwh, potenciaAtualKW: kw, tarifaAplicadaKWh: precoKWh, custoAcumulado: custo },
    minutosRestantes, autossuficiencia: solar?.resumo.autossuficiencia ?? 0, vagasLivres, totalVagas: vagas.length,
  } : null), [ponto, soc, kwh, kw, precoKWh, custo, minutosRestantes, solar, vagasLivres, vagas.length]);

  // ------------------------------------------------------------------ chat
  const [mensagens, setMensagens] = useState<Mensagem[]>(() => (contexto ? [{ de: 'volt', texto: saudacaoVolt(contexto).texto }] : []));
  const [sugestoes, setSugestoes] = useState<string[]>(() => (contexto ? saudacaoVolt(contexto).sugestoes ?? [] : []));
  const [rascunho, setRascunho] = useState('');
  const [estadoVolt, setEstadoVolt] = useState<EstadoVolt>('ocioso');
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [mensagens, estadoVolt]);
  const perguntar = (texto: string) => {
    const pergunta = texto.trim();
    if (!pergunta || estadoVolt === 'pensando' || !contexto) return;
    setMensagens((m) => [...m, { de: 'motorista', texto: pergunta }]);
    setRascunho(''); setSugestoes([]); setEstadoVolt('pensando');
    window.setTimeout(() => {
      const r = responderVolt(pergunta, contexto);
      setMensagens((m) => [...m, { de: 'volt', texto: r.texto }]);
      setSugestoes(r.sugestoes ?? []); setEstadoVolt('falando');
      window.setTimeout(() => setEstadoVolt('ocioso'), 1400);
    }, 620);
  };

  const agir = (f: () => Promise<void>) => () => { setErro(''); f().catch((e: Error) => setErro(e.message)); };

  if (!ponto) return <div className="tt"><div style={{ padding: 24 }}>Totem sem ponto. Abra pelo link do painel do franqueado (Meu ponto, Totem do ponto).</div></div>;

  const horaFmt = relogio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const raio = 62;
  const circ = 2 * Math.PI * raio;
  const nomeCurto = motorista?.nome?.split(' ')[0];

  return (
    <div className={`tt ${orientacao === 'horizontal' ? 'tt-h' : ''}`}>
      <header className="tt-topo">
        <span className="tt-marca">GOODWE</span>
        <span className="tt-tag">Autoatendimento</span>
        <span className="tt-hora meta">{horaFmt}</span>
      </header>

      <section className="tt-hero" style={{ flexDirection: 'column', gap: 12 }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          {vagas.map((v) => {
            const s = sessaoDaVaga(v.id);
            return (
              <button key={v.id} className={`chip ${vagaSel?.id === v.id ? 'on' : ''}`} onClick={() => setVagaId(v.id)}>
                {v.apelido} · {s ? s.estado === 'ABERTA' ? 'aguardando QR' : s.estado.toLowerCase() : v.estado === 'DISPONIVEL' ? 'livre' : v.estado.toLowerCase()}
              </button>
            );
          })}
        </div>
        {sessao?.estado === 'ABERTA' ? (
          <div className="row" style={{ gap: 18, alignItems: 'center', justifyContent: 'center' }}>
            <QR texto={linkDoApp(`/motorista/vincular?c=${sessao.codigoVinculo}&tela=cheia`)} tamanho={orientacao === 'horizontal' ? 116 : 170} />
            <div className="stack" style={{ gap: 6 }}>
              <span className="tt-rotulo">Leia com a câmera do celular</span>
              <span style={{ fontSize: orientacao === 'horizontal' ? 32 : 40, fontWeight: 700, letterSpacing: '.18em' }}>{sessao.codigoVinculo}</span>
              <span className="tiny muted">{veiculo ? `${veiculo.montadora} ${veiculo.modelo} conectado` : 'carro conectado'} · {brl(precoKWh)}/kWh agora</span>
            </div>
          </div>
        ) : (
          <div className="row" style={{ gap: 15, alignItems: 'center', justifyContent: 'center' }}>
            <div className="tt-anel">
              <svg viewBox="0 0 150 150" className="tt-anel-svg">
                <circle cx="75" cy="75" r={raio} className="tt-anel-trilho" />
                <circle cx="75" cy="75" r={raio} className="tt-anel-carga" strokeDasharray={`${(Math.min(100, soc) / 100) * circ} ${circ}`} />
                <circle cx="75" cy="75" r={raio - 13} className="tt-anel-pontilhado" />
              </svg>
              <div className="tt-anel-centro">
                <span className="tt-anel-num">{Math.round(soc)}<small>%</small></span>
                <span className="tt-anel-cap">bateria (est.)</span>
              </div>
            </div>
            <CenaCarro3D />
          </div>
        )}
      </section>

      <section className="tt-resumo" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 15, borderBottom: '1px solid var(--k-line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="tt-rotulo">{nomeCurto ? `Olá, ${nomeCurto}` : 'Potência agora'}</span>
            <div className="tt-grande">{num(kw, 1)}<small>kW</small></div>
          </div>
          {sessao && <EstadoBadge estado={sessao.estado} />}
          <div style={{ textAlign: 'right' }}>
            <span className="tt-rotulo">Total</span>
            <div className="tt-grande tt-acento">{brl(custo)}</div>
          </div>
        </div>
        {emCarga && sessao!.estado !== 'ENCERRANDO' && (
          <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: 12 }} onClick={agir(() => encerrarSessao(sessao!, 'totem'))}>
            Encerrar e pagar
          </button>
        )}
        {sessao?.estado === 'ABERTA' && (
          <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={agir(() => iniciarVisitante(sessao))}>
            Carregar sem app (paga aqui no fim)
          </button>
        )}
        {!sessao && vagaSel && (
          <div className="tt-eta" style={{ justifyContent: 'center' }}>
            {vagaSel.estado === 'MANUTENCAO' ? 'Vaga em manutenção'
              : vagaSel.estado === 'OFFLINE' ? (ponto?.status === 'INSTALACAO' ? 'Ponto em instalação' : 'Vaga fora do ar')
              : semSinal(vagaSel) ? 'Carregador sem sinal. Chame o atendimento.'
              : 'Conecte o cabo na vaga para começar'}
          </div>
        )}
        {erro && <div className="tiny" style={{ color: 'var(--k-red2)' }}>{erro}</div>}
      </section>

      <section className="tt-tiles">
        <div className="tt-tile"><span className="tt-rotulo">Entregue</span><span className="tt-medio">{num(kwh, 1)}<small>kWh</small></span></div>
        <div className="tt-tile"><span className="tt-rotulo">Preço/kWh</span><span className="tt-medio">{brl(precoKWh)}</span></div>
        <div className="tt-tile"><span className="tt-rotulo">Vagas livres</span><span className="tt-medio">{vagasLivres}<small>/{vagas.length}</small></span></div>
        <div className="tt-tile"><span className="tt-rotulo">Solar</span><span className="tt-medio tt-solar">{Math.round((solar?.resumo.autossuficiencia ?? 0) * 100)}<small>%</small></span></div>
      </section>

      {sessao?.estado === 'CONCLUIDO' || sessao?.estado === 'FATURADO' ? (
        <section className="tt-pag">
          {sessao.estado === 'CONCLUIDO' && cobranca ? (
            <div className="stack" style={{ alignItems: 'center', background: 'var(--k-panel)', padding: 24, borderRadius: 16 }}>
              <h2 style={{ fontSize: 18, margin: 0 }}>Pague com Pix</h2>
              <QR texto={gerarPixCopiaECola(cobranca.txid || gerarTxid(sessao.id), cobranca.valor)} tamanho={160} />
              <div className="tiny muted">txid {cobranca.txid} · {num(sessao.energiaKWh, 2)} kWh</div>
              <div className="kpi-value kpi-accent-red">{brl(cobranca.valor)}</div>
              <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={agir(() => pagarCobranca(cobranca))}>Simular pagamento</button>
            </div>
          ) : sessao.estado === 'CONCLUIDO' ? (
            <div className="tt-eta" style={{ justifyContent: 'center' }}>Fechando a conta…</div>
          ) : (
            <div className="stack" style={{ alignItems: 'center', textAlign: 'center', background: 'var(--k-panel)', padding: 24, borderRadius: 16 }}>
              <Icone nome="check" tamanho={54} cor="var(--k-ok)" />
              <div className="strong" style={{ fontSize: 18 }}>Pago. Pode desconectar.</div>
              <Badge tom="green" dot>Recibo {sessao.id}</Badge>
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="tt-curva">
            <div className="tt-curva-topo">
              <span className="tt-rotulo">Curva de carga</span>
              {emCarga && <span className="live-tag"><span className="dot pulse" />ao vivo</span>}
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
                  <YAxis hide domain={[0, (max: number) => Math.max(8, max * 1.4)]} />
                  <Area type="monotone" dataKey="kw" stroke={CHART.serie1Claro} strokeWidth={2} fill="url(#ttGrad)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="tt-chat">
            <div className="tt-chat-topo">
              <Volt estado={estadoVolt} tamanho={46} />
              <div className="tt-chat-id">
                <span className="tt-chat-nome">Volt</span>
                <span className="tt-chat-estado">{estadoVolt === 'pensando' ? 'consultando a sessão…' : 'pergunte o que quiser'}</span>
              </div>
            </div>
            <div className="tt-mensagens">
              {mensagens.map((m, i) => <div key={i} className={`tt-balao ${m.de}`}>{m.texto}</div>)}
              {estadoVolt === 'pensando' && <div className="tt-balao volt tt-digitando"><span /><span /><span /></div>}
              <div ref={fim} />
            </div>
            <div className="tt-acoes">
              {sugestoes.length > 0 && (
                <div className="tt-sugestoes">
                  {sugestoes.slice(0, 3).map((s) => <button key={s} className="chip" onClick={() => perguntar(s)}>{s}</button>)}
                </div>
              )}
              <form className="tt-entrada" onSubmit={(e) => { e.preventDefault(); perguntar(rascunho); }}>
                <input id="pergunta-volt" value={rascunho} onChange={(e) => setRascunho(e.target.value)} placeholder="Pergunte ao Volt…" aria-label="Pergunte ao Volt" />
                <button type="submit" className="btn primary" aria-label="Enviar pergunta"><Icone nome="setaDireita" tamanho={15} /></button>
              </form>
            </div>
          </section>
        </>
      )}

      <footer className="tt-rodape meta">
        <span className="tt-rodape-ponto">{ponto.nome.toUpperCase()}</span>
        <span>{ponto.formato.toUpperCase()} · {vagas.length} CONECTORES</span>
      </footer>
    </div>
  );
}
