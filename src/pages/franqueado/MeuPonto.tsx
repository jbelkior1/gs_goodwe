import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/estado';
import { carregadoresDoPonto, obterPonto, regiaoDoPonto, semSinal, sessaoDaVaga, tarifaAtual } from '../../domain/db';
import type { Ponto } from '../../domain/types';
import { ativarPonto, definirManutencao, salvarPonto } from '../../data/acoes';
import { curvaDoDia, validarPrecoBase } from '../../domain/engine/tarifa';
import { num, tarifaKWh } from '../../domain/formato';
import { Card, KPI, Nota, Tabela, EstadoBadge } from '../../ui/kit';
import { QR, linkDoApp, linkSoNesteAparelho } from '../../ui/QR';
import { ParearTotem } from '../../ui/ParearTotem';

type Aviso = { ok: boolean; texto: string } | null;

/** "1,90" ou "1.90" → 1.9. Vazio ou texto solto vira 0 (a validação recusa). */
const lerPreco = (txt: string) => Number(txt.trim().replace(',', '.'));
const mostrarPreco = (v: number) => (Number.isFinite(v) ? num(v, 2) : '');

/** Instalação e configuração do ponto: dados elétricos, preço, vagas, totem e ativação. */
export default function MeuPonto() {
  const { pontoId } = useApp();
  const ponto = obterPonto(pontoId);
  if (!ponto) return <Nota titulo="Nenhum ponto">Seu ponto aparece aqui quando a GoodWe aprovar a solicitação.</Nota>;
  // a chave recria o formulário ao trocar de ponto: o estado nasce com os dados dele
  return <PainelDoPonto key={ponto.id} ponto={ponto} />;
}

function PainelDoPonto({ ponto }: { ponto: Ponto }) {
  const vagas = carregadoresDoPonto(ponto.id);
  const [form, setForm] = useState({ nome: ponto.nome, endereco: ponto.endereco, limitePotenciaKW: ponto.limitePotenciaKW, cargaBaseKW: ponto.cargaBaseKW });
  const [precoTxt, setPrecoTxt] = useState(() => mostrarPreco(ponto.precoBaseKWh));
  const [msg, setMsg] = useState<Aviso>(null);
  const [msgAtivar, setMsgAtivar] = useState<Aviso>(null);

  const regiao = regiaoDoPonto(ponto);
  const status = ponto.status ?? (ponto.ativo ? 'ATIVO' : 'INSTALACAO');
  const operando = status === 'ATIVO';
  const tarifa = tarifaAtual(ponto.id);
  // o aparelho novo abre o totem sem ponto, mostra um código de 6 números e é pareado aqui
  const linkTotem = linkDoApp('/totem?tela=cheia');

  // validação ao vivo do preço base digitado
  const preco = lerPreco(precoTxt);
  const validacao = validarPrecoBase(preco, regiao);
  const faixaDoDia = validacao.valido
    ? curvaDoDia({ ...ponto, precoBaseKWh: preco }, regiao, 1 / Math.max(1, vagas.length), { vagasOperantes: vagas.length }).map((c) => c.precoFinalKWh)
    : [];

  const rodar = (f: () => Promise<void>, ok: string, definir: (a: Aviso) => void) => () => {
    definir(null);
    f().then(() => definir({ ok: true, texto: ok })).catch((e: Error) => definir({ ok: false, texto: e.message }));
  };
  const campo = (k: keyof typeof form, rotulo: string, tipo = 'number') => (
    <label className="stack" style={{ gap: 4 }}>
      <span className="kpi-label">{rotulo}</span>
      <input id={`campo-${k}`} className="btn" type={tipo} value={form[k]}
             onChange={(e) => { setMsg(null); setForm({ ...form, [k]: tipo === 'number' ? Number(e.target.value) : e.target.value }); }} />
    </label>
  );

  return (
    <div className="stack">
      <div className="grid g4">
        <KPI label="Situação" value={status === 'ATIVO' ? 'Ativo' : status === 'SUSPENSO' ? 'Suspenso' : 'Em instalação'} accent={status === 'ATIVO' ? 'green' : 'red'} />
        <KPI label="Formato" value={ponto.formato} foot={`${vagas.length} vaga(s)`} />
        {operando
          ? <KPI label="Preço agora" value={tarifaKWh(tarifa.precoFinalKWh)} foot={`base ${tarifaKWh(tarifa.precoBaseKWh)}`} />
          : <KPI label="Prévia do preço" value={tarifaKWh(tarifa.precoFinalKWh)} foot={status === 'SUSPENSO' ? 'ponto suspenso: sem cobrança' : 'prévia: passa a valer quando o ponto for ativado'} />}
        <KPI label="Entrada elétrica" value={`${ponto.limitePotenciaKW} kW`} foot={`${ponto.limiteCorrenteA} A`} />
      </div>

      {status === 'INSTALACAO' && (
        <Nota titulo="Ponto em instalação" tom="amber">
          Revise os dados abaixo, abra o totem no aparelho do ponto e ative. Depois de ativo, o ponto aparece no mapa do motorista.
          <div style={{ marginTop: 8 }}><button className="btn primary" onClick={rodar(() => ativarPonto(ponto.id), 'Ponto ativado.', setMsgAtivar)}>Ativar ponto</button></div>
          {msgAtivar && <div className="tiny" role="alert" style={{ marginTop: 6, color: msgAtivar.ok ? 'var(--k-ok)' : 'var(--k-red2)' }}>{msgAtivar.texto}</div>}
        </Nota>
      )}

      <div className="grid g-2-1">
        <Card title="Configuração" sub="Dados do local e preço base do kWh">
          <div className="grid g2" style={{ gap: 10 }}>
            {campo('nome', 'Nome do ponto', 'text')}
            {campo('endereco', 'Endereço', 'text')}
            <label className="stack" style={{ gap: 4 }}>
              <span className="kpi-label">Preço base (R$/kWh)</span>
              <input id="campo-precoBaseKWh" className="btn" type="text" inputMode="decimal" value={precoTxt} aria-invalid={!validacao.valido}
                     onChange={(e) => { setMsg(null); setPrecoTxt(e.target.value); }} />
            </label>
            {campo('limitePotenciaKW', 'Limite da entrada (kW)')}
            {campo('cargaBaseKW', 'Carga típica do comércio (kW)')}
          </div>
          <div className="stack" style={{ gap: 6, marginTop: 10 }}>
            {!validacao.valido && <div className="tiny" role="alert" style={{ color: 'var(--k-red2)' }}>{validacao.erro}</div>}
            {validacao.valido && validacao.aviso && <div className="tiny" style={{ color: 'var(--k-warn)' }}>{validacao.aviso}</div>}
            <div className="tiny muted">
              Sugerido para {regiao.cidade}: {tarifaKWh(validacao.sugerido)} (cobre energia, taxas e margem). Mínimo aceito: {tarifaKWh(validacao.minimo)}.{' '}
              {validacao.sugerido !== preco && (
                <button className="btn sm" type="button" onClick={() => { setMsg(null); setPrecoTxt(mostrarPreco(validacao.sugerido)); }}>Usar o sugerido</button>
              )}
            </div>
            {faixaDoDia.length > 0 && (
              <div className="tiny muted">
                Com esse preço base, o kWh varia de {tarifaKWh(Math.min(...faixaDoDia))} (vale) a {tarifaKWh(Math.max(...faixaDoDia))} (pico) em dia útil,
                sempre dentro do piso e do teto do ponto.
              </div>
            )}
          </div>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <button className="btn primary" disabled={!validacao.valido}
                    onClick={rodar(() => salvarPonto(ponto.id, { ...form, precoBaseKWh: preco }), 'Configuração salva.', setMsg)}>Salvar</button>
            {msg && <span className="tiny" role={msg.ok ? undefined : 'alert'} style={{ color: msg.ok ? 'var(--k-ok)' : 'var(--k-red2)' }}>{msg.texto}</span>}
          </div>
        </Card>
        <Card title="Totem do ponto" sub="Parear o aparelho do totem com este ponto">
          <div className="stack" style={{ gap: 12 }}>
            <ol className="tiny" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
              <li>No tablet ou monitor do totem, abra o endereço do QR abaixo.</li>
              <li>O totem mostra um código de 6 números.</li>
              <li>Digite o código aqui para ligar o totem a este ponto.</li>
            </ol>
            <div className="row" style={{ gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <QR texto={linkTotem} tamanho={132} />
              <div className="stack" style={{ gap: 6, minWidth: 0, flex: 1 }}>
                <div className="tiny muted" style={{ wordBreak: 'break-all' }}>{linkTotem}</div>
                {linkSoNesteAparelho() && (
                  <div className="tiny" style={{ color: 'var(--k-warn, #ffb020)' }}>
                    Este endereço só abre neste computador. Para outro aparelho, abra o app pelo IP da rede (npm run dev:rede) e defina VITE_URL_PUBLICA.
                  </div>
                )}
                <Link className="btn" to={`/totem?ponto=${ponto.id}&tela=vitrine`}>Ver o totem deste ponto aqui</Link>
              </div>
            </div>
            <ParearTotem pontoId={ponto.id} />
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
                <td><EstadoBadge estado={v.estado} />{v.estado !== 'OFFLINE' && semSinal(v) && <span className="tiny" style={{ color: 'var(--k-red2)', marginLeft: 6 }}>sem sinal</span>}</td>
                <td className="tiny">{s ? `${s.estado.toLowerCase()} · ${s.id}` : '—'}</td>
                <td>
                  <button className="btn" disabled={!!s} onClick={rodar(() => definirManutencao(v.id, v.estado !== 'MANUTENCAO'), 'Vaga atualizada.', setMsg)}>
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
