import { useState } from 'react';
import { conectarCarro, desconectarCarro } from '../data/acoes';
import { VEICULOS } from '../domain/catalogo';
import type { Carregador } from '../domain/types';

/** Bancada de simulação: faz o papel do carro chegando na vaga (MVP, sem hardware). */
export function BancadaVaga({ vaga }: { vaga: Carregador }) {
  const [veiculoId, setVeiculoId] = useState(VEICULOS[0].id);
  const [soc, setSoc] = useState(30);
  const [erro, setErro] = useState('');
  const rodar = (f: () => Promise<void>) => () => { setErro(''); f().catch((e: Error) => setErro(e.message)); };

  if (vaga.estado === 'MANUTENCAO' || vaga.estado === 'OFFLINE') return <span className="tiny muted">vaga {vaga.estado.toLowerCase()}</span>;
  if (vaga.carro) {
    const v = VEICULOS.find((x) => x.id === vaga.carro!.veiculoId);
    return (
      <div className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="tiny">{v?.montadora} {v?.modelo} conectado</span>
        <button className="btn" onClick={rodar(() => desconectarCarro(vaga.id))}>Desconectar</button>
        {erro && <span className="tiny" style={{ color: 'var(--k-red2)' }}>{erro}</span>}
      </div>
    );
  }
  return (
    <div className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <select id={`veic-${vaga.id}`} className="btn" value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
        {VEICULOS.map((x) => <option key={x.id} value={x.id}>{x.montadora} {x.modelo}</option>)}
      </select>
      <input id={`soc-${vaga.id}`} className="btn" type="number" min={5} max={95} value={soc} style={{ width: 70 }}
             onChange={(e) => setSoc(Number(e.target.value))} />
      <span className="tiny muted">%</span>
      <button className="btn primary" onClick={rodar(() => conectarCarro(vaga.id, veiculoId, soc))}>Conectar carro</button>
      {erro && <span className="tiny" style={{ color: 'var(--k-red2)' }}>{erro}</span>}
    </div>
  );
}
