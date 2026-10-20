import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../app/estado';
import { pontosParaMotorista, sessaoDoMotorista } from '../../domain/db';
import { MapaRede } from '../../ui/MapaRede';
import { Card, Badge, brl, num, Nota } from '../../ui/kit';

/** "Onde carregar": pontos ativos, vagas livres agora e preço do kWh no momento. */
export default function Mapa() {
  const { motoristaId, perfil } = useApp();
  const nav = useNavigate();
  const pontos = pontosParaMotorista();
  const [sel, setSel] = useState<string | undefined>(pontos[0]?.ponto.id);
  const minha = sessaoDoMotorista(perfil?.motoristaId ?? motoristaId);

  return (
    <div className="stack">
      {minha && (
        <Nota titulo="Você tem uma recarga em andamento" tom="teal">
          <button className="btn primary" onClick={() => nav(`/motorista/recarga/${minha.id}`)}>Ver minha recarga</button>
        </Nota>
      )}
      <Card title="Pontos perto de você" sub="Disponibilidade em tempo real">
        <MapaRede
          pontos={pontos.map((p) => ({ ponto: p.ponto, regiao: p.regiao, vagasLivres: p.vagasLivres, totalVagas: p.totalVagas, precoAgora: p.precoAgora }))}
          selecionado={sel}
          aoSelecionar={setSel}
          compacto
        />
      </Card>
      <div className="stack" style={{ gap: 8 }}>
        {pontos.map((p) => (
          <button key={p.ponto.id} className="card" onClick={() => setSel(p.ponto.id)}
                  style={{ textAlign: 'left', cursor: 'pointer', color: 'var(--k-text)', borderColor: sel === p.ponto.id ? 'var(--k-red)' : undefined }}>
            <div className="row between">
              <span className="strong">{p.ponto.nome}</span>
              <Badge tom={p.vagasLivres > 0 ? 'green' : 'amber'} dot>{p.vagasLivres}/{p.totalVagas} livres</Badge>
            </div>
            <div className="tiny muted">{p.regiao.zona}, {p.regiao.cidade} · {num(p.potenciaKW)} kW · {brl(p.precoAgora)}/kWh agora</div>
          </button>
        ))}
      </div>
      <Nota titulo="Como carregar" tom="amber">
        Conecte o cabo na vaga e leia o QR que aparece no totem com a câmera do celular.
      </Nota>
    </div>
  );
}
