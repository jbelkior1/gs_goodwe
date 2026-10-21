import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../data/supabase';
import { useApp } from '../../app/estado';
import { VEICULOS } from '../../domain/catalogo';

const DEMO = import.meta.env.VITE_MODO_DEMO === 'true';
const SENHA_DEMO = (import.meta.env.VITE_DEMO_SENHA as string | undefined) ?? '';
const CONTAS_DEMO = [
  { papel: 'GoodWe', email: 'goodwe@pontow.app', vai: '/goodwe' },
  { papel: 'Franqueado', email: 'franqueado@pontow.app', vai: '/franqueado' },
  { papel: 'Motorista', email: 'motorista@pontow.app', vai: '/motorista' },
  { papel: 'Comerciante (pedir franquia)', email: 'comerciante@pontow.app', vai: '/seja-goodwe' },
];

export default function Entrar() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const destino = params.get('volta') ?? '';
  const { perfil, sair } = useApp();
  const [modo, setModo] = useState<'entrar' | 'cadastro'>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [veiculoId, setVeiculoId] = useState('v-dolphin');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  if (!supabase) return <div className="card" style={{ margin: 24 }}>Banco não configurado: o login precisa do Supabase (.env.local).</div>;

  const entrar = async (e?: string, s?: string, vai?: string) => {
    setErro(''); setOcupado(true);
    const { error } = await supabase!.auth.signInWithPassword({ email: e ?? email, password: s ?? senha });
    setOcupado(false);
    if (error) { setErro('E-mail ou senha incorretos.'); return; }
    nav(destino || vai || '/');
  };

  const cadastrar = async () => {
    setErro(''); setOcupado(true);
    const { error } = await supabase!.auth.signUp({ email, password: senha, options: { data: { nome, veiculoId } } });
    setOcupado(false);
    if (error) { setErro(error.message); return; }
    nav(destino || '/motorista');
  };

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 16, background: 'var(--k-bg)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 380 }}>
        <div className="stack">
          <div>
            <div className="kpi-label">Ponto W · GoodWe</div>
            <h2 style={{ margin: '4px 0 0' }}>{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</h2>
          </div>
          {perfil && (
            <div className="tiny muted">
              Você está como <b>{perfil.nome}</b> ({perfil.papel}).{' '}
              <button className="btn" onClick={() => sair()}>Sair</button>
            </div>
          )}
          {modo === 'cadastro' && (
            <>
              <input id="nome" className="btn" placeholder="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)} />
              <select id="veiculo" className="btn" value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
                {VEICULOS.map((v) => <option key={v.id} value={v.id}>{v.montadora} {v.modelo}</option>)}
              </select>
            </>
          )}
          <input id="email" className="btn" type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input id="senha" className="btn" type="password" placeholder="Senha (mín. 6)" value={senha} onChange={(e) => setSenha(e.target.value)} />
          {erro && <div className="tiny" style={{ color: 'var(--k-red2)' }}>{erro}</div>}
          <button className="btn primary" disabled={ocupado} style={{ justifyContent: 'center' }}
                  onClick={() => (modo === 'entrar' ? entrar() : cadastrar())}>
            {ocupado ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
          <button className="btn" style={{ justifyContent: 'center' }} onClick={() => setModo(modo === 'entrar' ? 'cadastro' : 'entrar')}>
            {modo === 'entrar' ? 'Não tenho conta' : 'Já tenho conta'}
          </button>
          {DEMO && SENHA_DEMO && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="kpi-label">Contas de demonstração</div>
              {CONTAS_DEMO.map((c) => (
                <button key={c.email} className="btn" style={{ justifyContent: 'center' }}
                        onClick={() => entrar(c.email, SENHA_DEMO, c.vai)}>
                  Entrar como {c.papel}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
