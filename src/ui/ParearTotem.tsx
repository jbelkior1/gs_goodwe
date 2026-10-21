import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { parearTotem, totensDoPonto, type TotemPareado } from '../data/totens';
import { dataHora, relativo } from '../domain/formato';

type Situacao = 'ocioso' | 'ocupado' | 'ok' | 'erro';

/**
 * Passo 4 do fluxograma, no painel do comércio: o franqueado digita o código de 6 números que o
 * totem mostra na tela e o aparelho passa a exibir este ponto. Encaixar no Meu ponto e totem.
 */
export function ParearTotem({ pontoId }: { pontoId: string }) {
  const [codigo, setCodigo] = useState('');
  const [situacao, setSituacao] = useState<Situacao>('ocioso');
  const [msg, setMsg] = useState('');
  const [totens, setTotens] = useState<TotemPareado[]>([]);

  const carregar = useCallback(() => {
    totensDoPonto(pontoId).then(setTotens).catch(() => { /* lista é só informativa */ });
  }, [pontoId]);
  useEffect(() => {
    carregar();
    const id = window.setInterval(carregar, 15000);
    return () => window.clearInterval(id);
  }, [carregar]);

  const pronto = codigo.length === 6;
  const parear = async (e: FormEvent) => {
    e.preventDefault();
    if (!pronto || situacao === 'ocupado') return;
    setSituacao('ocupado'); setMsg('');
    try {
      await parearTotem(codigo, pontoId);
      setSituacao('ok'); setMsg('Totem pareado. A tela dele já mostra este ponto.');
      setCodigo('');
      carregar();
    } catch (er) {
      setSituacao('erro'); setMsg((er as Error).message);
    }
  };

  return (
    <div className="stack" style={{ gap: 10, width: '100%' }}>
      <div className="tiny muted">
        No aparelho do totem, abra o endereço do totem: ele mostra um código de 6 números. Digite o código aqui.
        Não confunda com o código da recarga, de 4 letras, que o motorista digita no app.
      </div>
      <form className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }} onSubmit={parear}>
        <input
          id="codigo-totem" className="btn" inputMode="numeric" autoComplete="off" pattern="[0-9]*" maxLength={6}
          placeholder="000000" value={codigo} aria-label="Código de 6 números mostrado no totem"
          onChange={(e) => { setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6)); if (situacao !== 'ocupado') setSituacao('ocioso'); }}
          style={{ fontFamily: 'var(--mono)', fontSize: 22, letterSpacing: '.35em', textAlign: 'center', width: 190 }}
        />
        <button className="btn primary" type="submit" disabled={!pronto || situacao === 'ocupado'}>
          {situacao === 'ocupado' ? 'Pareando…' : 'Parear totem'}
        </button>
      </form>
      {situacao === 'erro' && <div className="tiny" role="alert" style={{ color: 'var(--k-red2)' }}>{msg}</div>}
      {situacao === 'ok' && <div className="tiny" role="status" style={{ color: 'var(--k-ok)' }}>{msg}</div>}
      {totens.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <span className="kpi-label">Totens deste ponto</span>
          {totens.map((t) => (
            <div key={t.id} className="tiny muted">
              {t.id}
              {t.pareadoEm ? ` · pareado em ${dataHora(t.pareadoEm)}` : ''}
              {t.ultimoSinal ? ` · último sinal ${relativo(t.ultimoSinal)}` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
