import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pontosParaMotorista, sessoesAtivas } from '../../domain/db';
import { Card, Badge, brl, num, Vazio } from '../../ui/kit';

export default function Mapa() {
  const [filtro, setFiltro] = useState<'todos' | 'livres' | 'baratos'>('todos');
  const nav = useNavigate();
  let lista = pontosParaMotorista();

  if (filtro === 'livres') lista = lista.filter((p) => p.vagasLivres > 0);
  if (filtro === 'baratos') lista = [...lista].sort((a, b) => a.precoAgora - b.precoAgora);

  const ativa = sessoesAtivas()[0];

  return (
    <div className="stack">
      {ativa && (
        <Card>
          <div className="row between wrap">
            <div>
              <span className="live-tag"><span className="dot pulse" /> Você tem uma recarga em andamento</span>
              <div className="tiny muted">Acompanhe o progresso em tempo real.</div>
            </div>
            <button className="btn primary" onClick={() => nav(`/motorista/recarga/${ativa.id}`)}>
              Ver recarga
            </button>
          </div>
        </Card>
      )}

      <div className="row wrap">
        {([['todos', 'Todos'], ['livres', 'Com vaga livre'], ['baratos', 'Menor preço']] as const).map(
          ([k, label]) => (
            <button key={k} className={`chip ${filtro === k ? 'on' : ''}`} onClick={() => setFiltro(k)}>
              {label}
            </button>
          ),
        )}
        <span className="tiny muted">{lista.length} pontos</span>
      </div>

      {lista.length === 0 ? (
        <Vazio>Nenhum ponto encontrado com esse filtro.</Vazio>
      ) : (
        <div className="grid g3">
          {lista.map(({ ponto, regiao, vagasLivres, totalVagas, precoAgora, potenciaKW }) => (
            <Card key={ponto.id}>
              <div className="row between">
                <div className="card-title">{ponto.nome}</div>
                <Badge tom={vagasLivres > 0 ? 'green' : 'amber'} dot>
                  {vagasLivres > 0 ? `${vagasLivres} livre${vagasLivres > 1 ? 's' : ''}` : 'Fila'}
                </Badge>
              </div>
              <div className="tiny muted" style={{ marginTop: 2 }}>
                {ponto.segmento} · {regiao.zona}, {regiao.cidade}/{regiao.uf}
              </div>

              <div className="sep" />
              <div className="row between">
                <div>
                  <div className="kpi-label">Preço agora</div>
                  <div className="kpi-value sm kpi-accent-red">{brl(precoAgora)}<span className="tiny muted">/kWh</span></div>
                </div>
                <div className="right">
                  <div className="kpi-label">Potência</div>
                  <div className="kpi-value sm">{num(potenciaKW)} kW</div>
                </div>
              </div>

              <div className="tiny muted" style={{ marginTop: 8 }}>
                {totalVagas} vaga{totalVagas > 1 ? 's' : ''} · Tipo 2 · pagamento por Pix
              </div>
              <button
                className="btn primary"
                style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
                onClick={() => nav('/motorista/recarga')}
              >
                Carregar aqui
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
