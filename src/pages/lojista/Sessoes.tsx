import { useMemo, useState } from 'react';
import { useApp } from '../../app/estado';
import {
  sessoesDoPonto, obterMotorista, obterVeiculo, cobrancaDaSessao, carregadoresDoPonto,
} from '../../domain/db';
import { Card, KPI, Tabela, EstadoBadge, brl, num, dataHora, duracao, Vazio } from '../../ui/kit';

type Filtro = 'todas' | 'hoje' | '7d' | '30d';

export default function Sessoes() {
  const { pontoId } = useApp();
  const [filtro, setFiltro] = useState<Filtro>('30d');
  const [busca, setBusca] = useState('');
  const carregadores = carregadoresDoPonto(pontoId);

  const sessoes = useMemo(() => {
    const dias = filtro === 'hoje' ? 1 : filtro === '7d' ? 7 : filtro === '30d' ? 30 : 3650;
    const corte = Date.now() - dias * 86400000;
    return sessoesDoPonto(pontoId)
      .filter((s) => new Date(s.inicio).getTime() >= corte)
      .filter((s) => {
        if (!busca.trim()) return true;
        const m = obterMotorista(s.motoristaId);
        return (m?.nome ?? '').toLowerCase().includes(busca.toLowerCase()) ||
               s.id.includes(busca);
      })
      .sort((a, b) => b.inicio.localeCompare(a.inicio));
  }, [pontoId, filtro, busca]);

  const energia = sessoes.reduce((t, s) => t + s.energiaKWh, 0);
  const receita = sessoes.reduce((t, s) => t + s.custoAcumulado, 0);
  const duracaoMedia = sessoes.length
    ? sessoes.reduce((t, s) => {
        const fim = s.fim ? new Date(s.fim).getTime() : Date.now();
        return t + (fim - new Date(s.inicio).getTime()) / 60000;
      }, 0) / sessoes.length
    : 0;

  return (
    <div className="stack">
      <div className="grid g4">
        <KPI label="Sessões no período" value={sessoes.length} />
        <KPI label="Energia" value={`${num(energia, 1)} kWh`} accent="teal" />
        <KPI label="Receita" value={brl(receita)} accent="red" />
        <KPI label="Duração média" value={`${num(duracaoMedia, 0)} min`}
             foot="quanto tempo o cliente fica no local" />
      </div>

      <Card
        title="Todas as recargas"
        action={
          <div className="row wrap">
            <input
              className="btn" placeholder="Buscar motorista..." value={busca}
              onChange={(e) => setBusca(e.target.value)} style={{ minWidth: 170 }}
            />
            {([['hoje', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['todas', 'Tudo']] as const).map(
              ([k, l]) => (
                <button key={k} className={`chip ${filtro === k ? 'on' : ''}`} onClick={() => setFiltro(k)}>
                  {l}
                </button>
              ),
            )}
          </div>
        }
      >
        {sessoes.length === 0 ? (
          <Vazio>Nenhuma sessão no período.</Vazio>
        ) : (
          <div className="scroll-y">
            <Tabela cabecalho={['Início', 'Vaga', 'Motorista', 'Bateria', '#Energia', '#Duração', '#Valor', 'Auth', 'Status']}>
              {sessoes.slice(0, 150).map((s) => {
                const m = obterMotorista(s.motoristaId);
                const v = obterVeiculo(s.veiculoId);
                const c = carregadores.find((x) => x.id === s.carregadorId);
                const cob = cobrancaDaSessao(s.id);
                return (
                  <tr key={s.id}>
                    <td className="tiny">{dataHora(s.inicio)}</td>
                    <td className="tiny">{c?.apelido ?? '—'}</td>
                    <td>
                      {m?.nome}
                      <div className="tiny muted">{v?.montadora} {v?.modelo}</div>
                    </td>
                    <td className="tiny num">{s.socInicial}%→{Math.round(s.socAtual)}%</td>
                    <td className="r num">{num(s.energiaKWh, 2)}</td>
                    <td className="r num tiny">{duracao(s.inicio, s.fim)}</td>
                    <td className="r num strong">{brl(s.custoAcumulado)}</td>
                    <td className="tiny muted">{s.autorizacao}</td>
                    <td><EstadoBadge estado={cob?.status ?? s.estado} /></td>
                  </tr>
                );
              })}
            </Tabela>
            {sessoes.length > 150 && (
              <div className="tiny muted" style={{ padding: 10 }}>
                Mostrando 150 de {sessoes.length} sessões.
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
