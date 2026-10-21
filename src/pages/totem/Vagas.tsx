import type { SituacaoNoTotem, VagaVista } from '../../domain/engine/totem';
import { Ic, type NomeIc } from './icones';

/** ícone e tom de cada situação: o estado é sempre ícone + palavra, nunca só cor */
const VISUAL: Record<SituacaoNoTotem, { icone: NomeIc; tom: 'ok' | 'aviso' | 'erro' | 'neutro' }> = {
  livre: { icone: 'check', tom: 'ok' },
  aberta: { icone: 'qr', tom: 'aviso' },
  reconhecendo: { icone: 'carro', tom: 'neutro' },
  reconhecendoFalhou: { icone: 'alerta', tom: 'aviso' },
  iniciando: { icone: 'raio', tom: 'ok' },
  carga: { icone: 'raio', tom: 'ok' },
  pausada: { icone: 'pausa', tom: 'aviso' },
  encerrando: { icone: 'relogio', tom: 'neutro' },
  fechando: { icone: 'relogio', tom: 'neutro' },
  pagar: { icone: 'dinheiro', tom: 'aviso' },
  pago: { icone: 'check', tom: 'ok' },
  expirada: { icone: 'relogio', tom: 'aviso' },
  ocupada: { icone: 'carro', tom: 'neutro' },
  manutencao: { icone: 'chave', tom: 'erro' },
  foraDoAr: { icone: 'bloqueio', tom: 'erro' },
  semSinal: { icone: 'semWifi', tom: 'erro' },
};

/** faixa inferior com um cartão tocável por vaga (só aparece com 2 vagas ou mais) */
export function CartoesDeVaga({ vagas, focoId, aoEscolher }: { vagas: VagaVista[]; focoId?: string; aoEscolher: (id: string) => void }) {
  if (vagas.length < 2) return null;
  return (
    <nav className="tk-vagas" aria-label="Vagas do ponto">
      {vagas.map((v) => {
        const vis = VISUAL[v.situacao];
        return (
          <button
            key={v.id} className={`tk-vaga t-${vis.tom} ${v.id === focoId ? 'foco' : ''}`}
            aria-pressed={v.id === focoId} onClick={() => aoEscolher(v.id)}
          >
            <Ic nome={vis.icone} tamanho={52} />
            <span className="tk-vaga-texto"><b>{v.apelido}</b><span>{v.rotulo}</span></span>
          </button>
        );
      })}
    </nav>
  );
}
