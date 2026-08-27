import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pontosParaMotorista, sessoesAtivas } from '../../domain/db';
import { Badge, brl, num, Vazio } from '../../ui/kit';
import { Icone } from '../../ui/icones';
import { MapaRede } from '../../ui/MapaRede';

type Filtro = 'todos' | 'livres' | 'baratos';

const FILTROS: [Filtro, string][] = [
  ['todos', 'Todos'],
  ['livres', 'Com vaga'],
  ['baratos', 'Menor preço'],
];

export default function Mapa() {
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const nav = useNavigate();

  const todos = useMemo(() => pontosParaMotorista(), []);
  const lista = useMemo(() => {
    if (filtro === 'livres') return todos.filter((p) => p.vagasLivres > 0);
    if (filtro === 'baratos') return [...todos].sort((a, b) => a.precoAgora - b.precoAgora);
    return todos;
  }, [todos, filtro]);

  const ativa = sessoesAtivas()[0];

  return (
    <div className="app-motorista-tela">
      {ativa && (
        <button className="mv-sessao" onClick={() => nav(`/motorista/recarga/${ativa.id}`)}>
          <span className="mv-sessao-esq">
            <span className="live-tag"><span className="dot pulse" />recarga em andamento</span>
            <span className="mv-sessao-txt">
              {Math.round(ativa.socAtual)}% · {num(ativa.potenciaAtualKW, 1)} kW · {brl(ativa.custoAcumulado)}
            </span>
          </span>
          <Icone nome="setaDireita" tamanho={16} />
        </button>
      )}

      <MapaRede
        pontos={lista}
        selecionado={selecionado ?? undefined}
        aoSelecionar={(id) => setSelecionado(id === selecionado ? null : id)}
      />

      <div className="mv-filtros">
        {FILTROS.map(([k, label]) => (
          <button key={k} className={`chip ${filtro === k ? 'on' : ''}`} onClick={() => setFiltro(k)}>
            {label}
          </button>
        ))}
        <span className="mv-conta meta">{lista.length} PONTOS</span>
      </div>

      {lista.length === 0 ? (
        <Vazio>Nenhum ponto com esse filtro.</Vazio>
      ) : (
        <div className="mv-lista">
          {lista.map(({ ponto, regiao, vagasLivres, totalVagas, precoAgora, potenciaKW }) => (
            <article
              key={ponto.id}
              className={`mv-item ${selecionado === ponto.id ? 'on' : ''}`}
              onPointerEnter={() => setSelecionado(ponto.id)}
            >
              <header className="mv-item-topo">
                <span className="mv-item-nome">{ponto.nome}</span>
                <Badge tom={vagasLivres > 0 ? 'green' : 'amber'} dot>
                  {vagasLivres > 0 ? `${vagasLivres} livre${vagasLivres > 1 ? 's' : ''}` : 'fila'}
                </Badge>
              </header>

              <div className="mv-item-local">
                <Icone nome="mapa" tamanho={12} />
                {regiao.zona}, {regiao.cidade}/{regiao.uf} · {ponto.segmento}
              </div>

              <div className="mv-item-num">
                <span className="mv-num">
                  <span className="tt-rotulo">Preço agora</span>
                  <span className="mv-num-val acento">{brl(precoAgora)}<small>/kWh</small></span>
                </span>
                <span className="mv-num">
                  <span className="tt-rotulo">Potência</span>
                  <span className="mv-num-val">{num(potenciaKW)}<small>kW</small></span>
                </span>
                <span className="mv-num">
                  <span className="tt-rotulo">Vagas</span>
                  <span className="mv-num-val">{totalVagas}<small>Tipo 2</small></span>
                </span>
              </div>

              <button className="btn primary mv-item-btn" onClick={() => nav('/motorista/recarga')}>
                Carregar aqui
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
