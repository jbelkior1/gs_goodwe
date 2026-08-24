import { useMemo } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar as RBar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { useApp } from '../../app/estado';
import {
  cobrancasDoPonto, noMesAtual, kpisDoPonto, obterSessao, obterMotorista, economiaDoPonto,
  tarifaAtual, obterPonto, regiaoDoPonto, carregadoresDoPonto, sessoesAtivas,
} from '../../domain/db';
import { calcularTarifa, fatorHorario } from '../../domain/engine/tarifa';
import { REGRAS } from '../../domain/catalogo';
import { Card, KPI, Tabela, EstadoBadge, brl, num, dataHora, Vazio, Nota, tipBRL, Badge } from '../../ui/kit';

export default function Financeiro() {
  const { pontoId } = useApp();
  const kpis = kpisDoPonto(pontoId);
  const eco = economiaDoPonto(pontoId);

  const cobrancas = useMemo(
    () => cobrancasDoPonto(pontoId).sort((a, b) => b.criadaEm.localeCompare(a.criadaEm)),
    [pontoId],
  );
  const doMes = cobrancas.filter((c) => noMesAtual(c.criadaEm) && c.status === 'PAGO');

  const totais = doMes.reduce(
    (acc, c) => ({
      bruto: acc.bruto + c.valor,
      energia: acc.energia + c.custoEnergia,
      royalty: acc.royalty + c.royaltyGoodWe,
      fundo: acc.fundo + c.fundoMarketing,
      gateway: acc.gateway + c.gateway,
      liquido: acc.liquido + c.liquidoLojista,
    }),
    { bruto: 0, energia: 0, royalty: 0, fundo: 0, gateway: 0, liquido: 0 },
  );

  const pizza = [
    { nome: 'Fica com o comércio', valor: Number(totais.liquido.toFixed(2)), cor: '#14884a' },
    { nome: 'Custo de energia', valor: Number(totais.energia.toFixed(2)), cor: '#9aa7b8' },
    { nome: 'Royalties GoodWe', valor: Number(totais.royalty.toFixed(2)), cor: '#e4002b' },
    { nome: 'Fundo de marketing', valor: Number(totais.fundo.toFixed(2)), cor: '#f2849b' },
    { nome: 'Gateway', valor: Number(totais.gateway.toFixed(2)), cor: '#c8d3df' },
  ];

  const falhas = cobrancas.filter((c) => c.status === 'FALHOU').length;

  // ---- tarifa dinâmica (aba de tarifação, agora embutida aqui)
  const ponto = obterPonto(pontoId)!;
  const regiao = regiaoDoPonto(ponto);
  const tarifa = tarifaAtual(pontoId);
  const totalVagas = carregadoresDoPonto(pontoId).length;
  const ocupacao = totalVagas ? sessoesAtivas(pontoId).length / totalVagas : 0;
  const horaAgora = new Date().getHours();
  const faixas = Array.from({ length: 24 }, (_, h) => ({
    hora: h,
    rotulo: `${h}h`,
    preco: calcularTarifa(ponto, regiao, h, ocupacao).precoFinalKWh,
    fator: fatorHorario(h),
    agora: h === horaAgora,
  }));

  return (
    <div className="stack">
      <div className="grid g4">
        <KPI label="Faturamento bruto (mês)" value={brl(totais.bruto)} accent="red"
             foot={`${doMes.length} cobranças pagas`} />
        <KPI label="Custo de energia" value={brl(totais.energia)}
             foot="pago à distribuidora pelo comércio" />
        <KPI label="Royalties + fundo" value={brl(totais.royalty + totais.fundo)}
             foot={`${pctTxt(REGRAS.royaltyPct + REGRAS.fundoPct)} sobre a recarga`} />
        <KPI label="Líquido do comércio" value={brl(kpis.liquidoMes)} accent="green"
             foot={`já descontada a plataforma (${brl(REGRAS.plataformaMes)}/mês)`} />
      </div>

      <Card title="Tarifa dinâmica" sub="A IA calcula; o motorista vê o preço antes de iniciar e ele fica travado">
        <div className="grid g-1-2">
          <div>
            <div className="row between">
              <div>
                <div className="kpi-label">Preço agora</div>
                <div className="kpi-value kpi-accent-red">{brl(tarifa.precoFinalKWh)}
                  <span className="tiny muted">/kWh</span></div>
              </div>
              <div className="right">
                <div className="kpi-label">Margem</div>
                <div className="kpi-value sm kpi-accent-green">{brl(tarifa.margemKWh)}</div>
                <div className="tiny muted">custo {brl(tarifa.custoEnergiaKWh)}</div>
              </div>
            </div>
            <div className="pill-row" style={{ marginTop: 10 }}>
              {tarifa.explicacao.map((e, i) => <Badge key={i} tom="gray">{e}</Badge>)}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={faixas}>
              <CartesianGrid stroke="#eef1f6" vertical={false} />
              <XAxis dataKey="rotulo" tick={{ fontSize: 9 }} stroke="#7a8798" minTickGap={14} />
              <YAxis tick={{ fontSize: 9 }} stroke="#7a8798" width={34} />
              <Tooltip formatter={tipBRL} />
              <RBar dataKey="preco" radius={[3, 3, 0, 0]}>
                {faixas.map((f) => (
                  <Cell key={f.hora} fill={f.agora ? '#e4002b' : f.fator > 1 ? '#0f8b8d' : '#c8d3df'} />
                ))}
              </RBar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid g-1-2">
        <Card title="Para onde vai o faturamento" sub="Repartição do mês">
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={pizza} dataKey="valor" nameKey="nome" innerRadius={52} outerRadius={82} paddingAngle={2}>
                {pizza.map((p) => <Cell key={p.nome} fill={p.cor} />)}
              </Pie>
              <Tooltip formatter={tipBRL} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Resultado da unidade" sub="Recarga + o movimento que ela traz para a loja">
          <Tabela cabecalho={['Linha', '#Valor no mês']}>
            <tr><td>Líquido da recarga</td><td className="r num">{brl(eco.liquidoRecarga)}</td></tr>
            <tr>
              <td>
                Margem do varejo incremental
                <div className="tiny muted">
                  {Math.round(kpis.sessoesMes * REGRAS.conversaoLoja)} clientes entrando na loja ×{' '}
                  {brl(REGRAS.ticketVarejoIncremental)} × {Math.round(REGRAS.margemVarejo * 100)}% de margem
                </div>
              </td>
              <td className="r num kpi-accent-green">{brl(eco.margemVarejo)}</td>
            </tr>
            <tr>
              <td className="strong">Resultado do mês</td>
              <td className="r strong num" style={{ fontSize: 15 }}>{brl(eco.resultadoMes)}</td>
            </tr>
            <tr>
              <td>Payback do investimento ({brl(eco.capex)})</td>
              <td className="r num strong">
                {eco.paybackMeses === Infinity ? '—' : `${num(eco.paybackMeses, 0)} meses`}
              </td>
            </tr>
          </Tabela>
          <Nota titulo="Royalty não toca as vendas da loja" tom="teal">
            Royalties e fundo incidem apenas sobre a recarga. Tudo que o cliente gasta dentro do
            comércio é 100% do franqueado.
          </Nota>
        </Card>
      </div>

      <Card title="Cobranças" sub={falhas > 0 ? `${falhas} cobranças falharam no período` : 'Todas as cobranças do ponto'}>
        {cobrancas.length === 0 ? (
          <Vazio>Nenhuma cobrança registrada.</Vazio>
        ) : (
          <div className="scroll-y">
            <Tabela cabecalho={['Data', 'Motorista', 'txid', '#Bruto', '#Energia', '#Royalty', '#Líquido', 'Status']}>
              {cobrancas.slice(0, 120).map((c) => {
                const s = obterSessao(c.sessaoId);
                const m = s ? obterMotorista(s.motoristaId) : undefined;
                return (
                  <tr key={c.id}>
                    <td className="tiny">{dataHora(c.criadaEm)}</td>
                    <td className="tiny">{m?.nome ?? '—'}</td>
                    <td className="tiny muted">{c.txid}</td>
                    <td className="r num">{brl(c.valor)}</td>
                    <td className="r num muted">{brl(c.custoEnergia)}</td>
                    <td className="r num muted">{brl(c.royaltyGoodWe + c.fundoMarketing)}</td>
                    <td className="r num strong">{brl(c.liquidoLojista)}</td>
                    <td><EstadoBadge estado={c.status} /></td>
                  </tr>
                );
              })}
            </Tabela>
          </div>
        )}
      </Card>
    </div>
  );
}

function pctTxt(v: number): string {
  return `${Math.round(v * 100)}%`;
}
