/**
 * Cliente da API Python (backend/pontow/api.py). Toda chamada devolve os dados e o `meta`
 * que o backend manda: rota, algoritmo, comparações, n e tempo.
 */
export const API_PY = ((import.meta.env.VITE_API_PY as string | undefined) || 'http://localhost:8000').replace(/\/$/, '');

export interface Meta {
  rota: string;
  algoritmo: string | null;
  complexidade: string | null;
  comparacoes: number | null;
  n: number;
  ms: number;
}

export interface Resposta<T> {
  dados: T;
  meta: Meta;
}

export interface Sessao {
  id: number;
  ponto: string;
  vaga: number;
  motorista: string;
  veiculo: string;
  inicio: string;
  fim: string | null;
  tarifa_kwh: number;
  faixa: 'VALE' | 'NORMAL' | 'PICO';
  energia_kwh: number;
  valor: number;
  estado: 'CARREGANDO' | 'FATURADO';
  duracao_min: number;
}

export interface Cotacao {
  preco_kwh: number;
  faixa: string;
  fator_horario: number;
  adicional_escassez: number;
  piso: number;
  teto: number;
  explicacao: string[];
}

export interface Reparticao {
  valor: number;
  energia: number;
  royalty_goodwe: number;
  fundo_marketing: number;
  pix: number;
  comercio: number;
}

export async function chamar<T>(caminho: string, corpo?: unknown): Promise<Resposta<T>> {
  const r = await fetch(API_PY + caminho, corpo === undefined ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const d = (json as { detail?: unknown }).detail;
    throw new Error(typeof d === 'string' ? d : `Erro ${r.status} em ${caminho}`);
  }
  return json as Resposta<T>;
}
