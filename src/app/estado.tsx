import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { aoMudarBase, base } from '../domain/db';
import { supabase } from '../data/supabase';
import { CONTAS_DEMO, EMBUTIDO, pontoPadrao } from '../pages/demo/ambienteDemo';
import type { Perfil } from '../domain/types';

/** Os quatro inquilinos da plataforma — cada um com seu endereço próprio. */
export type Persona = 'motorista' | 'totem' | 'franqueado' | 'goodwe';

interface EstadoApp {
  persona: Persona;
  setPersona: (p: Persona) => void;
  /** ponto que o franqueado está operando */
  pontoId: string;
  setPontoId: (id: string) => void;
  /** motorista "logado" no app (perfil logado; sem login, o primeiro da base) */
  motoristaId: string;
  setMotoristaId: (id: string) => void;
  /** muda a cada atualização do banco em tempo real: faz as telas recalcularem */
  tick: number;
  /** usuário logado (null = ninguém) */
  perfil: Perfil | null;
  sair: () => Promise<void>;
}

const Ctx = createContext<EstadoApp | null>(null);

/** ?ponto=<id> do endereço, quando é um ponto que existe na base */
function pontoDoEndereco(search: string): string | null {
  const id = new URLSearchParams(search).get('ponto');
  return id && base.pontos.some((p) => p.id === id) ? id : null;
}

/** Rotas em que ?ponto= escolhe o ponto do painel (o totem trata o próprio ?ponto=). */
const ROTA_COM_PONTO = /^\/(franqueado|goodwe|motorista)(\/|$)/;

export function ProvedorEstado({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  const [persona, setPersona] = useState<Persona>('franqueado');
  const [pontoId, setPontoId] = useState<string>(() => pontoDoEndereco(window.location.search) ?? pontoPadrao());
  const [motoristaId, setMotoristaId] = useState<string>(base.motoristas[0]?.id ?? '');
  const [tick, setTick] = useState(0);
  const [perfil, setPerfil] = useState<Perfil | null>(null);

  useEffect(() => aoMudarBase(() => setTick((t) => t + 1)), []);

  useEffect(() => {
    if (!supabase) return;
    // a aprovação da GoodWe troca o papel de quem está logado: o app acompanha sem recarregar
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let canalUid = '';
    const ouvir = (uid?: string) => {
      if ((uid ?? '') === canalUid) return;
      if (canal) supabase!.removeChannel(canal);
      canal = null; canalUid = uid ?? '';
      if (!uid) return;
      canal = supabase!.channel(`perfil-${uid}-${crypto.randomUUID().slice(0, 8)}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'perfis', filter: `id=eq.${uid}` },
          (p) => setPerfil(p.new as Perfil))
        .subscribe();
    };
    const carregar = async (uid?: string) => {
      ouvir(uid);
      if (!uid) { setPerfil(null); return; }
      const { data } = await supabase!.from('perfis').select('*').eq('id', uid).maybeSingle();
      setPerfil((data as Perfil) ?? null);
    };
    supabase.auth.getSession().then(({ data }) => carregar(data.session?.user.id));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { carregar(s?.user.id); });
    return () => { data.subscription.unsubscribe(); if (canal) supabase!.removeChannel(canal); };
  }, []);

  // Palco da central: o celular embutido mostra o app de um motorista, não importa quem está logado no navegador
  const perfilExposto = EMBUTIDO && pathname.startsWith('/motorista') && perfil?.papel !== 'motorista' ? null : perfil;

  // perfil logado define o motorista e o ponto do franqueado; ponto removido volta para o padrão.
  // O franqueado só opera os pontos dele: o que ele já escolheu entre os dele (select ou ?ponto=) fica.
  useEffect(() => {
    if (perfilExposto?.motoristaId) setMotoristaId(perfilExposto.motoristaId);
    const meus = perfil?.papel === 'franqueado' && perfil.franqueadoId && !EMBUTIDO
      ? base.pontos.filter((p) => p.franqueadoId === perfil.franqueadoId) : [];
    if (meus.length) setPontoId((atual) => (meus.some((p) => p.id === atual) ? atual : meus[0].id));
    else setPontoId((atual) => (base.pontos.some((p) => p.id === atual) ? atual : pontoPadrao()));
  }, [perfil, perfilExposto, tick]);

  // celular embutido sem login de motorista: segue quem está carregando no ponto; sem recarga, o motorista de demonstração
  useEffect(() => {
    if (!EMBUTIDO || perfilExposto?.motoristaId) return;
    const viva = base.sessoes
      .filter((s) => s.pontoId === pontoId && s.motoristaId
        && ['AUTENTICADO', 'CARREGANDO', 'PAUSADO', 'ENCERRANDO', 'CONCLUIDO'].includes(s.estado))
      .sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
    const demo = base.motoristas.find((m) => m.email === CONTAS_DEMO.motorista.email);
    const alvo = viva?.motoristaId ?? demo?.id;
    if (alvo) setMotoristaId(alvo);
  }, [perfilExposto, pontoId, tick]);

  // ?ponto=<id> nas rotas do franqueado, da GoodWe e do motorista escolhe o ponto do painel.
  // O franqueado logado só aceita os pontos dele (no Palco, que é só leitura, qualquer ponto vale).
  const idDoEndereco = new URLSearchParams(search).get('ponto');
  const rotaComPonto = ROTA_COM_PONTO.test(pathname);
  useEffect(() => {
    if (!rotaComPonto || !idDoEndereco) return;
    const alvo = base.pontos.find((p) => p.id === idDoEndereco);
    if (!alvo) return;
    const alheio = perfil?.papel === 'franqueado' && !EMBUTIDO && perfil.franqueadoId !== alvo.franqueadoId;
    if (!alheio) setPontoId(alvo.id);
  }, [rotaComPonto, idDoEndereco, perfil]);

  const valor = useMemo(
    () => ({
      persona, setPersona, pontoId, setPontoId, motoristaId, setMotoristaId, tick, perfil: perfilExposto,
      sair: async () => { await supabase?.auth.signOut(); setPerfil(null); },
    }),
    [persona, pontoId, motoristaId, tick, perfilExposto],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useApp(): EstadoApp {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp precisa estar dentro de <ProvedorEstado>');
  return ctx;
}
