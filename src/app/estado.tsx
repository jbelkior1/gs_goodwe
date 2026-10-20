import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { aoMudarBase, base } from '../domain/db';
import { supabase } from '../data/supabase';
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

export function ProvedorEstado({ children }: { children: ReactNode }) {
  const [persona, setPersona] = useState<Persona>('franqueado');
  const [pontoId, setPontoId] = useState<string>(() => {
    const ativos = base.pontos.filter((p) => p.ativo);
    return (ativos[13] ?? ativos[0] ?? base.pontos[0])?.id ?? '';
  });
  const [motoristaId, setMotoristaId] = useState<string>(base.motoristas[0]?.id ?? '');
  const [tick, setTick] = useState(0);
  const [perfil, setPerfil] = useState<Perfil | null>(null);

  useEffect(() => aoMudarBase(() => setTick((t) => t + 1)), []);

  useEffect(() => {
    if (!supabase) return;
    const carregar = async (uid?: string) => {
      if (!uid) { setPerfil(null); return; }
      const { data } = await supabase!.from('perfis').select('*').eq('id', uid).maybeSingle();
      setPerfil((data as Perfil) ?? null);
    };
    supabase.auth.getSession().then(({ data }) => carregar(data.session?.user.id));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { carregar(s?.user.id); });
    return () => data.subscription.unsubscribe();
  }, []);

  // perfil logado define o motorista e o ponto do franqueado
  useEffect(() => {
    if (perfil?.motoristaId) setMotoristaId(perfil.motoristaId);
    if (perfil?.papel === 'franqueado' && perfil.franqueadoId) {
      const meu = base.pontos.find((p) => p.franqueadoId === perfil.franqueadoId);
      if (meu) setPontoId(meu.id);
    }
  }, [perfil, tick]);

  const valor = useMemo(
    () => ({
      persona, setPersona, pontoId, setPontoId, motoristaId, setMotoristaId, tick, perfil,
      sair: async () => { await supabase?.auth.signOut(); setPerfil(null); },
    }),
    [persona, pontoId, motoristaId, tick, perfil],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useApp(): EstadoApp {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp precisa estar dentro de <ProvedorEstado>');
  return ctx;
}
