import {
  BarChart, Bar as RBar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { base, frotaPorModelo, obterPonto, regiaoDoPonto } from '../../domain/db';
import { MODELOS_CARREGADOR } from '../../domain/catalogo';
import { Card, KPI, Tabela, EstadoBadge, Badge, Nota, num, dataHora, Vazio } from '../../ui/kit';

export default function Frota() {
  const frota = frotaPorModelo();
  const carregadores = base.carregadores;

  const conta = (e: string) => carregadores.filter((c) => c.estado === e).length;
  const problemas = carregadores.filter((c) => c.estado === 'OFFLINE' || c.estado === 'MANUTENCAO');

  const potenciaInstalada = carregadores.reduce(
    (t, c) => t + MODELOS_CARREGADOR[c.modelo].potenciaKW, 0,
  );

  return (
    <div className="stack">
      <div className="grid g5">
        <KPI label="Carregadores" value={carregadores.length} accent="red"
             foot={`${base.pontos.length} pontos`} />
        <KPI label="Potência instalada" value={`${num(potenciaInstalada)} kW`} accent="teal"
             foot="capacidade somada da rede" />
        <KPI label="Ocupados agora" value={conta('OCUPADO')} />
        <KPI label="Disponíveis" value={conta('DISPONIVEL')} accent="green" />
        <KPI label="Offline / manutenção" value={problemas.length}
             accent={problemas.length ? 'red' : 'green'} />
      </div>

      {conta('OFFLINE') > 0 && (
        <Nota titulo={`${conta('OFFLINE')} carregadores sem comunicação`}>
          Sem telemetria, esses equipamentos não aceitam sessões nem respondem ao controle de
          demanda. Prioridade de atendimento técnico — cada hora offline é receita perdida para o
          franqueado e para a rede.
        </Nota>
      )}

      <div className="grid g-1-2">
        <Card title="Frota por modelo" sub="Linha HCA G2">
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={frota} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid stroke="#eef1f6" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} stroke="#7a8798" />
              <YAxis type="category" dataKey="modelo" tick={{ fontSize: 10 }} stroke="#7a8798" width={110} />
              <Tooltip />
              <RBar dataKey="qtd" fill="#0f8b8d" radius={[0, 4, 4, 0]} name="Unidades" />
            </BarChart>
          </ResponsiveContainer>
          <div className="stack tiny muted" style={{ gap: 4, marginTop: 6 }}>
            {frota.map((f) => (
              <div key={f.modelo} className="row between">
                <span>{f.modelo}</span>
                <span>{f.potenciaKW} kW · {f.qtd} un.</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Equipamentos que precisam de atenção" sub="Offline, manutenção ou sem heartbeat">
          {problemas.length === 0 ? (
            <Vazio>Toda a frota está operando normalmente.</Vazio>
          ) : (
            <Tabela cabecalho={['Ponto', 'Vaga', 'Modelo', 'Firmware', 'Último contato', 'Estado']}>
              {problemas.map((c) => {
                const ponto = obterPonto(c.pontoId);
                const regiao = ponto ? regiaoDoPonto(ponto) : undefined;
                return (
                  <tr key={c.id}>
                    <td>
                      <span className="strong">{ponto?.nome}</span>
                      <div className="tiny muted">{regiao?.cidade}/{regiao?.uf}</div>
                    </td>
                    <td className="tiny">{c.apelido}</td>
                    <td className="tiny">{c.modelo}</td>
                    <td className="tiny muted">{c.firmware}</td>
                    <td className="tiny">{dataHora(c.ultimoHeartbeat)}</td>
                    <td><EstadoBadge estado={c.estado} /></td>
                  </tr>
                );
              })}
            </Tabela>
          )}
        </Card>
      </div>

      <Card title="Toda a frota" sub="Estado de cada carregador da rede">
        <div className="scroll-y">
          <Tabela cabecalho={['Ponto', 'Vaga', 'Modelo', '#Potência', 'Protocolo', 'Firmware', 'Último contato', 'Estado']}>
            {carregadores.map((c) => {
              const ponto = obterPonto(c.pontoId);
              const modelo = MODELOS_CARREGADOR[c.modelo];
              return (
                <tr key={c.id}>
                  <td className="tiny strong">{ponto?.nome}</td>
                  <td className="tiny">{c.apelido}</td>
                  <td className="tiny">{c.modelo}</td>
                  <td className="r num">{modelo.potenciaKW} kW</td>
                  <td className="tiny">
                    <Badge tom="gray">Modbus</Badge>{' '}
                    {!modelo.suportaOCPP && <span className="muted tiny">sem OCPP</span>}
                  </td>
                  <td className="tiny muted">{c.firmware}</td>
                  <td className="tiny muted">{dataHora(c.ultimoHeartbeat)}</td>
                  <td><EstadoBadge estado={c.estado} /></td>
                </tr>
              );
            })}
          </Tabela>
        </div>
      </Card>
    </div>
  );
}
