import type { ReactNode } from 'react';
import { brl } from '../../domain/formato';
import { cent, type ComposicaoTarifa } from '../../domain/engine/tarifa';
import { vagaLivre } from '../../domain/engine/totem';
import { Ic, type NomeIc } from './icones';
import type { DadosTela, Etapa } from './tipos';

/**
 * Anel de bateria (SVG puro, 400 × 400): o CSS dá o tamanho e as cores. `inicio` pinta, num tom mais
 * escuro, o trecho que o carro já tinha quando chegou, para a carga desta recarga aparecer sozinha.
 */
export function Anel({ pct, inicio, pausada }: { pct: number; inicio?: number; pausada?: boolean }) {
  const r = 170;
  const circ = 2 * Math.PI * r;
  const p = Math.min(100, Math.max(0, pct));
  const i = Math.min(p, Math.max(0, inicio ?? 0));
  return (
    <svg viewBox="0 0 400 400" className={`tk-anel-svg ${pausada ? 'pausada' : ''}`} aria-hidden="true" focusable="false">
      <circle cx="200" cy="200" r={r} className="tk-anel-trilho" />
      <circle
        cx="200" cy="200" r={r} className="tk-anel-carga" transform="rotate(-90 200 200)"
        strokeDasharray={`${(p / 100) * circ} ${circ}`}
      />
      {i > 0 && (
        <circle
          cx="200" cy="200" r={r} className="tk-anel-inicio" transform="rotate(-90 200 200)"
          strokeDasharray={`${(i / 100) * circ} ${circ}`}
        />
      )}
    </svg>
  );
}

/**
 * Minicurva da potência na recarga. SVG simples (sem biblioteca de gráfico: o recharts desenha uma
 * caixa de foco em volta do svg no toque). Quem chama só entrega a série com 3 pontos ou mais.
 */
export function Minicurva({ serie }: { serie: number[] }) {
  const W = 600;
  const H = 120;
  const max = Math.max(1, ...serie) * 1.15;
  const pts = serie.map((v, i) => `${(i / Math.max(1, serie.length - 1)) * W},${H - (v / max) * (H - 8) - 4}`);
  const linha = `M${pts.join(' L')}`;
  return (
    <svg className="tk-minicurva" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Potência ao longo da recarga" focusable="false">
      <path d={`${linha} L${W},${H} L0,${H} Z`} className="tk-minicurva-area" />
      <path d={linha} className="tk-minicurva-linha" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** anel girando: "estou trabalhando nisso" */
export function Giro() {
  return <span className="tk-giro solto" aria-hidden="true" />;
}

type Tom = 'neutro' | 'ok' | 'aviso' | 'erro';

/**
 * A tela de um estado: ícone (ou giro), título grande e até três linhas embaixo — `texto` (a frase
 * principal; com `textoNoTom` sai na cor do estado), `apoio` (contexto, apagado) e `alerta` (o cuidado
 * que a pessoa precisa ter agora, em âmbar: "Não retire o cabo").
 */
export function Bloco({
  icone, giro, tom = 'neutro', titulo, texto, textoNoTom, apoio, alerta, extra,
}: {
  icone?: NomeIc; giro?: boolean; tom?: Tom;
  titulo: ReactNode; texto?: ReactNode; textoNoTom?: boolean; apoio?: ReactNode; alerta?: ReactNode; extra?: ReactNode;
}) {
  return (
    <div className="tk-bloco" role="status">
      <div className={`tk-bloco-icone ${tom}`}>
        {giro && <span className="tk-giro" aria-hidden="true" />}
        {icone && <Ic nome={icone} tamanho={150} />}
      </div>
      <div className="tk-bloco-textos">
        <h1 className="tk-titulo-grande">{titulo}</h1>
        {texto && <p className={`tk-instrucao-g${textoNoTom ? ` t-${tom}` : ''}`}>{texto}</p>}
        {apoio && <p className="tk-instrucao dim">{apoio}</p>}
        {alerta && <p className="tk-instrucao tk-alerta">{alerta}</p>}
      </div>
      {extra}
    </div>
  );
}

// ------------------------------------------------------------------ faixa dos 4 passos
const PASSO_A_FAZER = ['Conectar', 'Confirmar', 'Carregar', 'Pagar'];
const PASSO_FEITO = ['Conectado', 'Confirmado', 'Carregado', 'Pago'];

/** onde a pessoa está na recarga: os passos de antes feitos, o atual na cor do momento, os próximos apagados */
export function Etapas({ etapa }: { etapa: Etapa }) {
  return (
    <ol className="tk-etapas" aria-label={`Passo ${etapa.n} de 4`}>
      {PASSO_A_FAZER.map((a, i) => {
        const n = i + 1;
        const feito = n < etapa.n || (n === etapa.n && etapa.concluida);
        const atual = n === etapa.n;
        const palavra = atual && etapa.rotulo ? etapa.rotulo
          : feito ? (n === 2 && etapa.visitante ? 'Sem app' : PASSO_FEITO[i]) : a;
        const classe = atual ? `atual t-${etapa.tom ?? 'vermelho'}` : feito ? 'feito' : 'depois';
        return (
          <li key={a} className={`tk-etapa ${classe}`} aria-current={atual ? 'step' : undefined}>
            {n} · {palavra}
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------------ painéis de informação
/**
 * Painel de informação (cantos retos, traço colorido em cima): o que é para ler. O que é para tocar
 * (botões, cartões de vaga) tem canto arredondado. `tom` pinta o traço: vermelho = o número principal.
 */
export function Cartao({
  tom = 'neutro', rotulo, lado, className, children,
}: { tom?: Tom | 'vermelho'; rotulo?: ReactNode; lado?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`tk-cartao t-${tom}${className ? ` ${className}` : ''}`}>
      {(rotulo || lado) && (
        <div className="tk-cartao-topo">
          {rotulo && <span className="tk-rotulo">{rotulo}</span>}
          {lado && <span className="tk-cartao-lado">{lado}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

/** linha de rótulo e valor ("Preço base ··· R$ 1,90") */
export function Linha({ rotulo, valor }: { rotulo: ReactNode; valor: ReactNode }) {
  return <div className="tk-linha"><span>{rotulo}</span><span>{valor}</span></div>;
}

/** "Entrada no vale (−5%) −R$ 0,09" → ["Entrada no vale (−5%)", "−R$ 0,09"]; sem valor no fim, a linha vai inteira */
function separarLinha(texto: string): [string, string] | null {
  const m = /^(.+?)\s+([−+]?R\$[\s ]?[\d.]+,\d{2})(?:\/kWh)?$/u.exec(texto);
  return m ? [m[1], m[2]] : null;
}

/**
 * De onde vem o preço (base, horário, últimas vagas). Só aparece quando a composição é a do preço
 * mostrado: no QR o preço já está travado e pode ser de alguns minutos atrás.
 */
export function LinhasDoPreco({ tarifa, precoKWh }: { tarifa: ComposicaoTarifa; precoKWh: number }) {
  if (cent(tarifa.precoFinalKWh) !== cent(precoKWh) || tarifa.explicacao.length < 2) return null;
  return (
    <div className="tk-linhas">
      {tarifa.explicacao.map((l) => {
        const partes = separarLinha(l);
        return partes ? <Linha key={l} rotulo={partes[0]} valor={partes[1]} /> : <p key={l} className="tk-linha-solta">{l}</p>;
      })}
    </div>
  );
}

/** o preço do kWh em destaque */
export function ValorKWh({ valor }: { valor: number }) {
  return <div className="tk-preco-valor">{valor > 0 ? brl(valor) : '—'}<small>/kWh</small></div>;
}

/** painel do preço: valor grande, de onde ele vem, linhas extras e uma nota embaixo */
export function CartaoDoPreco({
  rotulo, precoKWh, tarifa, lado, nota, tom = 'vermelho', children,
}: {
  rotulo: string; precoKWh: number; tarifa?: ComposicaoTarifa; lado?: ReactNode; nota?: ReactNode;
  tom?: 'vermelho' | 'neutro'; children?: ReactNode;
}) {
  return (
    <Cartao tom={tom} rotulo={rotulo} lado={lado} className="tk-cartao-preco">
      <ValorKWh valor={precoKWh} />
      {tarifa && <LinhasDoPreco tarifa={tarifa} precoKWh={precoKWh} />}
      {nota && <div className="tk-cartao-nota">{nota}</div>}
      {children}
    </Cartao>
  );
}

/** um número da recarga num painel próprio: rótulo, valor com unidade e uma nota opcional */
export function Metrica({
  rotulo, valor, unidade, nota, tom = 'neutro', children,
}: { rotulo: string; valor: string; unidade?: string; nota?: ReactNode; tom?: Tom | 'vermelho'; children?: ReactNode }) {
  const tam = valor.length > 7 ? ' t-p' : '';
  return (
    <Cartao tom={tom} rotulo={rotulo} className="tk-metrica">
      <div className={`tk-metrica-valor${tam}`}>{valor}{unidade && <small> {unidade}</small>}</div>
      {nota && <span className={`tk-metrica-nota${tom === 'aviso' ? ' t-aviso' : ''}`}>{nota}</span>}
      {children}
    </Cartao>
  );
}

/** passo numerado de uma instrução ("1 · Retire o cabo do carro") */
export function ListaDePassos({ passos, tom = 'vermelho' }: { passos: string[]; tom?: 'vermelho' | 'aviso' | 'neutro' }) {
  return (
    <ol className={`tk-lista-passos t-${tom}`}>
      {passos.map((p, i) => <li key={p}><span className="tk-lista-n">{i + 1}</span><span>{p}</span></li>)}
    </ol>
  );
}

/** a instrução do rodapé: uma frase, com ícone opcional */
export function Instrucao({ icone, children }: { icone?: NomeIc; children: ReactNode }) {
  return <div className="tk-pe-instrucao">{icone && <Ic nome={icone} tamanho={44} />}<span>{children}</span></div>;
}

// ------------------------------------------------------------------ demonstração
/** Controles de demonstração: o carro chega no cabo sem passar pelo painel do franqueado. Só no demo. */
export function Simulacao({ d }: { d: DadosTela }) {
  const livres = d.vagas.filter((v) => vagaLivre(v.dados.vaga) && v.situacao === 'livre');
  const comCarro = d.vagas.filter((v) => v.comCarro);
  const varias = d.vagas.length > 1;
  if (!livres.length && !comCarro.length) return null;
  return (
    <>
      {livres.map((v) => (
        <button key={v.id} className="tk-demo-btn" disabled={d.ocupado} onClick={() => d.simularCarro(v.id)}>
          {varias ? `${v.apelido} · ` : ''}Simular carro conectado
        </button>
      ))}
      {comCarro.map((v) => (
        <button key={v.id} className="tk-demo-btn" disabled={d.ocupado} onClick={() => d.retirarCabo(v.id)}>
          {varias ? `${v.apelido} · ` : ''}Simular retirada do cabo
        </button>
      ))}
    </>
  );
}
