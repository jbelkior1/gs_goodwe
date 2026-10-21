/**
 * Regras da tela de entrada, sem React: validação dos campos, tradução dos erros do Supabase Auth
 * para pt-BR e destino depois do login. Fica separado para poder ser testado com tsx.
 */
import type { Papel } from '../../domain/types';

export type Modo = 'entrar' | 'cadastro';
export type Tipo = 'motorista' | 'comercio';
export type CampoEntrada = 'nome' | 'email' | 'senha';

export const SENHA_MIN = 6;

/** Destino padrão de quem entra sem ?volta=, por papel. */
export const DESTINO_PAPEL: Record<Papel, string> = {
  motorista: '/motorista',
  franqueado: '/franqueado',
  goodwe: '/goodwe',
};

/** Destino padrão de quem acabou de criar a conta, por tipo de cadastro. */
export const DESTINO_TIPO: Record<Tipo, string> = {
  motorista: '/motorista',
  comercio: '/seja-goodwe',
};

/** Só aceita caminho interno do app (começa com "/" simples): evita ?volta=https://outro-site. */
export function destinoSeguro(volta: string | null | undefined): string {
  const v = (volta ?? '').trim();
  return /^\/(?![/\\])/.test(v) ? v : '';
}

export const emailValido = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

export interface ErroCampo { campo: CampoEntrada; mensagem: string }

/** Confere os campos antes de chamar o Supabase. Devolve o primeiro problema (ou null). */
export function validarCampos(d: { modo: Modo; nome: string; email: string; senha: string }): ErroCampo | null {
  if (d.modo === 'cadastro' && d.nome.trim().length < 2) {
    return { campo: 'nome', mensagem: 'Informe seu nome.' };
  }
  if (!d.email.trim()) return { campo: 'email', mensagem: 'Digite seu e-mail.' };
  if (!emailValido(d.email)) return { campo: 'email', mensagem: 'Esse e-mail parece incompleto. Exemplo: nome@empresa.com.br' };
  if (!d.senha) return { campo: 'senha', mensagem: 'Digite sua senha.' };
  if (d.modo === 'cadastro' && d.senha.length < SENHA_MIN) {
    return { campo: 'senha', mensagem: `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.` };
  }
  return null;
}

/** O pedaço do erro do Supabase Auth que interessa (AuthError tem estes campos). */
export interface ErroAuth { code?: string; message?: string; status?: number; name?: string }

/** Código do erro; servidores antigos mandam só a mensagem em inglês, então cai no texto. */
export function codigoDoErro(e: ErroAuth): string {
  if (e.code) return e.code;
  if (e.name === 'AuthRetryableFetchError' || e.status === 0) return 'sem_conexao';
  const m = (e.message ?? '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'invalid_credentials';
  if (m.includes('email not confirmed')) return 'email_not_confirmed';
  if (m.includes('already registered')) return 'user_already_exists';
  if (m.includes('password should be at least')) return 'weak_password';
  if (m.includes('rate limit')) return 'over_email_send_rate_limit';
  if (m.includes('failed to fetch') || m.includes('network')) return 'sem_conexao';
  return '';
}

/** Mensagem em pt-BR para o erro do Supabase Auth. */
export function traduzirErro(e: ErroAuth): string {
  switch (codigoDoErro(e)) {
    case 'invalid_credentials': return 'E-mail ou senha incorretos.';
    case 'email_not_confirmed': return 'Seu e-mail ainda não foi confirmado.';
    case 'weak_password': return `Senha fraca. Use pelo menos ${SENHA_MIN} caracteres.`;
    case 'user_already_exists':
    case 'email_exists': return 'Já existe uma conta com este e-mail. Toque em "Já tenho conta" para entrar.';
    case 'over_email_send_rate_limit': return 'Muitos e-mails em pouco tempo. Aguarde alguns minutos e tente de novo.';
    case 'over_request_rate_limit': return 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.';
    case 'email_address_invalid': return 'Este e-mail não é aceito. Confira o endereço.';
    case 'email_address_not_authorized': return 'Este endereço não pode receber e-mails daqui. Use outro e-mail.';
    case 'signup_disabled':
    case 'email_provider_disabled': return 'O cadastro por e-mail está desativado neste ambiente.';
    case 'validation_failed': return 'Dados inválidos. Confira os campos e tente de novo.';
    case 'sem_conexao': return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
    default: return 'Não foi possível concluir agora. Tente de novo em instantes.';
  }
}
