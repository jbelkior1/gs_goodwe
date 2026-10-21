import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../data/supabase';
import { useApp } from '../../app/estado';
import { VEICULOS } from '../../domain/catalogo';
import type { Papel } from '../../domain/types';
import { Icone } from '../../ui/icones';
import {
  DESTINO_PAPEL, DESTINO_TIPO, SENHA_MIN, codigoDoErro, destinoSeguro, traduzirErro, validarCampos,
  type CampoEntrada, type Modo, type Tipo,
} from './regras';
import './Entrar.css';

const DEMO = import.meta.env.VITE_MODO_DEMO === 'true';
const SENHA_DEMO = (import.meta.env.VITE_DEMO_SENHA as string | undefined) ?? '';
const CONTAS_DEMO = [
  { papel: 'GoodWe', desc: 'Aprova franquias, vê royalties e a rede', email: 'goodwe@pontow.app', vai: '/goodwe' },
  { papel: 'Franqueado', desc: 'Dono do ponto: preço, demanda e extrato', email: 'franqueado@pontow.app', vai: '/franqueado' },
  { papel: 'Motorista', desc: 'Acha o ponto e recarrega o carro', email: 'motorista@pontow.app', vai: '/motorista' },
  { papel: 'Comerciante', desc: 'Ainda sem ponto: pede a franquia', email: 'comerciante@pontow.app', vai: '/seja-goodwe' },
];

/** Conta criada (ou login) com o e-mail ainda sem confirmação: o app não segue até confirmar. */
interface Pendente { email: string; motivo: 'criada' | 'entrar' }
type Ocupado = '' | 'form' | 'reenviar' | `demo:${string}`;

export default function Entrar() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const volta = destinoSeguro(params.get('volta'));
  const { perfil, sair } = useApp();

  const [modo, setModo] = useState<Modo>(params.get('modo') === 'cadastro' ? 'cadastro' : 'entrar');
  const [tipo, setTipo] = useState<Tipo>(params.get('tipo') === 'comercio' || volta.startsWith('/seja-goodwe') ? 'comercio' : 'motorista');
  const [nome, setNome] = useState('');
  const [veiculoId, setVeiculoId] = useState(VEICULOS[0].id);
  // ?email= vem do link de demonstração no site publicado (lá a senha não fica no código da página)
  const [email, setEmail] = useState(() => params.get('email') ?? '');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [campoErro, setCampoErro] = useState<CampoEntrada | ''>('');
  const [ocupado, setOcupado] = useState<Ocupado>('');
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [reenvio, setReenvio] = useState('');
  const aviso = useRef<HTMLDivElement>(null);

  // o aviso de erro entra na leitura de quem usa leitor de tela e fica à vista no celular
  useEffect(() => { if (erro) aviso.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [erro]);

  if (!supabase) {
    return (
      <main className="ent">
        <div className="card ent-cartao">Banco não configurado: o login precisa do Supabase (.env.local).</div>
      </main>
    );
  }
  const sb = supabase;

  const falhar = (mensagem: string, campo: CampoEntrada | '' = '') => {
    setErro(mensagem); setCampoErro(campo);
    if (campo) document.getElementById(`ent-${campo}`)?.focus();
  };

  /**
   * Sem ?volta=, quem entra vai para a tela do seu papel (lido do perfil). Quem criou conta de comércio
   * e ainda não virou franqueado (o perfil segue como motorista) volta para o pedido de franquia.
   */
  const destinoDoPapel = async (uid: string, tipoDaConta?: unknown): Promise<string> => {
    try {
      const { data } = await sb.from('perfis').select('papel').eq('id', uid).maybeSingle();
      const papel = (data as { papel?: Papel } | null)?.papel ?? 'motorista';
      if (papel === 'motorista' && tipoDaConta === 'comercio') return DESTINO_TIPO.comercio;
      return DESTINO_PAPEL[papel] ?? '/';
    } catch { return '/'; }
  };

  const entrar = async (e: string, s: string, vai?: string) => {
    const { data, error } = await sb.auth.signInWithPassword({ email: e, password: s });
    if (error) {
      if (codigoDoErro(error) === 'email_not_confirmed') { setPendente({ email: e, motivo: 'entrar' }); setReenvio(''); return; }
      falhar(traduzirErro(error));
      return;
    }
    nav(volta || vai || await destinoDoPapel(data.user.id, data.user.user_metadata?.tipo));
  };

  const cadastrar = async () => {
    const dados = tipo === 'motorista' ? { nome: nome.trim(), veiculoId } : { nome: nome.trim(), tipo: 'comercio' };
    const { data, error } = await sb.auth.signUp({ email: email.trim(), password: senha, options: { data: dados } });
    if (error) { falhar(traduzirErro(error), ['user_already_exists', 'email_exists'].includes(codigoDoErro(error)) ? 'email' : ''); return; }
    // conta que já existia: o Supabase não acusa erro, mas devolve a pessoa sem identidade nova
    if (data.user && data.user.identities?.length === 0) { falhar(traduzirErro({ code: 'user_already_exists' }), 'email'); return; }
    if (data.session) { nav(volta || DESTINO_TIPO[tipo]); return; }
    // "Confirm email" ainda ligado no painel do Supabase: sem sessão, pede a confirmação
    setPendente({ email: email.trim(), motivo: 'criada' }); setReenvio('');
  };

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (ocupado) return;
    const problema = validarCampos({ modo, nome, email, senha });
    if (problema) { falhar(problema.mensagem, problema.campo); return; }
    setErro(''); setCampoErro(''); setOcupado('form');
    try {
      if (modo === 'entrar') await entrar(email.trim(), senha); else await cadastrar();
    } catch (e) {
      falhar(traduzirErro({ name: (e as Error).name, message: (e as Error).message }));
    } finally { setOcupado(''); }
  };

  const entrarDemo = async (c: (typeof CONTAS_DEMO)[number]) => {
    if (ocupado) return;
    setErro(''); setCampoErro(''); setOcupado(`demo:${c.email}`);
    try { await entrar(c.email, SENHA_DEMO, c.vai); }
    catch (e) { falhar(traduzirErro({ name: (e as Error).name, message: (e as Error).message })); }
    finally { setOcupado(''); }
  };

  const reenviar = async () => {
    if (!pendente || ocupado) return;
    setReenvio(''); setOcupado('reenviar');
    try {
      const { error } = await sb.auth.resend({ type: 'signup', email: pendente.email });
      setReenvio(error ? traduzirErro(error) : 'E-mail reenviado. Confira também a caixa de spam.');
    } catch (e) {
      setReenvio(traduzirErro({ name: (e as Error).name, message: (e as Error).message }));
    } finally { setOcupado(''); }
  };

  const trocarModo = () => {
    setModo(modo === 'entrar' ? 'cadastro' : 'entrar');
    setErro(''); setCampoErro(''); setPendente(null);
  };

  const cadastro = modo === 'cadastro';
  const enviandoForm = ocupado === 'form';

  return (
    <main className="ent">
      <div className="card ent-cartao">
        <div className="ent-topo">
          <span className="brand-logo"><Icone nome="raio" tamanho={15} /></span>
          <span className="ent-marca">Ponto W · GoodWe</span>
          <Link className="ent-voltar" to="/">Início</Link>
        </div>

        <div className="ent-titulo">
          <h1>{pendente ? 'Confirme seu e-mail' : cadastro ? 'Criar conta' : 'Entrar'}</h1>
          {!pendente && (
            <p className="muted">
              {cadastro ? 'Leva menos de um minuto.' : volta.startsWith('/seja-goodwe') ? 'Entre para pedir a sua franquia.' : 'Acesse o app do motorista, o painel do ponto ou a torre de controle.'}
            </p>
          )}
        </div>

        {perfil && !pendente && (
          <div className="note gray ent-sessao">
            <span>Você está como <span className="ent-nome">{perfil.nome}</span> ({perfil.papel}).</span>
            <span className="row" style={{ gap: 8 }}>
              <Link className="btn sm primary" to={volta || DESTINO_PAPEL[perfil.papel]}>Continuar</Link>
              <button type="button" className="btn sm" onClick={() => sair()}>Sair</button>
            </span>
          </div>
        )}

        {pendente ? (
          <div className="stack" style={{ gap: 12 }}>
            <div className="note teal" role="status">
              {pendente.motivo === 'criada' ? 'Conta criada.' : 'Seu e-mail ainda não foi confirmado.'}{' '}
              Confirme o e-mail que enviamos para <span className="ent-nome">{pendente.email}</span> e depois entre.
            </div>
            <button type="button" className="btn ent-cheio" disabled={!!ocupado} aria-busy={ocupado === 'reenviar'} onClick={reenviar}>
              {ocupado === 'reenviar' ? <><span className="ent-giro" aria-hidden="true" />Reenviando…</> : 'Reenviar e-mail'}
            </button>
            {reenvio && <div className="tiny muted" role="status">{reenvio}</div>}
            <button type="button" className="btn primary ent-cheio" onClick={() => { setPendente(null); setModo('entrar'); }}>
              Já confirmei, quero entrar
            </button>
          </div>
        ) : (
          <form className="stack" style={{ gap: 14 }} onSubmit={enviar} noValidate>
            {cadastro && (
              <div className="ent-campo">
                <span className="ent-rotulo" id="ent-tipo-r">Como você vai usar o Ponto W?</span>
                <div className="ent-tipo" role="radiogroup" aria-labelledby="ent-tipo-r">
                  {([['motorista', 'Sou motorista'], ['comercio', 'Tenho um comércio']] as const).map(([valor, rotulo]) => (
                    <label key={valor} className={tipo === valor ? 'on' : ''}>
                      <input type="radio" name="ent-tipo" value={valor} checked={tipo === valor} onChange={() => setTipo(valor)} />
                      {rotulo}
                    </label>
                  ))}
                </div>
                <span className="ent-ajuda">
                  {tipo === 'motorista' ? 'Você acha pontos no mapa e recarrega pelo celular.' : 'Depois de criar a conta, você pede a franquia e acompanha a análise.'}
                </span>
              </div>
            )}

            {cadastro && (
              <div className="ent-campo">
                <label className="ent-rotulo" htmlFor="ent-nome">Nome</label>
                <input id="ent-nome" className="ent-input" value={nome} onChange={(e) => setNome(e.target.value)}
                       autoComplete="name" placeholder="Como você quer ser chamado" aria-invalid={campoErro === 'nome'} />
              </div>
            )}

            {cadastro && tipo === 'motorista' && (
              <div className="ent-campo">
                <label className="ent-rotulo" htmlFor="ent-veiculo">Seu carro elétrico</label>
                <select id="ent-veiculo" className="ent-input" value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
                  {VEICULOS.map((v) => <option key={v.id} value={v.id}>{v.montadora} {v.modelo}</option>)}
                </select>
                <span className="ent-ajuda">Usamos para estimar a bateria e o tempo de recarga. Dá para mudar depois.</span>
              </div>
            )}

            <div className="ent-campo">
              <label className="ent-rotulo" htmlFor="ent-email">E-mail</label>
              <input id="ent-email" className="ent-input" type="email" inputMode="email" value={email}
                     onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" spellCheck={false}
                     placeholder="nome@empresa.com.br" aria-invalid={campoErro === 'email'} />
            </div>

            <div className="ent-campo">
              <label className="ent-rotulo" htmlFor="ent-senha">Senha</label>
              <div className="ent-senha">
                <input id="ent-senha" className="ent-input" type={verSenha ? 'text' : 'password'} value={senha}
                       onChange={(e) => setSenha(e.target.value)} autoComplete={cadastro ? 'new-password' : 'current-password'}
                       placeholder={cadastro ? `Mínimo de ${SENHA_MIN} caracteres` : 'Sua senha'} aria-invalid={campoErro === 'senha'} />
                <button type="button" className="ent-ver" aria-pressed={verSenha} onClick={() => setVerSenha(!verSenha)}>
                  {verSenha ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>

            <div ref={aviso} role="alert" aria-live="assertive">
              {erro && <div className="ent-erro">{erro}</div>}
            </div>

            <button type="submit" className="btn primary ent-cheio" disabled={!!ocupado} aria-busy={enviandoForm}>
              {enviandoForm ? <><span className="ent-giro" aria-hidden="true" />{cadastro ? 'Criando conta…' : 'Entrando…'}</> : cadastro ? 'Criar conta' : 'Entrar'}
            </button>
            <button type="button" className="btn ent-cheio" disabled={!!ocupado} onClick={trocarModo}>
              {cadastro ? 'Já tenho conta' : 'Não tenho conta'}
            </button>
          </form>
        )}

        {DEMO && SENHA_DEMO && !pendente && (
          <section className="ent-demo" aria-labelledby="ent-demo-t">
            <div className="row between">
              <h2 id="ent-demo-t" className="kpi-label">Demonstração</h2>
              <span className="tiny muted">entra sem digitar a senha</span>
            </div>
            {CONTAS_DEMO.map((c) => (
              <button key={c.email} type="button" className="ent-conta" disabled={!!ocupado} aria-busy={ocupado === `demo:${c.email}`}
                      onClick={() => entrarDemo(c)}>
                <b>{ocupado === `demo:${c.email}` ? <span className="ent-giro" aria-hidden="true" /> : null}{c.papel}</b>
                <span>{c.desc}</span>
              </button>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
