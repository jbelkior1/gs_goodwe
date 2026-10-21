import { Giro } from '../componentes';
import type { Partes } from '../tipos';

/** TP — totem sem ponto: mostra o código de 6 dígitos para o franqueado digitar no painel (passo 4) */
export function parteParear({ codigo, erro }: { codigo: string | null; erro?: string }): Partes {
  const grupos = codigo ? `${codigo.slice(0, 3)} ${codigo.slice(3)}` : '';
  return {
    estado: (
      <div className="tk-parear" role="status">
        <p className="tk-rotulo-g">Totem novo</p>
        <h1 className="tk-titulo-grande">Parear este totem</h1>
        {codigo
          ? <div className="tk-codigo-parear" aria-label={`Código de pareamento ${codigo.split('').join(' ')}`}>{grupos}</div>
          : <Giro />}
        <p className="tk-instrucao-g">No painel do comércio, abra <b>Meu ponto e totem</b> e digite este código</p>
        <p className="tk-instrucao dim">{erro ?? 'Esta tela muda sozinha quando o pareamento terminar.'}</p>
      </div>
    ),
  };
}
