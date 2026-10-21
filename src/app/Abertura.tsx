import { useEffect, useState } from 'react';
import { Icone } from '../ui/icones';
import './Abertura.css';

/** segundos até a próxima tentativa automática quando o banco não responde */
const ESPERA_S = 15;

const Marca = () => (
  <div className="cg-marca">
    <span className="cg-logo"><Icone nome="raio" tamanho={20} /></span>
    <span className="cg-nome">Ponto W · GoodWe</span>
  </div>
);

/** Tela enquanto o app lê o banco pela primeira vez. */
export function Carregando() {
  return (
    <main className="cg" role="status" aria-live="polite">
      <Marca />
      <div className="cg-trilho" aria-hidden="true"><span /></div>
      <p className="cg-texto">Carregando a rede…</p>
    </main>
  );
}

/** Falha ao abrir: tenta de novo sozinha a cada 15 s e também a pedido. */
export function Falha({ detalhe, aoTentar }: { detalhe: string; aoTentar: () => void }) {
  const [restam, setRestam] = useState(ESPERA_S);
  useEffect(() => {
    if (restam <= 0) { aoTentar(); return; }
    const id = window.setTimeout(() => setRestam((r) => r - 1), 1000);
    return () => window.clearTimeout(id);
  }, [restam, aoTentar]);
  return (
    <main className="cg">
      <Marca />
      <div className="cg-falha" role="alert">
        <h1>Não foi possível carregar a rede</h1>
        <p>O banco de dados não respondeu. Confira a conexão com a internet; vamos tentar de novo sozinhos em {restam} s.</p>
        <button className="btn primary" onClick={aoTentar}>Tentar agora</button>
        {detalhe && <span className="cg-detalhe">Detalhe técnico: {detalhe}</span>}
      </div>
    </main>
  );
}
