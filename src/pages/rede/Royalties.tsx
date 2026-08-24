import {
  BarChart, Bar as RBar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { base, rankingPontos, kpisDaRede, noMesAtual, regiaoDoPonto } from '../../domain/db';
import { FORMATOS, REGRAS } from '../../domain/catalogo';
import { Card, KPI, Tabela, Badge, brl, num, Nota, tipBRL } from '../../ui/kit';

export default function Royalties() {
  const k = kpisDaRede();
  const ranking = rankingPontos();

  const cobrancasMes = base.cobrancas.filter((c) => noMesAtual(c.criadaEm) && c.status === 'PAGO');
  const royalty = cobrancasMes.reduce((t, c) => t + c.royaltyGoodWe, 0);
  const fundo = cobrancasMes.reduce((t, c) => t + c.fundoMarketing, 0);
  const plataforma = base.pontos.filter((p) => p.ativo).length * REGRAS.plataformaMes;
  const totalRecorrente = royalty + fundo + plataforma;

  // receita de entrada acumulada (taxas de franquia já pagas pelos pontos existentes)
  const entradaAcumulada = base.pontos.reduce(
    (t, p) => t + FORMATOS[p.formato].taxaFranquia, 0,
  );

  const porPonto = ranking.slice(0, 12).map((r) => ({
    nome: r.ponto.nome.length > 14 ? r.ponto.nome.slice(0, 13) + '…' : r.ponto.nome,
    royalty: Number((r.kpis.faturamentoMes * REGRAS.royaltyPct).toFixed(2)),
    fundo: Number((r.kpis.faturamentoMes * REGRAS.fundoPct).toFixed(2)),
  }));

  return (
    <div className="stack">
      <div className="grid g4">
        <KPI label="Recorrente no mês" value={brl(totalRecorrente)} accent="red"
             foot="royalties + fundo + plataforma" />
        <KPI label="Royalties (6%)" value={brl(royalty)} accent="green" foot="sobre a recarga" />
        <KPI label="Fundo de marketing (2%)" value={brl(fundo)} foot="divulgação da rede" />
        <KPI label="Plataforma" value={brl(plataforma)}
             foot={`${base.pontos.filter((p) => p.ativo).length} pontos × ${brl(REGRAS.plataformaMes)}`} />
      </div>

      <div className="grid g4">
        <KPI label="Taxas de franquia acumuladas" value={brl(entradaAcumulada)} sm
             foot="receita de entrada dos pontos já vendidos" />
        <KPI label="Projeção anual do recorrente" value={brl(totalRecorrente * 12)} sm accent="teal"
             foot="mantendo a base atual" />
        <KPI label="Faturamento da rede" value={brl(k.faturamentoRedeMes)} sm
             foot="base de cálculo dos royalties" />
        <KPI label="Energia da rede" value={`${num(k.energiaMesKWh)} kWh`} sm
             foot="telemetria real gerada no mês" />
      </div>

      <Nota titulo="O ativo invisível" tom="teal">
        Além do dinheiro, cada ponto gera <b>{num(k.energiaMesKWh)} kWh/mês de telemetria real</b> de
        recarga comercial — dado que a GoodWe não tem hoje e que alimenta a IA e o roadmap de
        produto. E cada franqueado é um comércio com carga elétrica nova: um lead qualificado para
        inversor, bateria e solar.
      </Nota>

      <Card title="Royalties por ponto" sub="Quem mais contribui para a franqueadora">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={porPonto}>
            <CartesianGrid stroke="#eef1f6" vertical={false} />
            <XAxis dataKey="nome" tick={{ fontSize: 9.5 }} stroke="#7a8798" interval={0} angle={-20}
                   textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 10 }} stroke="#7a8798" />
            <Tooltip formatter={tipBRL} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <RBar dataKey="royalty" stackId="a" fill="#e4002b" name="Royalties 6%" radius={[0, 0, 0, 0]} />
            <RBar dataKey="fundo" stackId="a" fill="#f2849b" name="Fundo 2%" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Detalhamento por unidade" sub="Base de cálculo e repasse do mês">
        <div className="scroll-y">
          <Tabela cabecalho={[
            'Ponto', 'Formato', 'Local', '#Faturamento', '#Royalty 6%', '#Fundo 2%',
            '#Plataforma', '#Total GoodWe',
          ]}>
            {ranking.map((r) => {
              const regiao = regiaoDoPonto(r.ponto);
              const roy = r.kpis.faturamentoMes * REGRAS.royaltyPct;
              const fun = r.kpis.faturamentoMes * REGRAS.fundoPct;
              const plat = r.ponto.ativo ? REGRAS.plataformaMes : 0;
              return (
                <tr key={r.ponto.id}>
                  <td className="strong">{r.ponto.nome}</td>
                  <td><Badge tom="gray">{r.ponto.formato}</Badge></td>
                  <td className="tiny muted">{regiao.cidade}/{regiao.uf}</td>
                  <td className="r num">{brl(r.kpis.faturamentoMes)}</td>
                  <td className="r num">{brl(roy)}</td>
                  <td className="r num">{brl(fun)}</td>
                  <td className="r num muted">{brl(plat)}</td>
                  <td className="r num strong kpi-accent-red">{brl(roy + fun + plat)}</td>
                </tr>
              );
            })}
          </Tabela>
        </div>
      </Card>
    </div>
  );
}
