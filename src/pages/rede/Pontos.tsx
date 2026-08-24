import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  rankingPontos, regiaoDoPonto, obterFranqueado, economiaDoPonto, carregadoresDoPonto,
} from '../../domain/db';
import { REGRAS } from '../../domain/catalogo';
import { useApp } from '../../app/estado';
import { Card, KPI, Tabela, Badge, brl, num, dataCurta, Vazio } from '../../ui/kit';

export default function Pontos() {
  const [busca, setBusca] = useState('');
  const [somenteAtencao, setSomenteAtencao] = useState(false);
  const { setPontoId, setPersona } = useApp();
  const nav = useNavigate();

  let lista = rankingPontos();
  if (busca.trim()) {
    const q = busca.toLowerCase();
    lista = lista.filter(
      (r) => r.ponto.nome.toLowerCase().includes(q) ||
             regiaoDoPonto(r.ponto).cidade.toLowerCase().includes(q),
    );
  }
  if (somenteAtencao) {
    lista = lista.filter((r) => r.kpis.horasUsoDia < REGRAS.limiarViabilidadeHoras);
  }

  const abrirComoLojista = (id: string) => {
    setPontoId(id);
    setPersona('lojista');
    nav('/lojista');
  };

  const totalCapex = lista.reduce((t, r) => t + economiaDoPonto(r.ponto.id).capex, 0);

  return (
    <div className="stack">
      <div className="grid g4">
        <KPI label="Pontos listados" value={lista.length} />
        <KPI label="Investimento da rede" value={brl(totalCapex)} foot="CAPEX somado dos franqueados" />
        <KPI label="Faturamento somado" value={brl(lista.reduce((t, r) => t + r.kpis.faturamentoMes, 0))}
             accent="red" foot="no mês" />
        <KPI label="Precisam de atenção"
             value={lista.filter((r) => r.kpis.horasUsoDia < REGRAS.limiarViabilidadeHoras).length}
             accent="red" foot={`abaixo de ${REGRAS.limiarViabilidadeHoras} h/dia`} />
      </div>

      <Card
        title="Pontos e franqueados"
        sub="Clique em um ponto para abrir o painel dele"
        action={
          <div className="row wrap">
            <input className="btn" placeholder="Buscar ponto ou cidade..." value={busca}
                   onChange={(e) => setBusca(e.target.value)} style={{ minWidth: 190 }} />
            <button className={`chip ${somenteAtencao ? 'on' : ''}`}
                    onClick={() => setSomenteAtencao((v) => !v)}>
              Só os críticos
            </button>
          </div>
        }
      >
        {lista.length === 0 ? (
          <Vazio>Nenhum ponto encontrado.</Vazio>
        ) : (
          <Tabela cabecalho={[
            'Ponto', 'Franqueado', 'Formato', 'Local', '#Vagas', '#Sessões',
            '#Faturamento', '#Uso/dia', '#Payback', '',
          ]}>
            {lista.map((r) => {
              const regiao = regiaoDoPonto(r.ponto);
              const franqueado = obterFranqueado(r.ponto.franqueadoId);
              const eco = economiaDoPonto(r.ponto.id);
              const vagas = carregadoresDoPonto(r.ponto.id).length;
              return (
                <tr key={r.ponto.id}>
                  <td>
                    <span className="strong">{r.ponto.nome}</span>
                    <div className="tiny muted">desde {dataCurta(r.ponto.inauguradoEm)}</div>
                  </td>
                  <td className="tiny">
                    {franqueado?.nome}
                    <div className="muted">{franqueado?.cnpj}</div>
                  </td>
                  <td><Badge tom="gray">{r.ponto.formato}</Badge></td>
                  <td className="tiny">
                    {regiao.cidade}/{regiao.uf}
                    <div className="muted">{r.ponto.segmento}</div>
                  </td>
                  <td className="r num">{vagas}</td>
                  <td className="r num">{r.kpis.sessoesMes}</td>
                  <td className="r num strong">{brl(r.kpis.faturamentoMes)}</td>
                  <td className="r">
                    <Badge tom={eco.acimaDoLimiar ? 'green' : 'red'}>
                      {num(r.kpis.horasUsoDia, 1)} h
                    </Badge>
                  </td>
                  <td className="r num tiny">
                    {eco.paybackMeses === Infinity ? '—' : `${num(eco.paybackMeses, 0)} m`}
                  </td>
                  <td className="r">
                    <button className="btn sm" onClick={() => abrirComoLojista(r.ponto.id)}>Abrir</button>
                  </td>
                </tr>
              );
            })}
          </Tabela>
        )}
      </Card>
    </div>
  );
}
