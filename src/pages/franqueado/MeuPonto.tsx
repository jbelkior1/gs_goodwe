import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/estado';
import { carregadoresDoPonto, obterPonto, sessaoDaVaga, tarifaAtual } from '../../domain/db';
import { ativarPonto, definirManutencao, salvarPonto } from '../../data/acoes';
import { Card, KPI, Nota, Tabela, EstadoBadge, brl } from '../../ui/kit';
import { QR, linkDoApp } from '../../ui/QR';

/** Instalação e configuração do ponto: dados elétricos, preço, vagas, totem e ativação. */
export default function MeuPonto() {
  const { pontoId } = useApp();
  const ponto = obterPonto(pontoId);
  const vagas = carregadoresDoPonto(pontoId);
  const [form, setForm] = useState({ nome: '', endereco: '', precoBaseKWh: 0, limitePotenciaKW: 0, cargaBaseKW: 0 });
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (ponto) setForm({ nome: ponto.nome, endereco: ponto.endereco, precoBaseKWh: ponto.precoBaseKWh,
      limitePotenciaKW: ponto.limitePotenciaKW, cargaBaseKW: ponto.cargaBaseKW });
  }, [pontoId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ponto) return <Nota titulo="Nenhum ponto">Seu ponto aparece aqui quando a GoodWe aprovar a solicitação.</Nota>;

  const status = ponto.status ?? (ponto.ativo ? 'ATIVO' : 'INSTALACAO');
  const linkTotem = linkDoApp(`/totem?ponto=${ponto.id}`);
  const rodar = (f: () => Promise<void>, ok: string) => () => { setMsg(''); f().then(() => setMsg(ok)).catch((e: Error) => setMsg(e.message)); };
  const campo = (k: keyof typeof form, rotulo: string, tipo = 'number') => (
    <label className="stack" style={{ gap: 4 }}>
      <span className="kpi-label">{rotulo}</span>
      <input id={`campo-${k}`} className="btn" type={tipo} value={form[k]}
             onChange={(e) => setForm({ ...form, [k]: tipo === 'number' ? Number(e.target.value) : e.target.value })} />
    </label>
  );

  return (
    <div className="stack">
      <div className="grid g4">
        <KPI label="Situação" value={status === 'ATIVO' ? 'Ativo' : status === 'SUSPENSO' ? 'Suspenso' : 'Em instalação'} accent={status === 'ATIVO' ? 'green' : 'red'} />
        <KPI label="Formato" value={ponto.formato} foot={`${vagas.length} vaga(s)`} />
        <KPI label="Preço agora" value={`${brl(tarifaAtual(ponto.id).precoFinalKWh)}/kWh`} foot={`base ${brl(ponto.precoBaseKWh)}`} />
        <KPI label="Entrada elétrica" value={`${ponto.limitePotenciaKW} kW`} foot={`${ponto.limiteCorrenteA} A`} />
      </div>

      {status === 'INSTALACAO' && (
        <Nota titulo="Ponto em instalação" tom="amber">
          Revise os dados abaixo, abra o totem no aparelho do ponto e ative. Depois de ativo, o ponto aparece no mapa do motorista.
          <div style={{ marginTop: 8 }}><button className="btn primary" onClick={rodar(() => ativarPonto(ponto.id), 'Ponto ativado.')}>Ativar ponto</button></div>
        </Nota>
      )}

      <div className="grid g-2-1">
        <Card title="Configuração" sub="Dados do local e preço base do kWh">
          <div className="grid g2" style={{ gap: 10 }}>
            {campo('nome', 'Nome do ponto', 'text')}
            {campo('endereco', 'Endereço', 'text')}
            {campo('precoBaseKWh', 'Preço base (R$/kWh)')}
            {campo('limitePotenciaKW', 'Limite da entrada (kW)')}
            {campo('cargaBaseKW', 'Carga típica do comércio (kW)')}
          </div>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <button className="btn primary" onClick={rodar(() => salvarPonto(ponto.id, form), 'Configuração salva.')}>Salvar</button>
            {msg && <span className="tiny muted">{msg}</span>}
          </div>
        </Card>
        <Card title="Totem do ponto" sub="Abra este endereço no tablet ou monitor do totem">
          <div className="stack" style={{ alignItems: 'center' }}>
            <QR texto={linkTotem} tamanho={150} />
            <Link className="btn" to={`/totem?ponto=${ponto.id}`}>Abrir o totem aqui</Link>
            <div className="tiny muted" style={{ wordBreak: 'break-all' }}>{linkTotem}</div>
          </div>
        </Card>
      </div>

      <Card title="Vagas" sub="Estado ao vivo e manutenção">
        <Tabela cabecalho={['Vaga', 'Modelo', 'Estado', 'Sessão', 'Ação']}>
          {vagas.map((v) => {
            const s = sessaoDaVaga(v.id);
            return (
              <tr key={v.id}>
                <td className="strong">{v.apelido}</td>
                <td>{v.modelo}</td>
                <td><EstadoBadge estado={v.estado} /></td>
                <td className="tiny">{s ? `${s.estado.toLowerCase()} · ${s.id}` : '—'}</td>
                <td>
                  <button className="btn" disabled={!!s} onClick={rodar(() => definirManutencao(v.id, v.estado !== 'MANUTENCAO'), 'Vaga atualizada.')}>
                    {v.estado === 'MANUTENCAO' ? 'Liberar' : 'Manutenção'}
                  </button>
                </td>
              </tr>
            );
          })}
        </Tabela>
      </Card>
    </div>
  );
}
