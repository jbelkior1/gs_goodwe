import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { base } from '../domain/db';

export type Persona = 'motorista' | 'lojista' | 'rede';

interface EstadoApp {
  persona: Persona;
  setPersona: (p: Persona) => void;
  /** ponto que o lojista está operando */
  pontoId: string;
  setPontoId: (id: string) => void;
  /** motorista "logado" no app */
  motoristaId: string;
  setMotoristaId: (id: string) => void;
  /** relógio compartilhado: avança sozinho e faz a interface parecer viva */
  tick: number;
}

const Ctx = createContext<EstadoApp | null>(null);

export function ProvedorEstado({ children }: { children: ReactNode }) {
  const [persona, setPersona] = useState<Persona>('lojista');
  // começa no ponto com mais movimento, para a demo abrir cheia de dados
  const [pontoId, setPontoId] = useState<string>(() => {
    const ativos = base.pontos.filter((p) => p.ativo);
    return (ativos[13] ?? ativos[0] ?? base.pontos[0]).id;
  });
  const [motoristaId, setMotoristaId] = useState<string>(base.motoristas[0].id);
  const [tick] = useState(0);

  const valor = useMemo(
    () => ({ persona, setPersona, pontoId, setPontoId, motoristaId, setMotoristaId, tick }),
    [persona, pontoId, motoristaId, tick],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useApp(): EstadoApp {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp precisa estar dentro de <ProvedorEstado>');
  return ctx;
}
