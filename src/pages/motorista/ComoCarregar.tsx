import { Link } from 'react-router-dom';
import { REGRAS } from '../../domain/catalogo';
import { Icone, type NomeIcone } from '../../ui/icones';
import './comoCarregar.css';

const PASSOS: { ico: NomeIcone; titulo: string; texto: string }[] = [
  { ico: 'mapa', titulo: 'Vá até um ponto Ponto W', texto: 'No mapa você vê os pontos com vaga livre e o preço de agora.' },
  { ico: 'tomada', titulo: 'Conecte o cabo na vaga', texto: 'O totem percebe o carro e abre a sua recarga.' },
  { ico: 'qr', titulo: 'O totem mostra um QR e um código de 4 letras', texto: `O código só aparece depois que o cabo é conectado e vale ${REGRAS.codigoValidadeMin} minutos.` },
  { ico: 'check', titulo: 'Leia o QR com a câmera ou digite o código aqui', texto: 'O preço do kWh já vem travado. Você confere e inicia a recarga.' },
];

/** As linhas da explicação do preço ("Horário de pico (+12%) +R$ 0,23"): descrição à esquerda, valor à direita. */
export function LinhasDoPreco({ linhas }: { linhas: string[] }) {
  return (
    <ul className="cod-linhas">
      {linhas.map((l, i) => {
        const m = l.match(/^(.*?)\s([+−]R\$\s[\d.,]+)$/);
        if (!m) return <li key={i}>{l}</li>;
        return (
          <li key={i}>
            <span>{m[1]}</span>
            <span className={`val ${m[2].startsWith('−') ? 'menos' : 'mais'}`}>{m[2]}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Passo a passo da recarga (passos 5 a 7 do fluxo): de onde vem o código.
 * Aparece quando o motorista chega sem código, com código inválido/vencido ou sem recarga.
 */
export function ComoCarregar({ titulo = 'De onde vem o código', destaque, verMapa = true }: {
  titulo?: string;
  /** passo (1 a 4) em destaque, quando a tela já sabe em qual o motorista está */
  destaque?: number;
  verMapa?: boolean;
}) {
  return (
    <div className="como">
      <div className="como-titulo">{titulo}</div>
      <ol className="como-lista">
        {PASSOS.map((p, i) => (
          <li key={p.titulo} className={`como-passo ${destaque === i + 1 ? 'on' : ''}`}>
            <span className="como-marca"><Icone nome={p.ico} tamanho={16} /></span>
            <div className="como-texto">
              <b><span className="como-n">{i + 1}</span> {p.titulo}</b>
              <span>{p.texto}</span>
            </div>
          </li>
        ))}
      </ol>
      {verMapa && <Link className="btn" to="/motorista">Ver pontos no mapa</Link>}
    </div>
  );
}
