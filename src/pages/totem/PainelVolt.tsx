import { useEffect, useRef, useState } from 'react';
import { perguntasDaFase, responderVolt, saudacaoVolt, type ContextoVolt } from '../../domain/engine/assistente';
import { Volt, type EstadoVolt } from '../../ui/Volt';
import { Ic } from './icones';

interface Mensagem { de: 'volt' | 'motorista'; texto: string }

/**
 * Painel do Volt no totem: sobe de baixo (vertical) ou entra pela lateral (horizontal). Só tem
 * perguntas da fase para tocar, sem campo de texto. O Totem remonta este componente quando a fase
 * ou a sessão mudam (key), então a conversa nasce zerada e a saudação é refeita com o contexto novo.
 */
export function PainelVolt({ contexto, aoFechar }: { contexto: ContextoVolt; aoFechar: () => void }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [estado, setEstado] = useState<EstadoVolt>('ocioso');
  const lista = useRef<HTMLDivElement>(null);
  const ultimoContexto = useRef(contexto);
  const timers = useRef<number[]>([]);

  useEffect(() => { ultimoContexto.current = contexto; });
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  // rola só a lista de mensagens: scrollIntoView empurraria os ancestrais e deslocaria o palco
  useEffect(() => { const el = lista.current; if (el) el.scrollTop = el.scrollHeight; }, [mensagens, estado]);

  const perguntar = (texto: string) => {
    if (estado === 'pensando') return;
    setMensagens((m) => [...m, { de: 'motorista', texto }]);
    setEstado('pensando');
    timers.current.push(window.setTimeout(() => {
      // responde com o que o sistema sabe agora, não com o que sabia ao abrir
      const r = responderVolt(texto, ultimoContexto.current);
      setMensagens((m) => [...m, { de: 'volt', texto: r.texto }]);
      setEstado('falando');
      timers.current.push(window.setTimeout(() => setEstado('ocioso'), 1400));
    }, 620));
  };

  const feitas = new Set(mensagens.filter((m) => m.de === 'motorista').map((m) => m.texto));
  const perguntas = perguntasDaFase(contexto.fase);
  const restantes = perguntas.filter((p) => !feitas.has(p));

  return (
    <div className="tk-volt-fundo" onClick={aoFechar}>
      <section className="tk-volt-painel" role="dialog" aria-label="Dúvidas" onClick={(e) => e.stopPropagation()}>
        <header className="tk-volt-topo">
          <Volt estado={estado} tamanho={132} />
          <div className="tk-volt-id">
            <b>Volt</b>
            <span>{estado === 'pensando' ? 'pensando…' : 'Toque numa pergunta'}</span>
          </div>
          <button className="tk-volt-fechar" onClick={aoFechar} aria-label="Fechar"><Ic nome="fechar" tamanho={48} /></button>
        </header>

        <div className="tk-volt-lista" ref={lista}>
          <div className="tk-balao volt">{saudacaoVolt(contexto).texto}</div>
          {mensagens.map((m, i) => <div key={i} className={`tk-balao ${m.de}`}>{m.texto}</div>)}
          {estado === 'pensando' && <div className="tk-balao volt digitando"><span /><span /><span /></div>}
        </div>

        <div className="tk-volt-perguntas">
          {restantes.length > 0 ? restantes.map((p) => (
            <button key={p} className="tk-pergunta" disabled={estado === 'pensando'} onClick={() => perguntar(p)}>{p}</button>
          )) : <p className="tk-nota">Mais alguma dúvida? Chame um atendente da loja.</p>}
        </div>
      </section>
    </div>
  );
}
