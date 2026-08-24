import {
  BarChart, Bar as RBar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import { useApp } from '../../app/estado';
import { obterPonto, regiaoDoPonto, tarifaAtual, carregadoresDoPonto, sessoesAtivas } from '../../domain/db';
import { calcularTarifa, fatorHorario } from '../../domain/engine/tarifa';
import { Card, KPI, Tabela, brl, num, pct, Nota, Badge, tipBRL } from '../../ui/kit';

export default function Tarifas() {
  const { pontoId } = useApp();
  const ponto = obterPonto(pontoId)!;
  const regiao = regiaoDoPonto(ponto);
  const atual = tarifaAtual(pontoId);
  const carregadores = carregadoresDoPonto(pontoId);
  const ocupacao = carregadores.length ? sessoesAtivas(pontoId).length / carregadores.length : 0;
  const horaAgora = new Date().getHours();

  const faixas = Array.from({ length: 24 }, (_, h) => {
    const t = calcularTarifa(ponto, regiao, h, ocupacao);
    return {
      hora: h,
      rotulo: `${h}h`,
      preco: t.precoFinalKWh,
      margem: Number((t.precoFinalKWh - regiao.custoEnergiaKWh).toFixed(2)),
      fator: fatorHorario(h),
      agora: h === horaAgora,
    };
  });

  return (
    <div className="stack">
      <div className="grid g4">
        <KPI label="Preço agora" value={`${brl(atual.precoFinalKWh)}`} accent="red" foot="por kWh, travado ao iniciar" />
        <KPI label="Preço base do ponto" value={brl(ponto.precoBaseKWh)} foot="definido pelo franqueado" />
        <KPI label="Custo da energia" value={brl(regiao.custoEnergiaKWh)}
             foot={`distribuidora em ${regiao.cidade}`} />
        <KPI label="Margem por kWh" value={brl(atual.margemKWh)} accent="green"
             foot={`${pct(atual.margemPct)} do preço`} />
      </div>

      <div className="grid g-2-1">
        <Card title="Preço por faixa horária"
              sub="Mais caro no pico, desconto no vale — empurra demanda para fora da hora crítica">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={faixas}>
              <CartesianGrid stroke="#eef1f6" vertical={false} />
              <XAxis dataKey="rotulo" tick={{ fontSize: 10 }} stroke="#7a8798" minTickGap={16} />
              <YAxis tick={{ fontSize: 10 }} stroke="#7a8798" />
              <Tooltip formatter={tipBRL} />
              <RBar dataKey="preco" radius={[4, 4, 0, 0]}>
                {faixas.map((f) => (
                  <Cell key={f.hora} fill={f.agora ? '#e4002b' : f.fator > 1 ? '#0f8b8d' : '#c8d3df'} />
                ))}
              </RBar>
            </BarChart>
          </ResponsiveContainer>
          <div className="tiny muted">
            <span style={{ color: '#e4002b' }}>■</span> agora ·{' '}
            <span style={{ color: '#0f8b8d' }}>■</span> faixa de pico ·{' '}
            <span style={{ color: '#c8d3df' }}>■</span> fora de pico
          </div>
        </Card>

        <Card title="Como o preço é formado" sub="A IA calcula, o motorista vê antes de iniciar">
          <Tabela cabecalho={['Componente', '#Fator']}>
            <tr><td>Preço base</td><td className="r num">{brl(atual.precoBaseKWh)}</td></tr>
            <tr><td>Faixa horária</td><td className="r num">×{num(atual.fatorHorario, 2)}</td></tr>
            <tr><td>Ocupação do ponto</td><td className="r num">×{num(atual.fatorOcupacao, 2)}</td></tr>
            <tr><td>Custo de energia local</td><td className="r num">×{num(atual.fatorEnergia, 2)}</td></tr>
            <tr>
              <td className="strong">Preço final</td>
              <td className="r strong num kpi-accent-red">{brl(atual.precoFinalKWh)}</td>
            </tr>
          </Tabela>
          <div className="pill-row" style={{ marginTop: 8 }}>
            {atual.explicacao.map((e, i) => <Badge key={i} tom="gray">{e}</Badge>)}
          </div>
          <Nota titulo="Amparo legal" tom="teal">
            A REN ANEEL 1.000/2021 permite preço livremente negociado na recarga comercial —
            é o que torna a tarifa dinâmica legal e viável.
          </Nota>
        </Card>
      </div>

      <Card title="Tabela de faixas" sub="O que o cliente paga e o que sobra para o comércio">
        <div className="scroll-y">
          <Tabela cabecalho={['Hora', '#Preço/kWh', '#Custo/kWh', '#Margem/kWh', 'Faixa']}>
            {faixas.map((f) => (
              <tr key={f.hora} style={f.agora ? { background: '#fff1f3' } : undefined}>
                <td className="strong">{f.rotulo}{f.agora && <span className="tiny muted"> (agora)</span>}</td>
                <td className="r num">{brl(f.preco)}</td>
                <td className="r num muted">{brl(regiao.custoEnergiaKWh)}</td>
                <td className="r num kpi-accent-green">{brl(f.margem)}</td>
                <td>
                  {f.fator >= 1.15 ? <Badge tom="red">Pico</Badge>
                    : f.fator > 1 ? <Badge tom="teal">Alta</Badge>
                      : f.fator === 1 ? <Badge tom="gray">Normal</Badge>
                        : <Badge tom="green">Desconto</Badge>}
                </td>
              </tr>
            ))}
          </Tabela>
        </div>
      </Card>
    </div>
  );
}
