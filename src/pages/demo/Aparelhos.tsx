import { useEffect, useState } from 'react';
import { Icone, type NomeIcone } from '../../ui/icones';
import { QR, linkDoApp } from '../../ui/QR';
import { APARELHOS, caminhoDoAparelho, copiarTexto, enderecoParaAbrir, type AparelhoDef, type AparelhoId } from './ambienteDemo';

/** Os quatro aparelhos da apresentação: para que serve, o link direto de cada aba, o QR e o botão Abrir. */

const ICONE: Record<AparelhoId, NomeIcone> = { celular: 'carro', totem: 'raio', franqueado: 'loja', goodwe: 'antena' };

export function Aparelhos({
  pontoId, pontoPadrao, guia, abas, aoMudarAba,
}: {
  pontoId: string;
  pontoPadrao: string;
  guia: boolean;
  abas: Partial<Record<AparelhoId, string>>;
  aoMudarAba: (id: AparelhoId, aba: string) => void;
}) {
  return (
    <div className="dm-aparelhos">
      {APARELHOS.map((def) => (
        <CartaoAparelho
          key={def.id} def={def} pontoId={pontoId} pontoPadrao={pontoPadrao} guia={guia}
          aba={abas[def.id] ?? def.abas[0].id} aoMudarAba={(aba) => aoMudarAba(def.id, aba)}
        />
      ))}
    </div>
  );
}

function CartaoAparelho({
  def, pontoId, pontoPadrao, guia, aba, aoMudarAba,
}: {
  def: AparelhoDef; pontoId: string; pontoPadrao: string; guia: boolean; aba: string; aoMudarAba: (aba: string) => void;
}) {
  const caminho = caminhoDoAparelho(def.id, { pontoId, pontoPadrao, aba, guia });
  const link = linkDoApp(caminho);
  const abrir = enderecoParaAbrir(def.id, caminho);
  const [copiado, setCopiado] = useState<'sim' | 'nao' | ''>('');
  useEffect(() => {
    if (!copiado) return;
    const id = window.setTimeout(() => setCopiado(''), 2200);
    return () => window.clearTimeout(id);
  }, [copiado]);

  return (
    <article className="card dm-ap">
      <header className="dm-ap-topo">
        <span className="dm-ap-ico"><Icone nome={ICONE[def.id]} tamanho={18} /></span>
        <div>
          <h3 className="dm-ap-nome">{def.nome}</h3>
          <div className="dm-ap-sub">{def.aparelho}</div>
        </div>
      </header>
      <p className="dm-ap-serve">{def.serve}</p>

      {def.abas.length > 1 && (
        <div className="dm-abas" role="group" aria-label={`Aba de ${def.nome}`}>
          {def.abas.map((a) => (
            <button key={a.id} type="button" className={`chip${a.id === aba ? ' on' : ''}`} aria-pressed={a.id === aba}
                    onClick={() => aoMudarAba(a.id)}>
              {a.rotulo}
            </button>
          ))}
        </div>
      )}

      <div className="dm-ap-link">
        <QR texto={link} tamanho={118} />
        <div className="dm-ap-link-lado">
          <label className="dm-rotulo" htmlFor={`dm-link-${def.id}`}>Link direto</label>
          <textarea
            id={`dm-link-${def.id}`} className="dm-link" readOnly rows={3} value={link} spellCheck={false}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="row wrap" style={{ gap: 8 }}>
            <button type="button" className="btn sm" onClick={async () => setCopiado((await copiarTexto(link)) ? 'sim' : 'nao')}>
              {copiado === 'sim' ? 'Copiado' : copiado === 'nao' ? 'Selecione e copie' : 'Copiar'}
            </button>
            <a className="btn sm primary" href={abrir.url} target="_blank" rel="noreferrer"
               title={abrir.separado ? 'Abre em outra origem deste computador, com login separado' : undefined}>
              Abrir
            </a>
            {abrir.separado && <span className="tiny muted">abre em {new URL(abrir.url).host}</span>}
          </div>
        </div>
      </div>
    </article>
  );
}
