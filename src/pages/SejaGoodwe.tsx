import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/estado';
import { base } from '../domain/db';
import { enviarSolicitacao } from '../data/acoes';
import { REGIOES, SEGMENTOS } from '../domain/catalogo';
import { EstadoBadge } from '../ui/kit';
import type { FormatoFranquia, SegmentoComercio } from '../domain/types';

/** Pedido de franquia: o comerciante preenche, a IA calcula o score e a GoodWe decide. */
export default function SejaGoodwe() {
  const { perfil } = useApp();
  const [f, setF] = useState({ comercio: '', cnpj: '', regiaoId: REGIOES[0].id, segmento: SEGMENTOS[0] as SegmentoComercio,
    formatoDesejado: 'Standard' as FormatoFranquia, cargaDisponivelKW: 30, fluxoDiarioPessoas: 600 });
  const [msg, setMsg] = useState('');
  const minhas = base.homologacoes.filter((h) => perfil && h.solicitanteId === perfil.id);

  const enviar = () => {
    if (!perfil) return;
    setMsg('');
    enviarSolicitacao(f, perfil.id).then(() => setMsg('Solicitação enviada. A GoodWe vai analisar.')).catch((e: Error) => setMsg(e.message));
  };
  const linha = (rotulo: string, el: React.ReactNode) => (
    <label className="stack" style={{ gap: 4 }}><span className="kpi-label">{rotulo}</span>{el}</label>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--k-bg)', padding: '32px 16px' }}>
      <div className="stack" style={{ maxWidth: 560, margin: '0 auto' }}>
        <div>
          <div className="kpi-label">Rede Ponto W · GoodWe</div>
          <h1 style={{ margin: '4px 0' }}>Seja GoodWe</h1>
          <div className="muted">Leve a recarga para o seu comércio. O cliente fica de 1 a 2 horas e compra na sua loja.</div>
        </div>
        {!perfil ? (
          <div className="card stack">
            <div>Entre ou crie uma conta para pedir a franquia.</div>
            <Link className="btn primary" to="/entrar?volta=/seja-goodwe">Entrar ou criar conta</Link>
          </div>
        ) : (
          <div className="card stack">
            {linha('Nome do comércio', <input id="comercio" className="btn" value={f.comercio} onChange={(e) => setF({ ...f, comercio: e.target.value })} />)}
            {linha('CNPJ', <input id="cnpj" className="btn" value={f.cnpj} onChange={(e) => setF({ ...f, cnpj: e.target.value })} />)}
            {linha('Região', (
              <select id="regiao" className="btn" value={f.regiaoId} onChange={(e) => setF({ ...f, regiaoId: e.target.value })}>
                {REGIOES.map((r) => <option key={r.id} value={r.id}>{r.zona}, {r.cidade}/{r.uf}</option>)}
              </select>))}
            {linha('Segmento', (
              <select id="segmento" className="btn" value={f.segmento} onChange={(e) => setF({ ...f, segmento: e.target.value as SegmentoComercio })}>
                {SEGMENTOS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>))}
            {linha('Formato', (
              <select id="formato" className="btn" value={f.formatoDesejado} onChange={(e) => setF({ ...f, formatoDesejado: e.target.value as FormatoFranquia })}>
                <option value="Light">Light · 1 vaga</option><option value="Standard">Standard · 2 vagas</option><option value="Hub">Hub · 4 vagas</option>
              </select>))}
            {linha('Carga elétrica disponível (kW)', <input id="carga" className="btn" type="number" value={f.cargaDisponivelKW} onChange={(e) => setF({ ...f, cargaDisponivelKW: Number(e.target.value) })} />)}
            {linha('Fluxo de pessoas por dia', <input id="fluxo" className="btn" type="number" value={f.fluxoDiarioPessoas} onChange={(e) => setF({ ...f, fluxoDiarioPessoas: Number(e.target.value) })} />)}
            <button className="btn primary" style={{ justifyContent: 'center' }} disabled={!f.comercio} onClick={enviar}>Enviar solicitação</button>
            {msg && <div className="tiny muted">{msg}</div>}
          </div>
        )}
        {minhas.length > 0 && (
          <div className="card stack">
            <div className="strong">Minhas solicitações</div>
            {minhas.map((h) => (
              <div key={h.id} className="row between">
                <span>{h.comercio} · score {Math.round(h.scoreViabilidade)}</span>
                <EstadoBadge estado={h.status} />
              </div>
            ))}
            {minhas.some((h) => h.status === 'APROVADO') && <Link className="btn primary" to="/franqueado/ponto">Ir para o meu ponto</Link>}
          </div>
        )}
      </div>
    </div>
  );
}
