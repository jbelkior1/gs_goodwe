import { useApp } from '../../app/estado';
import {
  carregadoresDoPonto, sessoesAtivas, obterMotorista, obterVeiculo, demandaDoPonto,
} from '../../domain/db';
import { MODELOS_CARREGADOR } from '../../domain/catalogo';
import { Card, KPI, EstadoBadge, AnelSoC, Badge, brl, num, duracao, Nota } from '../../ui/kit';

export default function Carregadores() {
  const { pontoId } = useApp();
  const carregadores = carregadoresDoPonto(pontoId);
  const ativas = sessoesAtivas(pontoId);
  const d = demandaDoPonto(pontoId);

  const porEstado = (e: string) => carregadores.filter((c) => c.estado === e).length;

  return (
    <div className="stack">
      <div className="grid g4">
        <KPI label="Vagas" value={carregadores.length} />
        <KPI label="Ocupadas" value={porEstado('OCUPADO')} accent="teal" />
        <KPI label="Disponíveis" value={porEstado('DISPONIVEL')} accent="green" />
        <KPI label="Offline / manutenção" value={porEstado('OFFLINE') + porEstado('MANUTENCAO')}
             accent={porEstado('OFFLINE') > 0 ? 'red' : undefined} />
      </div>

      {porEstado('OFFLINE') > 0 && (
        <Nota titulo="Carregador sem comunicação">
          Há vaga sem enviar telemetria. Verifique a rede do local ou o link Modbus/RS-485 —
          enquanto estiver offline, ela não aceita novas sessões.
        </Nota>
      )}

      <div className="grid g3">
        {carregadores.map((c) => {
          const sessao = ativas.find((s) => s.carregadorId === c.id);
          const motorista = sessao ? obterMotorista(sessao.motoristaId) : undefined;
          const veiculo = sessao ? obterVeiculo(sessao.veiculoId) : undefined;
          const modelo = MODELOS_CARREGADOR[c.modelo];
          const aloc = d.alocacoes.find((a) => a.carregadorId === c.id);

          return (
            <Card key={c.id}>
              <div className="row between">
                <div>
                  <div className="card-title">{c.apelido}</div>
                  <div className="tiny muted">{c.modelo} · {modelo.potenciaKW} kW · {modelo.fases === 1 ? 'monofásico' : 'trifásico'}</div>
                </div>
                <EstadoBadge estado={c.estado} />
              </div>

              <div className="sep" />

              {sessao ? (
                <div className="row" style={{ gap: 14 }}>
                  <AnelSoC soc={sessao.socAtual} tamanho={86} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="strong tiny">{motorista?.nome}</div>
                    <div className="tiny muted">{veiculo?.montadora} {veiculo?.modelo}</div>
                    <div className="kpi-value sm" style={{ marginTop: 6 }}>
                      {num(aloc?.potenciaConcedidaKW ?? sessao.potenciaAtualKW, 1)} kW
                    </div>
                    <div className="tiny muted">
                      {duracao(sessao.inicio)} · {num(sessao.energiaKWh, 1)} kWh · {brl(sessao.custoAcumulado)}
                    </div>
                    {aloc?.limitado && <div style={{ marginTop: 5 }}><Badge tom="teal">Potência reduzida</Badge></div>}
                    {aloc?.pausado && <div style={{ marginTop: 5 }}><Badge tom="amber">Pausado pelo controle</Badge></div>}
                  </div>
                </div>
              ) : (
                <div className="tiny muted" style={{ padding: '14px 0' }}>
                  {c.estado === 'DISPONIVEL' ? 'Vaga livre, pronta para uso.'
                    : c.estado === 'OFFLINE' ? 'Sem comunicação com a plataforma.'
                      : 'Fora de operação.'}
                </div>
              )}

              <div className="sep" />
              <div className="row between tiny muted">
                <span>{c.firmware}</span>
                <span>Modbus RTU · sem OCPP</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
