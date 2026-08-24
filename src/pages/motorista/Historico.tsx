import { useApp } from '../../app/estado';
import {
  sessoesDoMotorista, obterPonto, obterMotorista, obterVeiculo, cobrancaDaSessao,
} from '../../domain/db';
import { base } from '../../domain/db';
import { Card, KPI, Tabela, EstadoBadge, brl, num, dataHora, duracao, Vazio } from '../../ui/kit';

export default function Historico() {
  const { motoristaId, setMotoristaId } = useApp();
  const motorista = obterMotorista(motoristaId)!;
  const veiculo = obterVeiculo(motorista.veiculoId)!;
  const sessoes = sessoesDoMotorista(motoristaId).slice(0, 40);

  const totalKWh = sessoes.reduce((t, s) => t + s.energiaKWh, 0);
  const totalGasto = sessoes.reduce((t, s) => t + s.custoAcumulado, 0);

  return (
    <div className="stack">
      <div className="row between wrap">
        <select className="btn" value={motoristaId} onChange={(e) => setMotoristaId(e.target.value)}>
          {base.motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
        <span className="tiny muted">{veiculo.montadora} {veiculo.modelo} · {num(veiculo.capacidadeKWh, 1)} kWh</span>
      </div>

      <div className="grid g4">
        <KPI label="Recargas" value={sessoes.length} />
        <KPI label="Energia total" value={`${num(totalKWh, 1)} kWh`} accent="teal" />
        <KPI label="Gasto total" value={brl(totalGasto)} accent="red" />
        <KPI label="Custo médio" value={sessoes.length ? `${brl(totalGasto / sessoes.length)}` : '—'}
             foot="por recarga" />
      </div>

      <Card title="Minhas recargas" sub="Histórico completo com recibo">
        {sessoes.length === 0 ? (
          <Vazio>Nenhuma recarga ainda.</Vazio>
        ) : (
          <Tabela cabecalho={['Data', 'Local', 'Bateria', '#Energia', '#Duração', '#Valor', 'Status']}>
            {sessoes.map((s) => {
              const ponto = obterPonto(s.pontoId);
              const cob = cobrancaDaSessao(s.id);
              return (
                <tr key={s.id}>
                  <td className="tiny">{dataHora(s.inicio)}</td>
                  <td>{ponto?.nome ?? '—'}</td>
                  <td className="tiny num">{s.socInicial}% → {s.socAtual}%</td>
                  <td className="r num">{num(s.energiaKWh, 2)} kWh</td>
                  <td className="r num tiny">{duracao(s.inicio, s.fim)}</td>
                  <td className="r num strong">{brl(s.custoAcumulado)}</td>
                  <td><EstadoBadge estado={cob?.status ?? s.estado} /></td>
                </tr>
              );
            })}
          </Tabela>
        )}
      </Card>
    </div>
  );
}
