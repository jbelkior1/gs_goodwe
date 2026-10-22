import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../../app/estado';
import { base, carregadoresDoPonto, obterPonto, obterSessao } from '../../domain/db';
import { pagarCobranca } from '../../data/acoes';
import { brl, horaMin, num, tarifaKWh } from '../../domain/formato';
import { Badge, Card, Nota } from '../../ui/kit';
import { Icone } from '../../ui/icones';

const DEMO = import.meta.env.VITE_MODO_DEMO === 'true';

/**
 * Pagamento pelo celular, a partir do QR do Pix do totem (modo demonstração). Faz o papel do app do
 * banco: mostra o valor e, ao tocar em Pagar, confirma o Pix (o mesmo que "Simular pagamento"); o
 * totem, o app e os painéis veem a cobrança paga em tempo real. Fora da demonstração o totem mostra o
 * Pix de verdade, lido pelo app do banco, e esta tela não é usada.
 */
export default function Pagar() {
  useApp();
  const { cobrancaId } = useParams();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  const cobranca = base.cobrancas.find((c) => c.id === cobrancaId);
  const sessao = cobranca ? obterSessao(cobranca.sessaoId) : undefined;
  const ponto = cobranca ? obterPonto(cobranca.pontoId) : undefined;
  const vaga = sessao ? carregadoresDoPonto(sessao.pontoId).find((c) => c.id === sessao.carregadorId) : undefined;

  if (!cobranca) {
    return (
      <Nota titulo="Cobrança não encontrada" tom="amber">
        Leia de novo o QR do Pix que aparece no totem. Se a recarga acabou de fechar, espere alguns segundos.
      </Nota>
    );
  }

  const pagar = async () => {
    setErro(''); setOcupado(true);
    try { await pagarCobranca(cobranca); } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  };

  if (cobranca.status === 'PAGO') {
    return (
      <Card title="Pagamento confirmado">
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <Icone nome="check" tamanho={54} cor="var(--k-ok)" />
          <div className="kpi-value">{brl(cobranca.valor)}</div>
          <Badge tom="green" dot>Pago via Pix{cobranca.pagaEm ? ` às ${horaMin(cobranca.pagaEm)}` : ''}</Badge>
          <div className="tiny muted">O totem já mostra o recibo. Pode retirar o cabo.</div>
          {sessao && (
            <Link className="btn" style={{ width: '100%', justifyContent: 'center' }} to={`/motorista/recarga/${sessao.id}`}>Ver o recibo</Link>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="stack">
      <Card title="Pagar com Pix" sub={ponto ? `${ponto.nome}${vaga ? ` · ${vaga.apelido}` : ''}` : undefined}>
        <div className="stack" style={{ gap: 10 }}>
          <div className="kpi-label">Total a pagar</div>
          <div className="kpi-value" style={{ fontSize: 40 }}>{brl(cobranca.valor)}</div>
          {sessao && (
            <div className="tiny muted">
              {num(sessao.energiaKWh, 2)} kWh × {tarifaKWh(sessao.tarifaAplicadaKWh)} · recarga fechada{sessao.fim ? ` às ${horaMin(sessao.fim)}` : ''}
            </div>
          )}
          <div className="tiny muted">Recebedor: Ponto W{ponto ? ` · ${ponto.nome}` : ''} · txid {cobranca.txid}</div>
          {erro && <div className="tiny" role="alert" style={{ color: 'var(--k-red2)' }}>{erro}</div>}
          <button className="btn primary" disabled={ocupado || !DEMO} style={{ justifyContent: 'center', minHeight: 48, fontSize: 15 }} onClick={pagar}>
            {ocupado ? 'Pagando…' : `Pagar ${brl(cobranca.valor)}`}
          </button>
        </div>
      </Card>
      <Nota titulo={DEMO ? 'Pagamento de demonstração' : 'Pague pelo app do seu banco'} tom="gray">
        {DEMO
          ? 'Esta tela faz o papel do app do banco: o toque em Pagar confirma o Pix e o totem muda para "Pagamento recebido" na hora. Nenhum dinheiro de verdade é movimentado.'
          : 'Abra o app do seu banco e leia o QR do Pix que aparece no totem.'}
      </Nota>
    </div>
  );
}
