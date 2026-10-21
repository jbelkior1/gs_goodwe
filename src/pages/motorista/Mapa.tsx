import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../app/estado';
import { carregadoresDoPonto, obterPonto, pontosParaMotorista, semSinal, sessaoDoMotorista, tarifaAtual } from '../../domain/db';
import { REGRAS } from '../../domain/catalogo';
import { brl, kw, plural, tarifaKWh } from '../../domain/formato';
import type { Carregador } from '../../domain/types';
import { MapaRede } from '../../ui/MapaRede';
import { Card, Badge, Nota } from '../../ui/kit';
import './Mapa.css';

type Situacao = 'livre' | 'uso' | 'manutencao' | 'sem-sinal';
const ROTULO: Record<Situacao, string> = { livre: 'livre', uso: 'em uso', manutencao: 'manutenção', 'sem-sinal': 'sem sinal' };
const FAIXA = { VALE: 'Vale: o horário mais barato', NORMAL: 'Preço normal', PICO: 'Horário de pico' } as const;

/** Uma vaga só conta como livre se o agente do ponto está respondendo e não há carro no cabo. */
function situacaoDaVaga(c: Carregador): Situacao {
  if (c.estado === 'MANUTENCAO') return 'manutencao';
  if (c.estado === 'OFFLINE' || semSinal(c)) return 'sem-sinal';
  return c.estado === 'DISPONIVEL' && !c.carro ? 'livre' : 'uso';
}

/** "Onde carregar": pontos ativos no mapa e, ao tocar num ponto, como carregar ali (passo 5 e 6 do fluxo). */
export default function Mapa() {
  const { motoristaId, perfil } = useApp();
  const nav = useNavigate();
  const detalheRef = useRef<HTMLDivElement>(null);

  const pontos = pontosParaMotorista()
    .map((p) => {
      const vagas = carregadoresDoPonto(p.ponto.id).map((c) => ({ c, situacao: situacaoDaVaga(c) }));
      return { ...p, vagas, vagasLivres: vagas.filter((v) => v.situacao === 'livre').length };
    })
    .sort((a, b) => b.vagasLivres - a.vagasLivres || a.precoAgora - b.precoAgora);

  // A lista reordena a cada evento do tempo real (vagas e preço mudam), então "o primeiro" muda sozinho.
  // O ponto aberto fica fixo: é o primeiro da lista na primeira renderização e só troca se a pessoa
  // escolher outro ou se ele sair da lista.
  const [sel, setSel] = useState<string | undefined>(undefined);
  const selValido = sel !== undefined && pontos.some((p) => p.ponto.id === sel);
  if (pontos.length && !selValido) setSel(pontos[0].ponto.id);
  const atual = pontos.find((p) => p.ponto.id === (selValido ? sel : pontos[0]?.ponto.id));
  const minha = sessaoDoMotorista(perfil?.motoristaId ?? motoristaId);
  const pontoDaMinha = minha ? obterPonto(minha.pontoId) : undefined;
  const tarifa = atual ? tarifaAtual(atual.ponto.id) : undefined;

  const escolher = (id: string) => {
    setSel(id);
    requestAnimationFrame(() => detalheRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };

  return (
    <div className="stack">
      {minha && (
        <Nota titulo={minha.estado === 'CONCLUIDO' ? 'Falta pagar a sua recarga' : 'Você tem uma recarga em andamento'} tom="teal">
          {pontoDaMinha ? `${pontoDaMinha.nome}. ` : ''}
          <div style={{ marginTop: 8 }}>
            <button className="btn primary" onClick={() => nav(`/motorista/recarga/${minha.id}`)}>
              {minha.estado === 'CONCLUIDO' ? 'Pagar agora' : 'Ver minha recarga'}
            </button>
          </div>
        </Nota>
      )}

      {!atual ? (
        <Nota titulo="Nenhum ponto aberto ainda" tom="amber">
          Assim que um comércio ativar o seu ponto, ele aparece aqui com vagas e preço ao vivo.
        </Nota>
      ) : (
        <>
          <Card title="Pontos da rede" sub="Vagas e preço ao vivo. Toque num ponto para ver como carregar.">
            <MapaRede
              pontos={pontos.map((p) => ({
                ponto: p.ponto, regiao: p.regiao, vagasLivres: p.vagasLivres, totalVagas: p.totalVagas, precoAgora: p.precoAgora,
                // sem nenhuma vaga em condição de receber carro (manutenção ou sem sinal): marcador cinza
                indisponivel: p.vagas.every((v) => v.situacao === 'manutencao' || v.situacao === 'sem-sinal'),
              }))}
              selecionado={atual.ponto.id}
              aoSelecionar={escolher}
              compacto
            />
          </Card>

          <div ref={detalheRef} className="mp-detalhe">
            <Card
              title={atual.ponto.nome}
              sub={atual.ponto.endereco}
              action={<Badge tom={atual.vagasLivres > 0 ? 'green' : 'amber'} dot>{atual.vagasLivres > 0 ? 'Tem vaga' : 'Sem vaga agora'}</Badge>}
            >
              <div className="mp-tiles">
                <div className="mp-tile">
                  <span className="kpi-label">Vagas livres agora</span>
                  <strong>{atual.vagasLivres} de {atual.totalVagas}</strong>
                  <small>{kw(atual.potenciaKW)} por vaga</small>
                </div>
                <div className="mp-tile">
                  <span className="kpi-label">Preço do kWh agora</span>
                  <strong>{tarifaKWh(tarifa?.precoFinalKWh ?? atual.precoAgora)}</strong>
                  <small>
                    {tarifa?.faixa ? FAIXA[tarifa.faixa] : 'Muda com o horário e a lotação'}
                    {tarifa?.proxima ? ` · às ${tarifa.proxima.hora}h vai a ${brl(tarifa.proxima.precoKWh)}` : ''}
                  </small>
                </div>
              </div>
              <div className="mp-vagas" aria-label="Situação de cada vaga">
                {atual.vagas.map(({ c, situacao }) => (
                  <span key={c.id} className={`mp-vaga ${situacao}`}>{c.apelido} · {ROTULO[situacao]}</span>
                ))}
              </div>

              <div className="kpi-label" style={{ marginBottom: 12 }}>Como carregar aqui</div>
              <ol className="mp-passos">
                <li><div><b>Vá até o ponto</b><span>Estacione numa vaga livre.</span></div></li>
                <li><div><b>Conecte o cabo</b><span>Ligue o carro à vaga. É isso que libera o QR no totem.</span></div></li>
                <li><div><b>O totem mostra o QR e o código</b><span>O código só aparece depois que o cabo está conectado e vale {plural(REGRAS.codigoValidadeMin, 'minuto', 'minutos')}.</span></div></li>
                <li><div><b>Leia o QR ou toque em Digitar código</b><span>Você confere o preço, ele fica travado e a recarga começa.</span></div></li>
              </ol>
              <div className="row wrap" style={{ marginTop: 16 }}>
                <button className="btn primary" onClick={() => nav('/motorista/vincular')}>Digitar código</button>
              </div>
            </Card>
          </div>

          <div className="stack" style={{ gap: 8 }}>
            <div className="kpi-label">Todos os pontos ({pontos.length})</div>
            {pontos.map((p) => (
              <button key={p.ponto.id} className="card mp-ponto" aria-pressed={p.ponto.id === atual.ponto.id} onClick={() => escolher(p.ponto.id)}>
                <div className="row between">
                  <span className="strong">{p.ponto.nome}</span>
                  <Badge tom={p.vagasLivres > 0 ? 'green' : 'amber'} dot>{p.vagasLivres}/{p.totalVagas} livres</Badge>
                </div>
                <div className="tiny muted">{p.regiao.zona}, {p.regiao.cidade} · {kw(p.potenciaKW)} · {tarifaKWh(p.precoAgora)} agora</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
