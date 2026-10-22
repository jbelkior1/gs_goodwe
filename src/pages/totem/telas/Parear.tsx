import { obterPonto } from '../../../domain/db';
import { pontoPadrao } from '../../demo/ambienteDemo';
import { Cartao, Giro } from '../componentes';
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
 * Este código NÃO é o da recarga (4 letras, que só aparece depois que o carro conecta): a tela põe os
 * dois lado a lado, porque é a confusão mais comum de quem abre o totem pela primeira vez.
 */
export function parteParear({ codigo, erro }: { codigo: string | null; erro?: string }): Partes {
  const grupos = codigo ? `${codigo.slice(0, 3)} ${codigo.slice(3)}` : '';
  const demo = DEMO ? obterPonto(pontoPadrao()) : undefined;
  return {
    estado: (
      <div className="tk-parear" role="status">
        <div className="tk-parear-cabeca">
          <p className="tk-sub">Totem novo · ainda sem ponto</p>
          <h1 className="tk-titulo-grande">Parear este totem</h1>
        </div>
        <Cartao tom="vermelho" rotulo="Código de pareamento · para o franqueado" className="tk-cartao-parear">
          {codigo
            ? <div className="tk-codigo-parear" aria-label={`Código de pareamento ${codigo.split('').join(' ')}`}>{grupos}</div>
            : <Giro />}
          <p className="tk-instrucao-g">No painel do comércio, abra <b>Meu ponto e totem</b> e digite estes 6 números</p>
        </Cartao>
        <div className="tk-dois-codigos">
          <div className="tk-um-codigo este">
            <span className="tk-rotulo">6 números</span>
            <b>{grupos || '··· ···'}</b>
            <span>O franqueado liga o totem ao ponto. Uma vez só.</span>
          </div>
          <div className="tk-um-codigo">
            <span className="tk-rotulo">4 letras</span>
            <b>ABCD</b>
            <span>O motorista libera a recarga. Aparece depois que o carro é conectado.</span>
          </div>
        </div>
        <p className="tk-instrucao dim tk-parear-pe"><Giro />{erro ?? 'Esta tela muda sozinha quando o pareamento terminar'}</p>
      </div>
    ),
    demo: demo ? (
      <a className="tk-demo-btn largo" href={linkDoPonto(demo.id)}>Pular o pareamento e abrir o totem do {demo.nome}</a>
    ) : undefined,
  };
}
