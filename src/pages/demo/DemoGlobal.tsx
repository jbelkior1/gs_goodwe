import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../data/supabase';
import { useApp } from '../../app/estado';
import { traduzirErro } from '../entrar/regras';
import { CONTAS_DEMO, DEMO, EMBUTIDO, SENHA_DEMO, definirGuia, ehContaDemo, type ContaDemo } from './ambienteDemo';
import './demo.css';

/**
 * Efeitos da demonstração que valem em qualquer rota (montado uma vez, em App):
 *  - ?conta=goodwe|franqueado|motorista|comerciante entra sozinho com a conta de demonstração e tira o
 *    parâmetro do endereço, mantendo o resto. Só no modo demonstração e nunca dentro do Palco (o iframe
 *    divide o login do navegador, então trocar a conta ali trocaria a de todas as telas);
 *  - ?guia=1 liga o guia didático e guarda a escolha; ?guia=0 desliga.
 */

/** uma entrada por conta de cada vez: o StrictMode roda o efeito duas vezes e não pode logar duas vezes */
const emAndamento = new Map<ContaDemo, Promise<string>>();

/** site publicado: a senha demo não vai no código da página; o link leva à tela de entrada com o e-mail preenchido */
const SEM_SENHA = 'sem-senha-demo';

/** Entra com a conta (se ainda não estiver nela) e devolve o id do usuário. */
function entrarComConta(conta: ContaDemo): Promise<string> {
  const atual = emAndamento.get(conta);
  if (atual) return atual;
  const p = (async () => {
    if (!supabase) throw new Error('Banco não configurado neste ambiente.');
    const { email } = CONTAS_DEMO[conta];
    const { data: sessao } = await supabase.auth.getSession();
    if (sessao.session?.user.email?.toLowerCase() === email) return sessao.session.user.id;
    if (!SENHA_DEMO) throw new Error(SEM_SENHA);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: SENHA_DEMO });
    if (error) throw new Error(traduzirErro(error));
    return data.user.id;
  })().finally(() => { emAndamento.delete(conta); });
  emAndamento.set(conta, p);
  return p;
}

const MSG_CONTA_INVALIDA = 'Esta conta de demonstração não existe. Use goodwe, franqueado, motorista ou comerciante.';

export function DemoGlobal() {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const { perfil } = useApp();
  /** falha da entrada, presa à conta pedida (some quando o pedido muda) */
  const [falha, setFalha] = useState<{ conta: string; mensagem: string } | null>(null);
  /** usuário que entrou: o perfil dele precisa chegar antes de liberar a tela (evita um piscar de "entre com a conta") */
  const [entrou, setEntrou] = useState<{ conta: string; uid: string } | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const parametros = new URLSearchParams(search);
  const contaPedida = DEMO && !EMBUTIDO ? parametros.get('conta') : null;
  const guiaPedido = DEMO && !EMBUTIDO ? parametros.get('guia') : null;
  const contaValida = contaPedida && ehContaDemo(contaPedida) && supabase ? contaPedida : null;

  // ?guia=1 / ?guia=0
  useEffect(() => {
    if (guiaPedido === '1') definirGuia(true);
    else if (guiaPedido === '0') definirGuia(false);
  }, [guiaPedido]);

  /** o endereço sem o ?conta=, com o resto como estava */
  const tirarConta = useCallback(() => {
    const p = new URLSearchParams(window.location.search);
    p.delete('conta');
    const resto = p.toString();
    navigate({ pathname, search: resto ? `?${resto}` : '', hash }, { replace: true });
  }, [navigate, pathname, hash]);

  // pedido sem banco: não há como entrar, só limpa o endereço
  const semBanco = !!contaPedida && ehContaDemo(contaPedida) && !supabase;
  useEffect(() => { if (semBanco) tirarConta(); }, [semBanco, tirarConta]);

  useEffect(() => {
    if (!contaValida) return;
    let vivo = true;
    entrarComConta(contaValida)
      .then((uid) => { if (vivo) setEntrou({ conta: contaValida, uid }); })
      .catch((e: Error) => {
        if (!vivo) return;
        if (e.message !== SEM_SENHA) { setFalha({ conta: contaValida, mensagem: e.message }); return; }
        // entra uma vez com a senha e volta para este mesmo endereço; dali em diante o link entra sozinho
        const p = new URLSearchParams(window.location.search);
        p.delete('conta');
        const resto = p.toString();
        const volta = window.location.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ''), '') + (resto ? `?${resto}` : '');
        navigate(`/entrar?volta=${encodeURIComponent(volta || '/')}&email=${encodeURIComponent(CONTAS_DEMO[contaValida].email)}`, { replace: true });
      });
    return () => { vivo = false; };
  }, [contaValida, tentativa, navigate]);

  // entrou: espera o perfil da conta chegar (no máximo 6 s) e só então limpa o endereço, o que libera a tela
  const uidEsperado = entrou && entrou.conta === contaValida ? entrou.uid : null;
  const perfilPronto = !!uidEsperado && perfil?.id === uidEsperado;
  useEffect(() => {
    if (!uidEsperado) return;
    if (perfilPronto) { tirarConta(); return; }
    const id = window.setTimeout(tirarConta, 6000);
    return () => window.clearTimeout(id);
  }, [uidEsperado, perfilPronto, tirarConta]);

  // o que a tela mostra por cima: a falha (conta desconhecida ou login recusado) ou "entrando…"
  const mensagem = contaPedida && !ehContaDemo(contaPedida)
    ? MSG_CONTA_INVALIDA
    : falha && falha.conta === contaPedida ? falha.mensagem : null;
  if (!mensagem && !contaValida) return null;

  const nome = contaPedida && ehContaDemo(contaPedida) ? CONTAS_DEMO[contaPedida].nome : contaPedida;
  const volta = (() => {
    const p = new URLSearchParams(search);
    p.delete('conta');
    const resto = p.toString();
    return pathname + (resto ? `?${resto}` : '');
  })();
  return (
    <div className="dg-fundo" role="alertdialog" aria-live="assertive" aria-label="Entrando com a conta de demonstração">
      <div className="dg-caixa">
        {!mensagem ? (
          <div className="row" style={{ gap: 12 }}>
            <span className="dg-giro" aria-hidden="true" />
            <div>
              <div className="dg-titulo">Entrando como {nome}…</div>
              <div className="tiny muted">Conta de demonstração</div>
            </div>
          </div>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            <div className="note">
              <div className="note-titulo">Não foi possível entrar como {nome}</div>
              {mensagem}
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              {contaValida && (
                <button type="button" className="btn primary" onClick={() => { setFalha(null); setTentativa((n) => n + 1); }}>
                  Tentar de novo
                </button>
              )}
              <Link className="btn" to={`/entrar?volta=${encodeURIComponent(volta)}`}>Ir para a tela de entrada</Link>
              <button type="button" className="btn" onClick={tirarConta}>Continuar sem entrar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
