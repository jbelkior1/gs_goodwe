import { useState } from 'react';
import { base, obterRegiao } from '../../domain/db';
import { analisarViabilidade } from '../../domain/engine/ia';
import { FORMATOS, REGRAS } from '../../domain/catalogo';
import { Card, KPI, Badge, EstadoBadge, Bar, Nota, brl, num, dataCurta, Tabela } from '../../ui/kit';

export default function Homologacao() {
  const [selecionada, setSelecionada] = useState(base.homologacoes[0]?.id ?? '');
  const solicitacoes = base.homologacoes;
  const atual = solicitacoes.find((h) => h.id === selecionada) ?? solicitacoes[0];

  const regiao = atual ? obterRegiao(atual.regiaoId) : undefined;
  const analise = atual && regiao
    ? analisarViabilidade(
        {
          fluxoDiarioPessoas: atual.fluxoDiarioPessoas,
          cargaDisponivelKW: atual.cargaDisponivelKW,
          formatoDesejado: atual.formatoDesejado,
          segmento: atual.segmento,
        },
        regiao,
      )
    : undefined;

  const pendentes = solicitacoes.filter((h) => !['APROVADO', 'REPROVADO'].includes(h.status)).length;
  // viável = passa no limiar de uso E tem carga elétrica suficiente para o formato
  const aprovaveis = solicitacoes.filter((h) => {
    const a = analisarViabilidade(
      {
        fluxoDiarioPessoas: h.fluxoDiarioPessoas,
        cargaDisponivelKW: h.cargaDisponivelKW,
        formatoDesejado: h.formatoDesejado,
        segmento: h.segmento,
      },
      obterRegiao(h.regiaoId),
    );
    return a.veredito !== 'REPROVAR';
  }).length;

  return (
    <div className="stack">
      <div className="grid g4">
        <KPI label="Solicitações" value={solicitacoes.length} />
        <KPI label="Em andamento" value={pendentes} accent="teal" foot="aguardando análise ou vistoria" />
        <KPI label="Viáveis pela IA" value={aprovaveis} accent="green"
             foot={`≥ ${REGRAS.limiarViabilidadeHoras} h/dia previstas`} />
        <KPI label="Taxa de análise" value={brl(1500)}
             foot="abatida da taxa de franquia se aprovado" />
      </div>

      <Nota titulo="Por que a homologação existe" tom="teal">
        A unidade só se paga acima de {REGRAS.limiarViabilidadeHoras} h/dia por carregador. Aprovar um
        ponto fraco prejudica o franqueado e suja a marca da rede. Por isso a IA estima a utilização
        esperada <b>antes</b> de a GoodWe dizer sim — é a decisão de negócio mais direta do sistema.
      </Nota>

      <div className="grid g-1-2">
        <Card title="Fila de solicitações" sub="Selecione para ver o parecer">
          <div className="stack scroll-y" style={{ gap: 7 }}>
            {solicitacoes.map((h) => (
              <button
                key={h.id}
                onClick={() => setSelecionada(h.id)}
                style={{
                  textAlign: 'left', color: 'var(--k-text)',
                  border: '1px solid var(--k-line)',
                  background: h.id === atual?.id ? 'var(--k-redsoft)' : 'transparent',
                  borderColor: h.id === atual?.id ? 'var(--k-red)' : 'var(--k-line)',
                  borderRadius: 8, padding: '10px 12px', cursor: 'pointer',
                }}
              >
                <div className="row between">
                  <span className="strong tiny">{h.comercio}</span>
                  <EstadoBadge estado={h.status} />
                </div>
                <div className="tiny muted">
                  {obterRegiao(h.regiaoId).cidade} · {h.formatoDesejado} · score {h.scoreViabilidade}
                </div>
              </button>
            ))}
          </div>
        </Card>

        {atual && analise && regiao && (
          <div className="stack">
            <Card title={atual.comercio} sub={`${atual.cnpj} · ${regiao.cidade}/${regiao.uf} · aberto em ${dataCurta(atual.criadoEm)}`}>
              <div className="grid g3">
                <div>
                  <div className="kpi-label">Score de viabilidade</div>
                  <div className="kpi-value sm">{analise.score}<span className="tiny muted">/100</span></div>
                </div>
                <div>
                  <div className="kpi-label">Uso previsto</div>
                  <div className={`kpi-value sm ${analise.horasUsoPrevistas >= REGRAS.limiarViabilidadeHoras ? 'kpi-accent-green' : 'kpi-accent-red'}`}>
                    {num(analise.horasUsoPrevistas, 1)} h/dia
                  </div>
                </div>
                <div>
                  <div className="kpi-label">Veredito da IA</div>
                  <div style={{ marginTop: 6 }}>
                    <Badge tom={
                      analise.veredito === 'APROVAR' ? 'green'
                        : analise.veredito === 'APROVAR_COM_RESSALVA' ? 'amber' : 'red'
                    }>
                      {analise.veredito === 'APROVAR' ? 'Aprovar'
                        : analise.veredito === 'APROVAR_COM_RESSALVA' ? 'Aprovar com ressalva' : 'Reprovar'}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="sep" />
              <div className="stack" style={{ gap: 8 }}>
                {analise.fatores.map((f) => (
                  <div key={f.rotulo}>
                    <div className="row between tiny">
                      <span>{f.rotulo} <span className="muted">(peso {Math.round(f.peso * 100)}%)</span></span>
                      <span className="num">{Math.round(f.nota * 100)}/100</span>
                    </div>
                    <Bar valor={f.nota} tom={f.nota > 0.7 ? 'var(--green)' : f.nota > 0.45 ? 'var(--teal)' : 'var(--red)'} />
                  </div>
                ))}
              </div>

              <div className="sep" />
              <Nota
                titulo="Parecer técnico"
                tom={analise.veredito === 'REPROVAR' ? 'red' : analise.veredito === 'APROVAR' ? 'teal' : 'amber'}
              >
                {analise.parecer}
              </Nota>
            </Card>

            <Card title="Dados declarados pelo comerciante">
              <Tabela cabecalho={['Item', '#Valor']}>
                <tr><td>Segmento</td><td className="r">{atual.segmento}</td></tr>
                <tr><td>Formato desejado</td><td className="r">{atual.formatoDesejado} ({FORMATOS[atual.formatoDesejado].carregadores} vaga(s))</td></tr>
                <tr><td>Fluxo diário de pessoas</td><td className="r num">{num(atual.fluxoDiarioPessoas)}</td></tr>
                <tr><td>Carga elétrica disponível</td><td className="r num">{num(atual.cargaDisponivelKW, 1)} kW</td></tr>
                <tr><td>Necessário para o formato</td><td className="r num">{FORMATOS[atual.formatoDesejado].carregadores * 7 + 8} kW</td></tr>
                <tr><td>Investimento estimado</td><td className="r num">{brl(FORMATOS[atual.formatoDesejado].capex)}</td></tr>
                <tr><td>Taxa de franquia</td><td className="r num">{brl(FORMATOS[atual.formatoDesejado].taxaFranquia)}</td></tr>
              </Tabela>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary">Aprovar e emitir COF</button>
                <button className="btn">Solicitar vistoria</button>
              </div>
              <div className="tiny muted" style={{ marginTop: 6 }}>
                A COF (Circular de Oferta de Franquia) deve ser entregue no mínimo 10 dias antes da
                assinatura — Lei 13.966/2019, Art. 2º, §1º.
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
