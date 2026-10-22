import { useMemo, useState } from 'react';
import { base, previsaoDeUso } from '../../domain/db';
import { REGIOES } from '../../domain/catalogo';
import { analisarViabilidade, cargaNecessariaKW } from '../../domain/engine/ia';
import {
  analisarProspeccao, RAIO_COBERTURA_M, type CarregadorExistente, type Oportunidade,
} from '../../domain/engine/prospeccao';
import { sugerirPrecoBase } from '../../domain/engine/tarifa';
import { statusOperacional } from '../../domain/engine/totem';
import {
  CANDIDATOS_SIMULADOS, CARREGADORES_TERCEIROS_SIMULADOS, CORREDORES_SIMULADOS,
} from '../../domain/prospeccaoSimulada';
import { brl, horas, num, pct, plural, tarifaKWh } from '../../domain/formato';
import { Badge, Bar, Card, EmptyState, KPI, Nota, Segmentado } from '../../ui/kit';
import { Icone } from '../../ui/icones';
import { MapaCalor, type MarcadorCalor } from '../../ui/MapaCalor';
import './prospeccao.css';

type Camada = 'oportunidade' | 'fluxo';
const CAMADAS: { id: Camada; rotulo: string }[] = [
  { id: 'oportunidade', rotulo: 'Oportunidade' },
  { id: 'fluxo', rotulo: 'Fluxo de carros' },
];
const NO_RANKING = 12;
const CHAVE_LISTA = 'pontow.prospeccao.abordar';

/** lista de abordagem: só neste navegador (MVP); falhar ao ler ou gravar nunca quebra a tela */
function lerLista(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_LISTA) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}
function gravarLista(ids: string[]) {
  try { localStorage.setItem(CHAVE_LISTA, JSON.stringify(ids)); } catch { /* sem armazenamento: a lista vale só nesta visita */ }
}

/** o que o ponto renderia ali, pelo mesmo motor da homologação, ao preço sugerido da região */
function potencialDe(op: Oportunidade) {
  const formato = op.formatoSugerido;
  const analise = analisarViabilidade({
    fluxoDiarioPessoas: op.candidato.clientesDia,
    // a carga elétrica do comércio só se sabe na vistoria: aqui conta como suficiente para o formato
    cargaDisponivelKW: cargaNecessariaKW(formato),
    formatoDesejado: formato,
    segmento: op.candidato.segmento,
  }, op.regiao);
  const preco = sugerirPrecoBase(op.regiao);
  const prev = previsaoDeUso(formato, op.regiao.id, analise.horasUsoPrevistas, preco);
  return { analise, preco, prev, goodweMes: prev.royaltiesMes + prev.plataformaMes };
}

const tomDoScore = (s: number) => (s >= 70 ? 'pos' : s >= 45 ? 'warn' : 'neu');

export default function Prospeccao() {
  const [camada, setCamada] = useState<Camada>('oportunidade');
  const [verRede, setVerRede] = useState(true);
  const [verTerceiros, setVerTerceiros] = useState(true);
  const [lista, setLista] = useState<string[]>(lerLista);
  const [escolhida, setEscolhida] = useState('');

  // os pontos da rede (operando ou em instalação) são os de verdade; o resto da conta é simulado.
  // O tempo real re-renderiza a tela a cada evento: o texto da rede segura a conta até a rede mudar.
  const redeTexto = JSON.stringify(base.pontos
    .filter((p) => statusOperacional(p) !== 'SUSPENSO' && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)))
    .map((p): CarregadorExistente => ({ id: p.id, nome: `Ponto W · ${p.nome}`, lat: Number(p.lat), lng: Number(p.lng), origem: 'rede' })));
  const rede = useMemo(() => JSON.parse(redeTexto) as CarregadorExistente[], [redeTexto]);

  const r = useMemo(() => analisarProspeccao({
    corredores: CORREDORES_SIMULADOS,
    carregadores: [...rede, ...CARREGADORES_TERCEIROS_SIMULADOS],
    candidatos: CANDIDATOS_SIMULADOS,
    regioes: REGIOES,
  }), [rede]);

  const ranking = useMemo(() => r.oportunidades.slice(0, NO_RANKING), [r]);
  const atual = r.oportunidades.find((o) => o.candidato.id === escolhida) ?? ranking[0];
  const potenciais = useMemo(() => new Map(ranking.map((o) => [o.candidato.id, potencialDe(o)])), [ranking]);
  const potencialTop = [...potenciais.values()].slice(0, 10).reduce((t, p) => t + p.goodweMes, 0);
  const pot = atual ? potenciais.get(atual.candidato.id) ?? potencialDe(atual) : undefined;

  const marcadores: MarcadorCalor[] = useMemo(() => [
    ...(verTerceiros ? CARREGADORES_TERCEIROS_SIMULADOS.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, tipo: 'terceiro' as const, rotulo: `${c.nome} (simulado)` })) : []),
    ...(verRede ? rede.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, tipo: 'rede' as const, rotulo: c.nome })) : []),
    ...ranking.map((o, i) => ({
      id: o.candidato.id, lat: o.candidato.lat, lng: o.candidato.lng, tipo: 'oportunidade' as const, n: i + 1,
      rotulo: `${i + 1}. ${o.candidato.nome} · score ${o.score}`,
    })),
  ], [verRede, verTerceiros, rede, ranking]);

  const naLista = (id: string) => lista.includes(id);
  const alternarLista = (id: string) => {
    const nova = naLista(id) ? lista.filter((x) => x !== id) : [...lista, id];
    setLista(nova);
    gravarLista(nova);
  };
  const salvas = lista.map((id) => r.oportunidades.find((o) => o.candidato.id === id)).filter((o): o is Oportunidade => !!o);
  const kmQuentes = (r.areasQuentes * 160) / 1000;

  return (
    <div className="stack">
      <Nota tom="warn" titulo="MVP com dados simulados">
        O fluxo de carros nas vias, os carregadores de outras empresas e os comércios candidatos são simulados para mostrar a ideia.
        Os pontos Ponto W no mapa são os de verdade da rede.
      </Nota>

      <div className="grid g4">
        <KPI label="Vias quentes sem carregador" value={num(kmQuentes, 1)} unit="km"
             foot="trechos com muito fluxo e nenhum carregador por perto" />
        <KPI label="Fluxo já coberto" value={pct(r.fluxoCoberto)}
             foot={`do fluxo das vias passa a menos de ${num(RAIO_COBERTURA_M / 1000, 1)} km de um carregador (da rede ou de terceiros)`} />
        <KPI label="Oportunidades mapeadas" value={num(r.oportunidades.length)}
             foot={`${plural(r.oportunidades.filter((o) => o.score >= 70).length, 'com score alto', 'com score alto')} (70 ou mais)`} />
        <KPI label="Receita GoodWe possível" value={brl(potencialTop)} unit="/mês" estimado
             foot="se as 10 primeiras virarem ponto: royalties, fundo e plataforma, a preço sugerido" />
      </div>

      <div className="grid g-2-1">
        <Card
          title="Mapa de calor"
          sub={camada === 'oportunidade'
            ? 'Onde passa muito carro e falta carregador: quanto mais quente, maior a oportunidade'
            : 'Fluxo de carros nas principais vias (estimativa simulada)'}
          action={<Segmentado valor={camada} opcoes={CAMADAS} aoMudar={setCamada} rotulo="Camada do mapa" />}
        >
          <div className="stack" style={{ gap: 10 }}>
            <MapaCalor
              calor={camada === 'oportunidade' ? r.calorOportunidade : r.calorFluxo}
              marcadores={marcadores}
              selecionado={atual?.candidato.id}
              aoSelecionar={setEscolhida}
            />
            <div className="mc-legenda">
              <span className="mc-escala">menos<i aria-hidden="true" />mais</span>
              <label className="mc-chave"><input type="checkbox" checked={verRede} onChange={(e) => setVerRede(e.target.checked)} /><span className="mc-pino rede" />pontos Ponto W</label>
              <label className="mc-chave"><input type="checkbox" checked={verTerceiros} onChange={(e) => setVerTerceiros(e.target.checked)} /><span className="mc-pino terceiro" />outros carregadores</label>
              <span className="mc-chave"><span className="mc-pino oportunidade">1</span>oportunidade no ranking</span>
            </div>
          </div>
        </Card>

        <Card title="Melhores oportunidades" sub="Score = fluxo de carros × falta de carregador × elétricos na região">
          <ol className="pp-ranking">
            {ranking.map((o, i) => (
              <li key={o.candidato.id}>
                <button
                  type="button" className={`pp-item${o.candidato.id === atual?.candidato.id ? ' ativo' : ''}`}
                  aria-pressed={o.candidato.id === atual?.candidato.id} onClick={() => setEscolhida(o.candidato.id)}
                >
                  <span className="pp-n">{i + 1}</span>
                  <span className="pp-texto">
                    <b>{o.candidato.nome}</b>
                    <span className="tiny muted">
                      {num(Math.round(o.corredor.fluxoDia / 1000))} mil carros/dia · {o.carregadoresPerto === 0 ? 'sem carregador perto' : plural(o.carregadoresPerto, 'carregador perto', 'carregadores perto')}
                    </span>
                  </span>
                  <Badge tom={tomDoScore(o.score)}>{o.score}</Badge>
                  {naLista(o.candidato.id) && <Icone nome="check" tamanho={14} />}
                </button>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {atual && pot ? (
        <Card
          title={atual.candidato.nome}
          sub={`${atual.candidato.segmento} · ${atual.regiao.zona} · ${atual.regiao.cidade}/${atual.regiao.uf} · formato sugerido ${atual.formatoSugerido}`}
          action={(
            <div className="row" style={{ gap: 8 }}>
              <a className="btn sm" href={`https://www.google.com/maps/search/?api=1&query=${atual.candidato.lat},${atual.candidato.lng}`} target="_blank" rel="noopener noreferrer">
                Ver no Google Maps
              </a>
              <button type="button" className={`btn sm${naLista(atual.candidato.id) ? '' : ' primary'}`} onClick={() => alternarLista(atual.candidato.id)}>
                {naLista(atual.candidato.id) ? 'Tirar da lista de abordagem' : 'Salvar para abordar'}
              </button>
            </div>
          )}
        >
          <div className="grid g-2-1">
            <div className="stack" style={{ gap: 12 }}>
              <div className="row between">
                <span className="kpi-label">Score de oportunidade</span>
                <span className="kpi-value sm">{atual.score}<span className="tiny muted"> de 100</span></span>
              </div>
              {atual.fatores.map((f) => (
                <div key={f.rotulo}>
                  <div className="row between tiny"><span className="strong">{f.rotulo}</span><span className="num">{num(f.nota * 100)}</span></div>
                  <Bar valor={f.nota} />
                  <div className="tiny muted">{f.texto}</div>
                </div>
              ))}
              <div className="tiny muted">
                Por que aqui: muito carro passa na porta e a recarga mais perto ainda está longe. A capacidade elétrica do comércio
                só se confirma na vistoria; a conta ao lado supõe que ela comporta o formato {atual.formatoSugerido}.
              </div>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <div className="row between"><span className="kpi-label">Se virar ponto Ponto W</span><span className="selo">estimado</span></div>
              <div className="pp-linhas">
                <div><span>Uso previsto por vaga</span><span className="num">{horas(pot.analise.horasUsoPrevistas)}/dia</span></div>
                <div><span>Preço sugerido da região</span><span className="num">{tarifaKWh(pot.preco)}</span></div>
                <div><span>Receita de recarga</span><span className="num">{brl(pot.prev.receitaMes)}/mês</span></div>
                <div><span>Fica com o comércio</span><span className="num">{brl(pot.prev.resultadoMes)}/mês</span></div>
                <div><span>Receita GoodWe</span><span className="num strong">{brl(pot.goodweMes)}/mês</span></div>
                <div><span>Retorno do investimento</span><span className="num">{Number.isFinite(pot.prev.paybackMeses) ? `${num(pot.prev.paybackMeses)} meses` : 'não se paga'}</span></div>
              </div>
              <div className="tiny muted">
                Preços sugeridos e ajustáveis, pelo mesmo motor da Homologação (score de viabilidade {pot.analise.score}).
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card title="Oportunidade"><EmptyState icone="mapaLupa" titulo="Nenhuma oportunidade mapeada" /></Card>
      )}

      <Card
        title={`Lista de abordagem${salvas.length ? ` (${num(salvas.length)})` : ''}`}
        sub="Os lugares que a equipe comercial vai procurar. No MVP a lista fica só neste navegador."
      >
        {salvas.length === 0 ? (
          <EmptyState icone="mapaLupa" titulo="Nenhum lugar salvo ainda">
            Escolha uma oportunidade no ranking e toque em Salvar para abordar.
          </EmptyState>
        ) : (
          <ul className="pp-lista">
            {salvas.map((o) => (
              <li key={o.candidato.id}>
                <button type="button" className="pp-link" onClick={() => setEscolhida(o.candidato.id)}>{o.candidato.nome}</button>
                <span className="tiny muted">{o.candidato.segmento} · score {o.score} · {brl(potenciais.get(o.candidato.id)?.goodweMes ?? potencialDe(o).goodweMes)}/mês para a GoodWe (estimado)</span>
                <button type="button" className="btn sm" onClick={() => alternarLista(o.candidato.id)}>Tirar</button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
