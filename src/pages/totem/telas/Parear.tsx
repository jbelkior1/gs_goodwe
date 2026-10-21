import { obterPonto } from '../../../domain/db';
import { pontoPadrao } from '../../demo/ambienteDemo';
import { Giro } from '../componentes';
import type { Partes } from '../tipos';

const DEMO = import.meta.env.VITE_MODO_DEMO === 'true';

/** mesmo endereço do totem, já apontando para o ponto (recarrega: o totem lê o ?ponto= ao abrir) */
function linkDoPonto(pontoId: string): string {
  const p = new URLSearchParams(window.location.search);
  p.set('ponto', pontoId);
  return `${window.location.pathname}?${p.toString()}`;
}

/**
 * TP — totem sem ponto: mostra o código de 6 dígitos para o franqueado digitar no painel (passo 4).
 * Este código NÃO é o da recarga (4 letras, que só aparece depois que o carro conecta): a tela diz
 * isso com todas as letras, porque é a confusão mais comum de quem abre o totem pela primeira vez.
 */
export function parteParear({ codigo, erro }: { codigo: string | null; erro?: string }): Partes {
  const grupos = codigo ? `${codigo.slice(0, 3)} ${codigo.slice(3)}` : '';
  const demo = DEMO ? obterPonto(pontoPadrao()) : undefined;
  return {
    estado: (
      <div className="tk-parear" role="status">
        <p className="tk-rotulo-g">Totem novo · ainda sem ponto</p>
        <h1 className="tk-titulo-grande">Parear este totem</h1>
        {codigo
          ? <div className="tk-codigo-parear" aria-label={`Código de pareamento ${codigo.split('').join(' ')}`}>{grupos}</div>
          : <Giro />}
        <p className="tk-instrucao-g">Este código é do <b>franqueado</b>: no painel do comércio, abra <b>Meu ponto e totem</b> e digite estes 6 números</p>
        <p className="tk-instrucao dim">
          Não é o código da recarga. O motorista usa outro código, de 4 letras, que aparece aqui depois que o carro é conectado.
        </p>
        <p className="tk-instrucao dim">{erro ?? 'Esta tela muda sozinha quando o pareamento terminar.'}</p>
        {demo && (
          <div className="tk-demo" style={{ gridTemplateColumns: '1fr', width: '100%' }}>
            <span className="tk-demo-rotulo">Demonstração</span>
            <a className="tk-demo-btn" href={linkDoPonto(demo.id)} style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }}>
              Pular o pareamento e abrir o totem do {demo.nome}
            </a>
          </div>
        )}
      </div>
    ),
  };
}
