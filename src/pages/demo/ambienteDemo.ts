import { useSyncExternalStore } from 'react';
import { base } from '../../domain/db';
import { PONTO_FRANQUEADO_DEMO } from '../../domain/seed';

/**
 * Bases da demonstração, sem tela: contas de demonstração, os quatro aparelhos com os links diretos,
 * o modo "embutido" (as telas dentro do Palco da central) e o interruptor do guia didático.
 *
 * Links finais da apresentação (a central /demo monta e mostra todos eles):
 *   celular      /motorista?tela=cheia&conta=motorista
 *   totem        /totem?ponto=<id>&tela=cheia
 *   franqueado   /franqueado?ponto=<id>&tela=cheia&conta=franqueado
 *   GoodWe       /goodwe?tela=cheia&conta=goodwe
 */

export const DEMO = import.meta.env.VITE_MODO_DEMO === 'true';
export const SENHA_DEMO = (import.meta.env.VITE_DEMO_SENHA as string | undefined) ?? '';

/**
 * true dentro de um iframe do Palco (?embed=1). Lido uma vez, na abertura do documento: navegar
 * dentro do app troca o endereço, mas a tela continua embutida.
 */
export const EMBUTIDO: boolean = DEMO && (() => {
  try { return new URLSearchParams(window.location.search).get('embed') === '1'; } catch { return false; }
})();

/** celular embutido que acompanha a recarga sozinho (?seguir=1): vai para "Minha recarga" quando ela existe */
export const SEGUIR_RECARGA: boolean = EMBUTIDO && (() => {
  try { return new URLSearchParams(window.location.search).get('seguir') === '1'; } catch { return false; }
})();

/** ponto que o painel abre quando ninguém escolheu (o mesmo do franqueado de demonstração) */
export function pontoPadrao(): string {
  // o ponto da apresentação, que a conta franqueado@ opera no seed (FIAP Aclimação); sem ele, o primeiro ativo
  if (base.pontos.some((p) => p.id === PONTO_FRANQUEADO_DEMO)) return PONTO_FRANQUEADO_DEMO;
  return (base.pontos.find((p) => p.ativo) ?? base.pontos[0])?.id ?? '';
}

// ---------------------------------------------------------------- contas de demonstração
export type ContaDemo = 'goodwe' | 'franqueado' | 'motorista' | 'comerciante';

export const CONTAS_DEMO: Record<ContaDemo, { email: string; nome: string }> = {
  goodwe: { email: 'goodwe@pontow.app', nome: 'GoodWe' },
  franqueado: { email: 'franqueado@pontow.app', nome: 'Franqueado' },
  motorista: { email: 'motorista@pontow.app', nome: 'Motorista' },
  comerciante: { email: 'comerciante@pontow.app', nome: 'Comerciante' },
};

export const ehContaDemo = (v: string | null | undefined): v is ContaDemo =>
  !!v && Object.hasOwn(CONTAS_DEMO, v);

// ---------------------------------------------------------------- aparelhos e links
export type AparelhoId = 'celular' | 'totem' | 'franqueado' | 'goodwe';

export interface Aba { id: string; rotulo: string; caminho: string }

export interface AparelhoDef {
  id: AparelhoId;
  nome: string;
  aparelho: string;
  serve: string;
  conta?: ContaDemo;
  /** resolução em que a tela é desenhada no Palco */
  largura: number;
  altura: number;
  abas: Aba[];
}

export const APARELHOS: AparelhoDef[] = [
  {
    id: 'celular', nome: 'Celular do motorista', aparelho: 'Celular · app em tela cheia',
    serve: 'Quem dirige: acha o ponto no mapa, lê o QR do totem, trava o preço, acompanha a recarga e paga o Pix.',
    conta: 'motorista', largura: 390, altura: 844,
    abas: [
      { id: 'mapa', rotulo: 'Mapa', caminho: '/motorista' },
      { id: 'codigo', rotulo: 'Digitar código', caminho: '/motorista/vincular' },
      { id: 'recarga', rotulo: 'Minha recarga', caminho: '/motorista/recarga' },
      { id: 'volt', rotulo: 'Volt', caminho: '/motorista/assistente' },
    ],
  },
  {
    id: 'totem', nome: 'Totem do ponto', aparelho: 'Tablet ou monitor · vertical',
    serve: 'Fica na vaga: mostra o QR e o código quando o carro conecta e acompanha a recarga na tela.',
    largura: 1080, altura: 1920,
    abas: [{ id: 'totem', rotulo: 'Tela do totem', caminho: '/totem' }],
  },
  {
    id: 'franqueado', nome: 'Notebook do franqueado', aparelho: 'Notebook · painel da unidade',
    serve: 'O comércio que hospeda o ponto: vê quem está carregando, o controle de demanda, o extrato e o fechamento.',
    conta: 'franqueado', largura: 1440, altura: 900,
    abas: [
      { id: 'painel', rotulo: 'Painel', caminho: '/franqueado' },
      { id: 'demanda', rotulo: 'Controle de demanda', caminho: '/franqueado/demanda' },
      { id: 'financeiro', rotulo: 'Tarifas e financeiro', caminho: '/franqueado/financeiro' },
      { id: 'ponto', rotulo: 'Meu ponto e totem', caminho: '/franqueado/ponto' },
    ],
  },
  {
    id: 'goodwe', nome: 'Notebook da GoodWe', aparelho: 'Notebook · torre de controle',
    serve: 'A franqueadora: aprova os pedidos de franquia, acompanha a rede e os royalties.',
    conta: 'goodwe', largura: 1440, altura: 900,
    abas: [
      { id: 'rede', rotulo: 'Visão da rede', caminho: '/goodwe' },
      { id: 'homologacao', rotulo: 'Homologação', caminho: '/goodwe/homologacao' },
    ],
  },
];

export const aparelhoDe = (id: AparelhoId): AparelhoDef => APARELHOS.find((a) => a.id === id)!;

export interface OpcoesLink {
  pontoId: string;
  /** ponto que o app abre sozinho; celular e GoodWe só levam ?ponto= quando o escolhido é outro */
  pontoPadrao: string;
  /** aba do aparelho (padrão: a primeira) */
  aba?: string;
  /** versão para o iframe do Palco: sem ?conta= e com ?embed=1 */
  embed?: boolean;
  /** celular do Palco: segue a recarga sozinho */
  seguir?: boolean;
  /** liga o guia didático naquele aparelho (?guia=1): cada aparelho guarda a própria escolha */
  guia?: boolean;
}

/** Caminho (com a pergunta) do aparelho, para colar depois da origem do app. */
export function caminhoDoAparelho(id: AparelhoId, o: OpcoesLink): string {
  const def = aparelhoDe(id);
  const aba = def.abas.find((a) => a.id === o.aba) ?? def.abas[0];
  const p = new URLSearchParams();
  const comPonto = o.pontoId !== o.pontoPadrao;
  switch (id) {
    case 'celular':
      p.set('tela', 'cheia');
      if (o.embed) { p.set('ponto', o.pontoId); p.set('embed', '1'); if (o.seguir) p.set('seguir', '1'); }
      else { p.set('conta', 'motorista'); if (comPonto) p.set('ponto', o.pontoId); }
      break;
    case 'totem':
      p.set('ponto', o.pontoId); p.set('tela', 'cheia');
      if (o.embed) { p.set('embed', '1'); p.set('modo', 'auto'); }
      break;
    case 'franqueado':
      p.set('ponto', o.pontoId); p.set('tela', 'cheia');
      if (o.embed) p.set('embed', '1'); else p.set('conta', 'franqueado');
      break;
    case 'goodwe':
      p.set('tela', 'cheia');
      if (o.embed) { p.set('ponto', o.pontoId); p.set('embed', '1'); }
      else { p.set('conta', 'goodwe'); if (comPonto) p.set('ponto', o.pontoId); }
      break;
  }
  if (o.guia && !o.embed) p.set('guia', '1');
  return `${aba.caminho}?${p.toString()}`;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Endereço no mesmo site da página aberta (o iframe precisa ser da mesma origem para dividir o login). */
export const enderecoLocal = (caminho: string) => `${window.location.origin}${BASE}${caminho}`;

/**
 * Endereço para abrir o aparelho em outra janela deste computador. Cada login fica guardado por origem:
 * em localhost, a GoodWe e o totem abrem em goodwe.localhost e totem.localhost e não derrubam o login do franqueado.
 */
export function enderecoParaAbrir(id: AparelhoId, caminho: string): { url: string; separado: boolean } {
  const { protocol, hostname, port } = window.location;
  const sub = id === 'goodwe' ? 'goodwe' : id === 'totem' ? 'totem' : '';
  const separado = hostname === 'localhost' && !!sub;
  const host = separado ? `${sub}.localhost` : hostname;
  return { url: `${protocol}//${host}${port ? `:${port}` : ''}${BASE}${caminho}`, separado };
}

// ---------------------------------------------------------------- guia didático (ligado/desligado)
const CHAVE_GUIA = 'pontow.guia';
const EVENTO_GUIA = 'pontow-guia';
let guiaNaMemoria = false;

export function guiaLigado(): boolean {
  try {
    const v = localStorage.getItem(CHAVE_GUIA);
    return v === null ? guiaNaMemoria : v === '1';
  } catch { return guiaNaMemoria; }
}

export function definirGuia(ligar: boolean) {
  guiaNaMemoria = ligar;
  try { localStorage.setItem(CHAVE_GUIA, ligar ? '1' : '0'); } catch { /* sem armazenamento: vale só nesta aba */ }
  window.dispatchEvent(new Event(EVENTO_GUIA));
}

function assinarGuia(aoMudar: () => void) {
  window.addEventListener('storage', aoMudar);
  window.addEventListener(EVENTO_GUIA, aoMudar);
  return () => {
    window.removeEventListener('storage', aoMudar);
    window.removeEventListener(EVENTO_GUIA, aoMudar);
  };
}

/** O interruptor do guia (vale para todas as abas deste navegador). */
export const useGuiaLigado = (): boolean => useSyncExternalStore(assinarGuia, guiaLigado, () => false);

/** O guia aparece só no modo demonstração, ligado e fora do Palco. */
export function useGuiaVisivel(): boolean {
  const ligado = useGuiaLigado();
  return DEMO && !EMBUTIDO && ligado;
}

// ---------------------------------------------------------------- copiar
/** Copia para a área de transferência; em http fora do localhost (celular, IP da rede) cai no método antigo. */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(texto); return true; }
  } catch { /* tenta o método antigo */ }
  try {
    const campo = document.createElement('textarea');
    campo.value = texto;
    campo.setAttribute('readonly', '');
    campo.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(campo);
    campo.select();
    const ok = document.execCommand('copy');
    campo.remove();
    return ok;
  } catch { return false; }
}
