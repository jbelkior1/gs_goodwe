import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../../app/estado';
import { carregadoresDoPonto, obterMotorista, obterPonto, sessaoPorCodigo, tarifaAtual } from '../../domain/db';
import { vincularSessao } from '../../data/acoes';
import { VEICULOS } from '../../domain/catalogo';
import { Card, KPI, Nota, brl } from '../../ui/kit';

/** Destino do QR do totem: confirma o preço e assume a recarga. */
export default function Vincular() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { perfil } = useApp();
  const [codigo, setCodigo] = useState(params.get('c') ?? '');
  const [soc, setSoc] = useState('');
  const [limite, setLimite] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const sessao = codigo.length === 4 ? sessaoPorCodigo(codigo) : undefined;
  const motorista = obterMotorista(perfil?.motoristaId);
  const [veiculoId, setVeiculoId] = useState(motorista?.veiculoId ?? 'v-dolphin');

  if (!perfil) {
    return (
      <Card title="Entre para carregar">
        <div className="stack">
          <div className="tiny muted">Faça login para assumir a recarga do código {codigo || '—'}.</div>
          <Link className="btn primary" to={`/entrar?volta=${encodeURIComponent(`/motorista/vincular?c=${codigo}`)}`}>Entrar ou criar conta</Link>
        </div>
      </Card>
    );
  }

  const ponto = sessao ? obterPonto(sessao.pontoId) : undefined;
  const vaga = sessao ? carregadoresDoPonto(sessao.pontoId).find((c) => c.id === sessao.carregadorId) : undefined;
  const tarifa = sessao ? tarifaAtual(sessao.pontoId) : undefined;

  const confirmar = async () => {
    if (!sessao) return;
    setErro(''); setOcupado(true);
    try {
      const s = await vincularSessao(sessao, perfil.motoristaId ?? perfil.id, veiculoId,
        soc ? Number(soc) : undefined, limite ? Number(limite) : undefined);
      nav(`/motorista/recarga/${s.id}`);
    } catch (e) {
      setErro((e as Error).message);
    } finally { setOcupado(false); }
  };

  return (
    <div className="stack">
      <Card title="Confirmar recarga" sub="Código que aparece no totem">
        <input id="codigo" className="btn" value={codigo} maxLength={4} placeholder="Ex.: 7K4Q"
               onChange={(e) => setCodigo(e.target.value.toUpperCase())}
               style={{ fontSize: 22, letterSpacing: '.3em', textAlign: 'center', width: '100%' }} />
      </Card>
      {codigo.length === 4 && !sessao && (
        <Nota titulo="Código não encontrado" tom="amber">Confira o código no totem. Ele vale por 10 minutos depois que o cabo é conectado.</Nota>
      )}
      {sessao && ponto && tarifa && (
        <Card title={ponto.nome} sub={`${vaga?.apelido ?? 'Vaga'} · ${vaga?.modelo ?? ''}`}>
          <div className="stack">
            <KPI label="Preço do kWh (travado ao confirmar)" value={`${brl(tarifa.precoFinalKWh)}/kWh`} accent="red" sm
                 foot={tarifa.explicacao.join(' · ')} />
            <select id="veiculo" className="btn" value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
              {VEICULOS.map((v) => <option key={v.id} value={v.id}>{v.montadora} {v.modelo}</option>)}
            </select>
            <input id="soc" className="btn" type="number" min={0} max={100} placeholder="Bateria agora, em % (opcional)" value={soc} onChange={(e) => setSoc(e.target.value)} />
            <input id="limite" className="btn" type="number" min={1} placeholder="Limite em R$ (opcional)" value={limite} onChange={(e) => setLimite(e.target.value)} />
            {erro && <div className="tiny" style={{ color: 'var(--k-red2)' }}>{erro}</div>}
            <button className="btn primary" disabled={ocupado} style={{ justifyContent: 'center' }} onClick={confirmar}>
              {ocupado ? 'Confirmando…' : 'Iniciar recarga'}
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
