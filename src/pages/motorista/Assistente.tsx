import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../app/estado';
import {
  carregadoresDoPonto, obterPonto, sessoesAtivas, solarDoPonto, tarifaAtual,
} from '../../domain/db';
import { responderVolt, saudacaoVolt, type ContextoVolt } from '../../domain/engine/assistente';
import { Icone } from '../../ui/icones';
import { Volt, type EstadoVolt } from '../../ui/Volt';

interface Mensagem { de: 'volt' | 'motorista'; texto: string }

/**
 * O Volt dentro do app do motorista.
 *
 * É o mesmo assistente do totem, com o mesmo cérebro — o que muda é o
 * contexto: aqui ele fala da recarga que a pessoa tem em andamento, e não da
 * que está acontecendo no eletroposto à sua frente.
 */
export default function Assistente() {
  const { pontoId } = useApp();
  const ativa = sessoesAtivas()[0];
  const ponto = obterPonto(ativa?.pontoId ?? pontoId)!;
  const carregadores = carregadoresDoPonto(ponto.id);
  const solar = solarDoPonto(ponto.id);
  const tarifa = tarifaAtual(ponto.id);

  const contexto: ContextoVolt = useMemo(() => {
    const soc = ativa?.socAtual ?? 62;
    return {
      ponto,
      sessao: {
        socAtual: soc,
        energiaKWh: ativa?.energiaKWh ?? 9.4,
        potenciaAtualKW: ativa?.potenciaAtualKW ?? 7.2,
        tarifaAplicadaKWh: ativa?.tarifaAplicadaKWh ?? tarifa.precoFinalKWh,
        custoAcumulado: ativa?.custoAcumulado ?? 9.4 * tarifa.precoFinalKWh,
      },
      minutosRestantes: Math.max(1, Math.round(((80 - soc) / 100) * 62)),
      autossuficiencia: solar.resumo.autossuficiencia,
      vagasLivres: carregadores.filter((c) => c.estado === 'DISPONIVEL').length,
      totalVagas: carregadores.length,
    };
  }, [ponto, ativa, tarifa, solar, carregadores]);

  const [mensagens, setMensagens] = useState<Mensagem[]>(
    () => [{ de: 'volt', texto: saudacaoVolt(contexto).texto }],
  );
  const [sugestoes, setSugestoes] = useState<string[]>(() => saudacaoVolt(contexto).sugestoes ?? []);
  const [rascunho, setRascunho] = useState('');
  const [estado, setEstado] = useState<EstadoVolt>('ocioso');
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [mensagens, estado]);

  const perguntar = (texto: string) => {
    const pergunta = texto.trim();
    if (!pergunta || estado === 'pensando') return;
    setMensagens((m) => [...m, { de: 'motorista', texto: pergunta }]);
    setRascunho('');
    setSugestoes([]);
    setEstado('pensando');
    window.setTimeout(() => {
      const r = responderVolt(pergunta, contexto);
      setMensagens((m) => [...m, { de: 'volt', texto: r.texto }]);
      setSugestoes(r.sugestoes ?? []);
      setEstado('falando');
      window.setTimeout(() => setEstado('ocioso'), 1400);
    }, 620);
  };

  return (
    <div className="mv-chat">
      <header className="mv-chat-topo">
        <Volt estado={estado} tamanho={62} />
        <div>
          <div className="mv-chat-nome">Volt</div>
          <div className="mv-chat-estado">
            {estado === 'pensando' ? 'consultando sua recarga…' : `assistente · ${ponto.nome}`}
          </div>
        </div>
      </header>

      <div className="tt-mensagens mv-chat-msgs">
        {mensagens.map((m, i) => (
          <div key={i} className={`tt-balao ${m.de}`}>{m.texto}</div>
        ))}
        {estado === 'pensando' && (
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
    </div>
  );
}
