import { useEffect, useState } from 'react';
import { useApp } from '../app/estado';
import { sessaoDoMotorista } from '../domain/db';
import { useGuiaVisivel } from '../pages/demo/ambienteDemo';
import { falaDoGuia, PASSOS, situacaoDaDemo, type Ambiente } from '../pages/demo/fluxo';
import './GuiaDemo.css';

/**
 * Guia didático da demonstração: uma faixa fina que diz em qual passo do fluxograma o produto está
 * e o que fazer agora naquele aparelho. O passo sai da base ao vivo (pages/demo/fluxo.ts).
 *
 * Aparece só no modo demonstração, com o guia ligado (?guia=1 liga e lembra; ?guia=0 desliga; ou o
 * interruptor da central /demo) e nunca dentro do Palco.
 *
 * posicao "fluxo": ocupa o seu lugar na página (celular e painéis), sem cobrir nada.
 * posicao "topo-fixo": faixa sobre o topo da tela, só informativa (não recebe toque); o totem em
 * tela cheia desce o quiosque pela altura dela (veja GuiaDemo.css).
 */
export function GuiaDemo({
  ambiente, pontoId, semPonto = false, posicao = 'fluxo',
}: {
  ambiente: Ambiente;
  /** ponto acompanhado; sem ele, o do app */
  pontoId?: string;
  /** totem que ainda não foi pareado */
  semPonto?: boolean;
  posicao?: 'fluxo' | 'topo-fixo';
}) {
  const visivel = useGuiaVisivel();
  const { pontoId: pontoDoApp, motoristaId, perfil } = useApp();

  // o relógio entra na conta (janelas de "acabou de pagar" e validade do código vencem sem evento do banco)
  const [, setRelogio] = useState(0);
  useEffect(() => {
    if (!visivel) return;
    const id = window.setInterval(() => setRelogio((n) => n + 1), 10_000);
    return () => window.clearInterval(id);
  }, [visivel]);

  // o totem fora da vitrine reserva o lugar da faixa no topo
  useEffect(() => {
    if (!visivel || posicao !== 'topo-fixo') return;
    document.documentElement.classList.add('guia-totem');
    return () => document.documentElement.classList.remove('guia-totem');
  }, [visivel, posicao]);

  if (!visivel) return null;

  // o celular acompanha a recarga do próprio motorista, esteja ela onde estiver
  const minha = ambiente === 'motorista' ? sessaoDoMotorista(perfil?.motoristaId ?? motoristaId) : undefined;
  const alvo = minha?.pontoId ?? pontoId ?? pontoDoApp;
  const situacao = situacaoDaDemo(alvo);
  const fala = falaDoGuia(ambiente, situacao, semPonto);

  return (
    <div className={`guia guia-${posicao} guia-${ambiente}`} role="status" aria-live="polite" data-passo={fala.passo}>
      <span className="guia-passo">Passo {fala.passo}</span>
      <span className="guia-sep" aria-hidden="true">·</span>
      <span className="guia-texto">{fala.texto}</span>
      <ol className="guia-trilha" aria-label={`Passo ${fala.passo} de ${PASSOS.length}`}>
        {PASSOS.map((p) => (
          <li key={p.n} className={p.n < fala.passo ? 'feito' : p.n === fala.passo ? 'atual' : ''} title={`${p.n}. ${p.titulo}`} />
        ))}
      </ol>
    </div>
  );
}
