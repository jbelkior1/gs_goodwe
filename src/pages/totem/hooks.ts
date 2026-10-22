import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { bancoConfigurado } from '../../data/supabase';
import {
  guardarPonto, lerIdDoTotem, lerPontoGuardado, ouvirTotem, registrarTotem, sinalDoTotem, TabelaAusente,
} from '../../data/totens';
import { aoMudarBase, sessoesDoPonto } from '../../domain/db';
import { foiExpiradaPorTempo } from '../../domain/engine/totem';
import type { Sessao } from '../../domain/types';
import { pontoPadrao } from '../demo/ambienteDemo';

const DEMO = import.meta.env.VITE_MODO_DEMO === 'true';

/** relógio do totem: um tique por segundo (a contagem do código e a hora dependem dele) */
export function useAgora(): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return agora;
}

/** o navegador sabe se a rede caiu antes do tempo real perceber */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const ligar = () => setOnline(true);
    const desligar = () => setOnline(false);
    window.addEventListener('online', ligar);
    window.addEventListener('offline', desligar);
    return () => { window.removeEventListener('online', ligar); window.removeEventListener('offline', desligar); };
  }, []);
  return online;
}

export type EstadoPonto =
  | { fase: 'pronto'; pontoId: string }
  | { fase: 'pareando'; codigo: string | null; erro?: string };

/**
 * Qual ponto este totem mostra (passos 3 e 4 do fluxograma):
 *   1. ?ponto= na URL (link antigo do Meu ponto): usa e guarda no aparelho;
 *   2. ponto guardado no aparelho (pontow.totem.ponto);
 *   3. senão, o aparelho se registra e mostra o código de 6 dígitos até o franqueado parear.
 * A vitrine (aparelho = false) segue o ponto do painel. Sem a tabela "totens" (migration pendente)
 * ou sem banco, o aparelho cai no comportamento antigo: usa o ponto do painel.
 */
export function usePontoDoTotem(aparelho: boolean, pontoDoPainel: string): EstadoPonto {
  const [params] = useSearchParams();
  // na demonstração o totem já nasce no ponto da apresentação: sem código para parear.
  // ?parear=1 mostra o pareamento de verdade (passo 4 do fluxograma)
  const parear = params.get('parear') === '1';
  const daUrl = params.get('ponto');
  const [guardado, setGuardado] = useState<string | null>(() => {
    if (!aparelho) return null;
    if (daUrl) return daUrl;
    if (parear) return null;
    return lerPontoGuardado() ?? (DEMO ? pontoPadrao() || null : null);
  });
  const [registro, setRegistro] = useState<{ codigo: string | null; erro?: string; semTabela?: boolean } | null>(null);
  const fixo = aparelho ? (daUrl ?? guardado) : (daUrl ?? pontoDoPainel);

  // o link com ?ponto= vale uma vez e o aparelho lembra
  useEffect(() => { if (aparelho && daUrl) guardarPonto(daUrl); }, [aparelho, daUrl]);

  useEffect(() => {
    if (!aparelho || fixo || !bancoConfigurado) return;
    let vivo = true;
    let parar = () => {};
    let religar = 0;
    const iniciar = () => {
      registrarTotem()
        .then((r) => {
          if (!vivo) return;
          if (r.pontoId) { guardarPonto(r.pontoId); setGuardado(r.pontoId); return; }
          setRegistro({ codigo: r.codigo });
          parar = ouvirTotem(r.id, (pontoId) => { guardarPonto(pontoId); setGuardado(pontoId); },
            () => { parar(); iniciar(); });
        })
        .catch((e: Error) => {
          if (!vivo) return;
          if (e instanceof TabelaAusente) { setRegistro({ codigo: null, semTabela: true }); return; }
          setRegistro({ codigo: null, erro: `Sem conexão para gerar o código. Tentando de novo... (${e.message})` });
          religar = window.setTimeout(iniciar, 5000);
        });
    };
    iniciar();
    return () => { vivo = false; parar(); window.clearTimeout(religar); };
  }, [aparelho, fixo]);

  // totem pareado avisa que está vivo (aparece como último sinal no painel do comércio)
  useEffect(() => {
    if (!aparelho || !fixo || !bancoConfigurado) return;
    const id = lerIdDoTotem();
    if (!id) return;
    sinalDoTotem(id).catch(() => {});
    const t = window.setInterval(() => { sinalDoTotem(id).catch(() => {}); }, 60_000);
    return () => window.clearInterval(t);
  }, [aparelho, fixo]);

  if (fixo) return { fase: 'pronto', pontoId: fixo };
  if (!aparelho || !bancoConfigurado || registro?.semTabela) return { fase: 'pronto', pontoId: pontoDoPainel };
  return { fase: 'pareando', codigo: registro?.codigo ?? null, erro: registro?.erro };
}

/**
 * O banco não diz quando uma sessão virou EXPIRADA, e cabo removido também expira. Então o totem
 * observa a virada ABERTA → EXPIRADA a cada mudança da base e só conta como "código expirou" se foi
 * por tempo. Devolve, por vaga, a expiração que acabou de ver (a tela T8 dura 60 s).
 */
export function useExpiradas(pontoId: string): Record<string, { sessaoId: string; em: number }> {
  const vistas = useRef(new Map<string, string>());
  const [expiradas, setExpiradas] = useState<Record<string, { sessaoId: string; em: number }>>({});
  useEffect(() => {
    const checar = () => {
      const agora = Date.now();
      const ultimas = new Map<string, Sessao>();
      for (const s of sessoesDoPonto(pontoId)) {
        const a = ultimas.get(s.carregadorId);
        if (!a || s.inicio > a.inicio) ultimas.set(s.carregadorId, s);
      }
      const novas: Record<string, { sessaoId: string; em: number }> = {};
      for (const s of ultimas.values()) {
        if (vistas.current.get(s.id) === 'ABERTA' && s.estado === 'EXPIRADA' && foiExpiradaPorTempo(s, agora)) {
          novas[s.carregadorId] = { sessaoId: s.id, em: agora };
        }
        vistas.current.set(s.id, s.estado);
      }
      if (Object.keys(novas).length) setExpiradas((e) => ({ ...e, ...novas }));
    };
    checar();
    return aoMudarBase(checar);
  }, [pontoId]);
  return expiradas;
}
