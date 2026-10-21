import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/estado';
import {
  carregadoresDoPonto, cobrancaDaSessao, obterPonto, obterVeiculo, sessaoDoMotorista, solarDoPonto, tarifaAtual,
} from '../../domain/db';
import { responderVolt, saudacaoVolt, type ContextoVolt, type FaseVolt } from '../../domain/engine/assistente';
import { minutosAte100, vagaLivre } from '../../domain/engine/totem';
import { Icone } from '../../ui/icones';
import { Volt, type EstadoVolt } from '../../ui/Volt';

interface Mensagem { de: 'volt' | 'motorista'; texto: string }

const FASE_DA_SESSAO: Record<string, FaseVolt> = {
  AUTENTICADO: 'iniciando', CARREGANDO: 'carga', PAUSADO: 'pausada', ENCERRANDO: 'encerrando', CONCLUIDO: 'pagar',
};

/**
 * O Volt dentro do app do motorista.
 *
 * É o mesmo assistente do totem, com o mesmo cérebro. O contexto vem da recarga que a pessoa tem
 * em andamento; sem recarga, o Volt explica o passo a passo e não cita nenhum número de recarga.
 * A conversa recomeça quando a fase ou a sessão mudam.
 */
export default function Assistente() {
  const { pontoId, motoristaId, perfil } = useApp();
  const ativa = sessaoDoMotorista(perfil?.motoristaId ?? motoristaId);
  const ponto = obterPonto(ativa?.pontoId ?? pontoId)!;
  const carregadores = carregadoresDoPonto(ponto.id);
  const tarifa = tarifaAtual(ponto.id);
  const fase: FaseVolt = (ativa && FASE_DA_SESSAO[ativa.estado]) || 'espera';
  const veiculo = obterVeiculo(ativa?.veiculoId);

  const contexto: ContextoVolt = {
    ponto, fase, onde: 'app',
    sessao: ativa ? {
      socAtual: ativa.socAtual, energiaKWh: ativa.energiaKWh, potenciaAtualKW: ativa.potenciaAtualKW,
      tarifaAplicadaKWh: ativa.tarifaAplicadaKWh, custoAcumulado: ativa.custoAcumulado,
      visitante: ativa.autorizacao === 'VISITANTE', limiteValor: ativa.limiteValor, motivoPausa: ativa.motivoPausa,
    } : undefined,
    minutosRestantes: ativa && fase === 'carga'
      ? minutosAte100(ativa.socAtual, veiculo?.capacidadeKWh, ativa.potenciaAtualKW) ?? undefined : undefined,
    precoAgoraKWh: tarifa.precoFinalKWh,
    valorConta: ativa && fase === 'pagar' ? (cobrancaDaSessao(ativa.id)?.valor ?? ativa.custoAcumulado) : undefined,
    autossuficiencia: ponto.temSolar ? solarDoPonto(ponto.id).resumo.autossuficiencia : undefined,
    vagasLivres: carregadores.filter(vagaLivre).length,
    totalVagas: carregadores.length,
  };

  return <Conversa key={`${fase}:${ativa?.id ?? ''}`} contexto={contexto} />;
}

function Conversa({ contexto }: { contexto: ContextoVolt }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [rascunho, setRascunho] = useState('');
  const [sugestoes, setSugestoes] = useState<string[] | null>(null);
  const [estado, setEstado] = useState<EstadoVolt>('ocioso');
  const lista = useRef<HTMLDivElement>(null);
  const ultimo = useRef(contexto);
  const timers = useRef<number[]>([]);

  useEffect(() => { ultimo.current = contexto; });
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  // rola só a lista de mensagens, nunca os ancestrais
  useEffect(() => { const el = lista.current; if (el) el.scrollTop = el.scrollHeight; }, [mensagens, estado]);

  const saudacao = saudacaoVolt(contexto);

  const perguntar = (texto: string) => {
    const pergunta = texto.trim();
    if (!pergunta || estado === 'pensando') return;
    setMensagens((m) => [...m, { de: 'motorista', texto: pergunta }]);
    setRascunho('');
    setSugestoes([]);
    setEstado('pensando');
    timers.current.push(window.setTimeout(() => {
      const r = responderVolt(pergunta, ultimo.current);
      setMensagens((m) => [...m, { de: 'volt', texto: r.texto }]);
      setSugestoes(r.sugestoes ?? []);
      setEstado('falando');
      timers.current.push(window.setTimeout(() => setEstado('ocioso'), 1400));
    }, 620));
  };

  const chips = sugestoes ?? saudacao.sugestoes ?? [];

  return (
    <div className="mv-chat">
      <header className="mv-chat-topo">
        <Volt estado={estado} tamanho={62} />
        <div>
          <div className="mv-chat-nome">Volt</div>
          <div className="mv-chat-estado">
            {estado === 'pensando' ? 'consultando sua recarga…' : `assistente · ${contexto.ponto.nome}`}
          </div>
        </div>
      </header>

      <div className="tt-mensagens mv-chat-msgs" ref={lista}>
        <div className="tt-balao volt">{saudacao.texto}</div>
        {mensagens.map((m, i) => (
          <div key={i} className={`tt-balao ${m.de}`}>{m.texto}</div>
        ))}
        {estado === 'pensando' && (
          <div className="tt-balao volt tt-digitando"><span /><span /><span /></div>
        )}
      </div>

      <div className="tt-acoes">
        {chips.length > 0 && (
          <div className="tt-sugestoes">
            {chips.slice(0, 3).map((s) => (
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
    </div>
  );
}
