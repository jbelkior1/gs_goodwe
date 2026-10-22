import { useState, type ReactNode } from 'react';
import { VEICULOS } from '../../domain/catalogo';
import { ListaDePassos } from './componentes';

/**
 * Pergunta de confirmação: ações que mexem na conta de alguém pedem um segundo toque. Em pé ela sobe
 * de baixo, como o painel do Volt. `destaque` é a linha que decide (o preço travado) e `passos`, o que
 * acontece depois do toque.
 */
export function Confirmacao({
  titulo, texto, destaque, passos, rotuloOk, rotuloVoltar = 'Voltar', perigo, ocupado, erro, aoConfirmar, aoVoltar,
}: {
  titulo: string; texto: ReactNode; destaque?: ReactNode; passos?: string[]; rotuloOk: string; rotuloVoltar?: string; perigo?: boolean;
  ocupado: boolean; erro?: string; aoConfirmar: () => void; aoVoltar: () => void;
}) {
  return (
    <div className="tk-dialogo-fundo" onClick={aoVoltar}>
      <section className={`tk-dialogo${perigo ? ' perigo' : ''}`} role="alertdialog" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <h2 className="tk-titulo">{titulo}</h2>
        <p className="tk-instrucao dim">{texto}</p>
        {destaque && <div className="tk-dialogo-destaque">{destaque}</div>}
        {passos && <ListaDePassos passos={passos} tom="neutro" />}
        {erro && <p className="tk-erro" role="alert">{erro}</p>}
        <div className="tk-dialogo-botoes">
          <button className={`tk-btn ${perigo ? 'perigo' : 'primario'}`} disabled={ocupado} onClick={aoConfirmar}>
            {ocupado ? 'Aguarde…' : rotuloOk}
          </button>
          <button className="tk-btn sec" onClick={aoVoltar}>{rotuloVoltar}</button>
        </div>
      </section>
    </div>
  );
}

const BATERIAS = [10, 20, 30, 50, 70];

/** Demonstração: o carro chega na vaga (escolhe o modelo e a bateria inicial). Mesma ação da bancada do franqueado. */
export function SimularCarro({
  vagaNome, ocupado, erro, aoConectar, aoVoltar,
}: {
  vagaNome: string; ocupado: boolean; erro?: string;
  aoConectar: (veiculoId: string, soc: number) => void; aoVoltar: () => void;
}) {
  const [veiculoId, setVeiculoId] = useState(VEICULOS[0].id);
  const [soc, setSoc] = useState(30);
  return (
    <div className="tk-dialogo-fundo" onClick={aoVoltar}>
      <section className="tk-dialogo grande" role="dialog" aria-label="Simular carro conectado" onClick={(e) => e.stopPropagation()}>
        <p className="tk-rotulo-g">Demonstração · {vagaNome}</p>
        <h2 className="tk-titulo">Simular carro conectado</h2>
        <div className="tk-escolha">
          <span className="tk-rotulo">Veículo</span>
          <div className="tk-escolha-grade">
            {VEICULOS.map((v) => (
              <button key={v.id} className={`tk-opcao ${veiculoId === v.id ? 'on' : ''}`} aria-pressed={veiculoId === v.id} onClick={() => setVeiculoId(v.id)}>
                {v.montadora} {v.modelo}
              </button>
            ))}
          </div>
        </div>
        <div className="tk-escolha">
          <span className="tk-rotulo">Bateria inicial</span>
          <div className="tk-escolha-linha">
            {BATERIAS.map((b) => (
              <button key={b} className={`tk-opcao ${soc === b ? 'on' : ''}`} aria-pressed={soc === b} onClick={() => setSoc(b)}>{b}%</button>
            ))}
          </div>
        </div>
        {erro && <p className="tk-erro" role="alert">{erro}</p>}
        <div className="tk-dialogo-botoes">
          <button className="tk-btn primario" disabled={ocupado} onClick={() => aoConectar(veiculoId, soc)}>
            {ocupado ? 'Conectando…' : 'Conectar carro'}
          </button>
          <button className="tk-btn sec" onClick={aoVoltar}>Cancelar</button>
        </div>
      </section>
    </div>
  );
}
