import { useState } from 'react';
import { PalcoEscalado } from '../../ui/Quiosque';
import { APARELHOS, caminhoDoAparelho, enderecoLocal, type AparelhoDef, type AparelhoId } from './ambienteDemo';

/**
 * Palco: as quatro telas ao vivo lado a lado, cada uma num iframe do mesmo site desenhado na resolução
 * real do aparelho e escalado para caber. As telas abrem com ?embed=1: dividem o login do navegador,
 * não pedem a conta do papel e não trocam a conta de ninguém. Por padrão são só para ver (sem toque).
 */
export function Palco({
  pontoId, pontoPadrao, abas,
}: {
  pontoId: string;
  pontoPadrao: string;
  abas: Partial<Record<AparelhoId, string>>;
}) {
  const [interativo, setInterativo] = useState(false);
  const [seguir, setSeguir] = useState(true);
  const [foco, setFoco] = useState<AparelhoId | null>(null);
  const [versao, setVersao] = useState(0);

  return (
    <section className="dm-palco-area" aria-label="Palco com as quatro telas ao vivo">
      <div className="dm-palco-barra">
        <label className="dm-opcao">
          <input type="checkbox" checked={interativo} onChange={(e) => setInterativo(e.target.checked)} />
          <span>Tocar nas telas <span className="muted">(desligado: só para ver)</span></span>
        </label>
        <label className="dm-opcao">
          <input type="checkbox" checked={seguir} onChange={(e) => setSeguir(e.target.checked)} />
          <span>Celular acompanha a recarga <span className="muted">(senão, usa a aba escolhida)</span></span>
        </label>
        <div className="row" style={{ gap: 8 }}>
          {foco && <button type="button" className="btn sm" onClick={() => setFoco(null)}>Mostrar as quatro</button>}
          <button type="button" className="btn sm" onClick={() => setVersao((v) => v + 1)}>Recarregar as telas</button>
        </div>
      </div>

      <div className={`dm-palco${foco ? ' foco' : ''}`}>
        {APARELHOS.filter((a) => !foco || a.id === foco).map((def) => {
          const segue = def.id === 'celular' && seguir;
          const caminho = caminhoDoAparelho(def.id, { pontoId, pontoPadrao, aba: segue ? 'mapa' : abas[def.id], embed: true, seguir: segue });
          return (
            <Tela
              key={`${def.id}-${caminho}-${versao}`} def={def} src={enderecoLocal(caminho)} interativo={interativo}
              ampliada={foco === def.id} aoAmpliar={() => setFoco(foco === def.id ? null : def.id)}
            />
          );
        })}
      </div>
    </section>
  );
}

function Tela({
  def, src, interativo, ampliada, aoAmpliar,
}: {
  def: AparelhoDef; src: string; interativo: boolean; ampliada: boolean; aoAmpliar: () => void;
}) {
  const celular = def.id === 'celular';
  // o celular ganha a moldura: 12 px de cada lado em volta da tela de 390 × 844
  const largura = celular ? def.largura + 24 : def.largura;
  const altura = celular ? def.altura + 24 : def.altura;
  return (
    <figure className={`dm-tela dm-tela-${def.id}`}>
      <figcaption className="dm-tela-nome">
        <span>{def.nome}</span>
        <span className="row" style={{ gap: 6 }}>
          <span className="meta">{def.largura} × {def.altura}</span>
          <button type="button" className="btn sm" onClick={aoAmpliar}>{ampliada ? 'Reduzir' : 'Ampliar'}</button>
        </span>
      </figcaption>
      <div className="dm-tela-caixa">
        <PalcoEscalado largura={largura} altura={altura}>
          <div className={`dm-moldura${celular ? ' celular' : ''}`}>
            <iframe
              title={def.nome} src={src} width={def.largura} height={def.altura}
              className="dm-iframe" style={{ pointerEvents: interativo ? 'auto' : 'none' }}
            />
          </div>
        </PalcoEscalado>
      </div>
    </figure>
  );
}
