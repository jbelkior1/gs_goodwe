import { useParams, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  sessoesAtivas, obterSessao, telemetriaDaSessao, obterPonto, obterVeiculo, obterMotorista,
} from '../../domain/db';
import { Card, KPI, AnelSoC, brl, num, duracao, hora, Nota, Vazio, EstadoBadge } from '../../ui/kit';

export default function Recarga() {
  const { sessaoId } = useParams();
  const nav = useNavigate();
  const sessao = sessaoId ? obterSessao(sessaoId) : sessoesAtivas()[0];

  if (!sessao) return <Vazio>Nenhuma recarga em andamento.</Vazio>;

  const ponto = obterPonto(sessao.pontoId)!;
  const veiculo = obterVeiculo(sessao.veiculoId)!;
  const motorista = obterMotorista(sessao.motoristaId)!;
  const telemetria = telemetriaDaSessao(sessao.id);

  const serie = telemetria.map((t) => ({
    hora: hora(t.ts),
    potencia: t.potenciaKW,
    soc: t.soc,
  }));

  const faltaKWh = veiculo.capacidadeKWh * ((100 - sessao.socAtual) / 100);
  const minutosRestantes = sessao.potenciaAtualKW > 0
    ? Math.round((faltaKWh / sessao.potenciaAtualKW) * 60)
    : 0;

  return (
    <div className="stack">
      <div className="grid g-2-1">
        <Card>
          <div className="row between wrap" style={{ alignItems: 'center', gap: 20 }}>
            <AnelSoC soc={sessao.socAtual} tamanho={150} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="row" style={{ gap: 8 }}>
                <EstadoBadge estado={sessao.estado} />
                <span className="tiny muted">{veiculo.montadora} {veiculo.modelo}</span>
              </div>
              <div className="kpi-value" style={{ marginTop: 8 }}>
                {num(sessao.potenciaAtualKW, 1)} kW
              </div>
              <div className="kpi-foot">
                Entregues {num(sessao.energiaKWh, 2)} kWh · começou em {sessao.socInicial}%
              </div>
              <div className="sep" />
              <div className="row between">
                <div>
                  <div className="kpi-label">Tempo</div>
                  <div className="strong">{duracao(sessao.inicio)}</div>
                </div>
                <div>
                  <div className="kpi-label">Falta (est.)</div>
                  <div className="strong">{minutosRestantes} min</div>
                </div>
                <div className="right">
                  <div className="kpi-label">Custo até agora</div>
                  <div className="strong kpi-accent-red">{brl(sessao.custoAcumulado)}</div>
                </div>
              </div>
            </div>
          </div>
          {sessao.estado === 'PAUSADO' && (
            <Nota titulo="Recarga pausada" tom="amber">
              {sessao.motivoPausa ?? 'Sem potência disponível no momento. A recarga volta sozinha assim que houver folga na entrada elétrica do local.'}
            </Nota>
          )}
        </Card>

        <div className="stack">
          <KPI label="Local" value={ponto.nome} sm foot={ponto.endereco} />
          <KPI label="Preço travado" value={`${brl(sessao.tarifaAplicadaKWh)}/kWh`} sm accent="red"
               foot="Preço confirmado no início da sessão" />
          <KPI label="Identificado por" value={sessao.autorizacao} sm
               foot={`${motorista.nome} · RFID ${motorista.rfidUid}`} />
        </div>
      </div>

      <Card title="Potência e bateria durante a sessão"
            sub="Acima de 80% a corrente cai sozinha — é o carro que decide (curva CC/CV)">
        {serie.length > 1 ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={serie}>
              <CartesianGrid stroke="#eef1f6" vertical={false} />
              <XAxis dataKey="hora" tick={{ fontSize: 11 }} stroke="#7a8798" minTickGap={30} />
              <YAxis yAxisId="p" tick={{ fontSize: 11 }} stroke="#7a8798" unit=" kW" />
              <YAxis yAxisId="s" orientation="right" tick={{ fontSize: 11 }} stroke="#7a8798" unit="%" domain={[0, 100]} />
              <Tooltip />
              <Line yAxisId="p" type="monotone" dataKey="potencia" stroke="#0f8b8d" strokeWidth={2} dot={false} name="Potência" />
              <Line yAxisId="s" type="monotone" dataKey="soc" stroke="#e4002b" strokeWidth={2} dot={false} name="Bateria" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <Vazio>Coletando telemetria...</Vazio>
        )}
      </Card>

      <div className="row">
        <button className="btn primary" onClick={() => nav(`/motorista/pagamento/${sessao.id}`)}>
          Encerrar e pagar
        </button>
        <button className="btn" onClick={() => nav('/motorista')}>Voltar ao mapa</button>
      </div>
    </div>
  );
}
