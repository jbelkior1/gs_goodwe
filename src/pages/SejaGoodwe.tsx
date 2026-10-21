import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../app/estado';
import { base, obterPonto } from '../domain/db';
import { enviarSolicitacao } from '../data/acoes';
import {
  idAvaliacaoValido, linkAvaliarLocal, obterAvaliacao, preenchimentoDaAvaliacao,
  type AvaliacaoLocal, type Preenchimento,
} from '../data/avaliacoes';
import { FORMATOS, MODELOS_CARREGADOR, REGIOES, REGRAS, SEGMENTOS } from '../domain/catalogo';
import { analisarViabilidade, cargaNecessariaKW } from '../domain/engine/ia';
import { brl, dataHora, horas, kw, num, pct, plural } from '../domain/formato';
import type { FormatoFranquia, SegmentoComercio, SolicitacaoHomologacao } from '../domain/types';
import { Icone } from '../ui/icones';
import { Badge, EstadoBadge } from '../ui/kit';
import { AvaliacaoLocalVista, IconeCamera } from './AvaliacaoLocal';
import { ETAPAS_FRANQUIA, cnpjValido, linhaDoTempo, lerNumero, mascaraCNPJ, numeroParaCampo } from './pedidoFranquia';
import './SejaGoodwe.css';

const DEMO = import.meta.env.VITE_MODO_DEMO === 'true';
const CHAVE_RASCUNHO = 'pontow.pedido';
/** id da avaliação do local (gs_vr): sobrevive a um login no meio do caminho, como o rascunho */
const CHAVE_AVALIACAO = 'pontow.avaliacao';
const FORMATOS_LISTA = Object.keys(FORMATOS) as FormatoFranquia[];
const LEMA: Record<FormatoFranquia, string> = {
  Light: 'Para começar pequeno',
  Standard: 'Equilíbrio entre custo e capacidade',
  Hub: 'Para comércio de alto fluxo',
};
/** O modelo de viabilidade devolve de 0,6 h a 5,2 h de uso por vaga; é a escala da barra. */
const HORAS_ESCALA = 5.2;
/** Mesma regra do ia.ts: abaixo de 75% da carga necessária o pedido é reprovado por energia. */
const CARGA_MINIMA = 0.75;

interface Rascunho {
  comercio: string; cnpj: string; regiaoId: string; segmento: SegmentoComercio;
  formato: FormatoFranquia; carga: string; fluxo: string;
}
const PADRAO: Rascunho = { comercio: '', cnpj: '', regiaoId: REGIOES[0].id, segmento: SEGMENTOS[0], formato: 'Standard', carga: '30', fluxo: '600' };
const EXEMPLO: Rascunho = {
  comercio: 'Café Primavera', cnpj: '11.222.333/0001-81', regiaoId: 'r-sp-pinheiros', segmento: 'Café / Restaurante',
  formato: 'Standard', carga: '30', fluxo: '700',
};

/** Quem explora a página sem conta cria a conta e volta com os campos como deixou. */
function lerRascunho(): Rascunho {
  try {
    const d = JSON.parse(sessionStorage.getItem(CHAVE_RASCUNHO) ?? 'null') as Partial<Rascunho> | null;
    if (!d) return PADRAO;
    return {
      comercio: typeof d.comercio === 'string' ? d.comercio : '',
      cnpj: typeof d.cnpj === 'string' ? mascaraCNPJ(d.cnpj) : '',
      regiaoId: REGIOES.some((x) => x.id === d.regiaoId) ? d.regiaoId! : PADRAO.regiaoId,
      segmento: SEGMENTOS.includes(d.segmento as SegmentoComercio) ? (d.segmento as SegmentoComercio) : PADRAO.segmento,
      formato: FORMATOS_LISTA.includes(d.formato as FormatoFranquia) ? (d.formato as FormatoFranquia) : PADRAO.formato,
      carga: typeof d.carga === 'string' ? d.carga : PADRAO.carga,
      fluxo: typeof d.fluxo === 'string' ? d.fluxo : PADRAO.fluxo,
    };
  } catch { return PADRAO; }
}

type EstadoAvaliacao =
  | { tipo: 'nenhuma' } | { tipo: 'carregando' } | { tipo: 'erro' } | { tipo: 'naoEncontrada' }
  | { tipo: 'ok'; av: AvaliacaoLocal };
/** Resultado da leitura de uma avaliação (por id e tentativa): o "carregando" é o que ainda não chegou. */
interface AvaliacaoLida { id: string; tentativa: number; resultado: AvaliacaoLocal | 'erro' | 'naoEncontrada' }

function lerAvaliacaoGuardada(): string {
  try {
    const id = sessionStorage.getItem(CHAVE_AVALIACAO) ?? '';
    return idAvaliacaoValido(id) ? id : '';
  } catch { return ''; }
}

/** Campos do formulário que a avaliação traz, e o nome de cada um para avisar o que foi preenchido. */
function camposDaAvaliacao(p: Preenchimento): { patch: Partial<Rascunho>; rotulos: string[] } {
  const patch: Partial<Rascunho> = {};
  const rotulos: string[] = [];
  if (p.formato) { patch.formato = p.formato; rotulos.push('o formato'); }
  if (p.segmento) { patch.segmento = p.segmento; rotulos.push('o segmento'); }
  if (p.regiaoId) { patch.regiaoId = p.regiaoId; rotulos.push('a região'); }
  if (p.fluxo != null) { patch.fluxo = String(p.fluxo); rotulos.push('o fluxo de pessoas'); }
  if (p.carga != null) { patch.carga = numeroParaCampo(p.carga); rotulos.push('a carga elétrica'); }
  return { patch, rotulos };
}

/** ["o formato", "a região", "o fluxo"] vira "o formato, a região e o fluxo" */
const listaE = (itens: string[]): string =>
  itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}` : (itens[0] ?? '');
const irPara = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

/** Pedido de franquia: proposta, formatos, pré-análise da IA ao vivo e acompanhamento do pedido. */
export default function SejaGoodwe() {
  const { perfil } = useApp();
  const [params, setParams] = useSearchParams();
  const [r, setR] = useState<Rascunho>(lerRascunho);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ tom: 'erro' | 'ok'; texto: string } | null>(null);
  const [campoErro, setCampoErro] = useState('');
  const aviso = useRef<HTMLDivElement>(null);
  // avaliação do local (gs_vr). Voltando do gs_vr o id vem em ?avaliacao=; fora isso, o que ficou guardado
  const idDaUrl = params.get('avaliacao') ?? '';
  const idDaUrlValido = idAvaliacaoValido(idDaUrl) ? idDaUrl : '';
  const [avaliacaoId, setAvaliacaoId] = useState(() => idDaUrlValido || lerAvaliacaoGuardada());
  const [lida, setLida] = useState<AvaliacaoLida | null>(null);
  const [preenchidos, setPreenchidos] = useState<string[]>([]);
  const [recarga, setRecarga] = useState(0);
  // só quem acabou de voltar do gs_vr ganha o preenchimento; ao recarregar, vale o que a pessoa já editou
  const aplicarDaUrl = useRef(idDaUrlValido);
  // pedidos que a pessoa já tinha ao enviar: a rolagem espera a lista crescer
  const [pedidosAntes, setPedidosAntes] = useState<number | null>(null);
  const rolouApos = useRef<number | null>(null);

  useEffect(() => {
    try { sessionStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(r)); } catch { /* sem armazenamento: segue sem rascunho */ }
  }, [r]);
  useEffect(() => { if (msg?.tom === 'erro') aviso.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [msg]);

  // o id sai do endereço e fica guardado (um F5 não reaplica nada)
  useEffect(() => {
    if (idDaUrl) setParams((p) => { p.delete('avaliacao'); return p; }, { replace: true });
  }, [idDaUrl, setParams]);

  useEffect(() => {
    try {
      if (avaliacaoId) sessionStorage.setItem(CHAVE_AVALIACAO, avaliacaoId);
      else sessionStorage.removeItem(CHAVE_AVALIACAO);
    } catch { /* sem armazenamento: a avaliação só vale até recarregar a página */ }
  }, [avaliacaoId]);

  useEffect(() => {
    if (!avaliacaoId) return;
    let vivo = true;
    obterAvaliacao(avaliacaoId).then((a) => {
      if (!vivo) return;
      setLida({ id: avaliacaoId, tentativa: recarga, resultado: a ?? 'naoEncontrada' });
      if (a && aplicarDaUrl.current === avaliacaoId) {
        aplicarDaUrl.current = '';
        const { patch, rotulos } = camposDaAvaliacao(preenchimentoDaAvaliacao(a.dados));
        setR((x) => ({ ...x, ...patch }));
        setPreenchidos(rotulos);
      }
    }).catch(() => { if (vivo) setLida({ id: avaliacaoId, tentativa: recarga, resultado: 'erro' }); });
    return () => { vivo = false; };
  }, [avaliacaoId, recarga]);
  const avaliacao: EstadoAvaliacao = !avaliacaoId ? { tipo: 'nenhuma' }
    : lida && lida.id === avaliacaoId && lida.tentativa === recarga
      ? (typeof lida.resultado === 'string' ? { tipo: lida.resultado } : { tipo: 'ok', av: lida.resultado })
      : { tipo: 'carregando' };

  function set<K extends keyof Rascunho>(campo: K, valor: Rascunho[K]) { setR((x) => ({ ...x, [campo]: valor })); }

  const regiao = REGIOES.find((x) => x.id === r.regiaoId) ?? REGIOES[0];
  const carga = lerNumero(r.carga);
  const fluxo = Math.round(lerNumero(r.fluxo)); // o banco guarda o fluxo como inteiro
  const cfg = FORMATOS[r.formato];
  const necessaria = cargaNecessariaKW(r.formato);
  const analise = carga > 0 && fluxo > 0
    ? analisarViabilidade({ fluxoDiarioPessoas: fluxo, cargaDisponivelKW: carga, formatoDesejado: r.formato, segmento: r.segmento }, regiao)
    : null;
  const cargaFalta = carga > 0 && carga < necessaria;
  const cargaReprova = carga > 0 && carga < necessaria * CARGA_MINIMA;

  const minhas = base.homologacoes
    .filter((h) => perfil && h.solicitanteId === perfil.id)
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));

  // depois de enviar, rola até "Acompanhe o seu pedido" quando o pedido novo chega à lista (tempo real)
  useEffect(() => {
    if (pedidosAntes === null || minhas.length <= pedidosAntes || rolouApos.current === pedidosAntes) return;
    rolouApos.current = pedidosAntes;
    irPara('acompanhar');
  }, [pedidosAntes, minhas.length]);

  const anexar = avaliacao.tipo === 'ok' && !avaliacao.av.homologacaoId ? avaliacao.av : null;
  const linkVR = linkAvaliarLocal();
  const descartarAvaliacao = () => { setAvaliacaoId(''); setPreenchidos([]); };

  const falhar = (texto: string, campo = '') => {
    setMsg({ tom: 'erro', texto }); setCampoErro(campo);
    if (campo) document.getElementById(`sg-${campo}`)?.focus();
  };

  const enviar = (ev: FormEvent) => {
    ev.preventDefault();
    if (!perfil || enviando) return;
    if (r.comercio.trim().length < 2) return falhar('Informe o nome do comércio.', 'comercio');
    // o CNPJ é conferido na vistoria e nos documentos: aqui é opcional, mas se vier tem de ser válido
    if (r.cnpj.replace(/\D/g, '') && !cnpjValido(r.cnpj)) return falhar('CNPJ inválido. Confira os 14 números ou deixe em branco.', 'cnpj');
    if (!(carga > 0)) return falhar('Informe a carga elétrica disponível, em kW. Veja na conta de luz ou pergunte ao eletricista.', 'carga');
    if (!(fluxo > 0)) return falhar('Informe quantas pessoas passam pelo comércio por dia.', 'fluxo');
    if (avaliacao.tipo === 'carregando') return falhar('A avaliação do local ainda está carregando. Espere um instante e envie de novo.');
    setMsg(null); setCampoErro(''); setEnviando(true);
    const antes = minhas.length;
    enviarSolicitacao({
      comercio: r.comercio.trim(), cnpj: r.cnpj, regiaoId: r.regiaoId, segmento: r.segmento, formatoDesejado: r.formato,
      cargaDisponivelKW: carga, fluxoDiarioPessoas: fluxo, avaliacaoId: anexar?.id,
    }, perfil.id)
      .then(() => {
        setMsg({ tom: 'ok', texto: 'Pedido enviado. A GoodWe vai analisar e você acompanha cada etapa logo abaixo.' });
        setR((x) => ({ ...x, comercio: '', cnpj: '' }));
        if (anexar) descartarAvaliacao(); // a avaliação seguiu com o pedido; um novo pedido pede outra
        setPedidosAntes(antes);
      })
      .catch((e: Error) => falhar(e.message))
      .finally(() => setEnviando(false));
  };

  const veredito = (() => {
    if (!analise) return null;
    if (analise.veredito === 'APROVAR') return { tom: 'green' as const, titulo: 'Alto potencial', texto: 'O fluxo e o perfil do seu segmento sustentam o investimento.' };
    if (analise.veredito === 'APROVAR_COM_RESSALVA') return { tom: 'amber' as const, titulo: 'Viável, com ressalva', texto: 'O uso previsto fica logo acima do mínimo. Comece pelo formato Light e expanda com dados reais.' };
    if (cargaReprova) return { tom: 'red' as const, titulo: 'Entrada elétrica insuficiente', texto: `O formato ${r.formato} precisa de ${kw(necessaria)} e você informou ${kw(carga)}. Amplie o padrão de entrada ou escolha um formato menor.` };
    return { tom: 'red' as const, titulo: 'Uso previsto abaixo do mínimo', texto: `O uso previsto fica abaixo de ${horas(REGRAS.limiarViabilidadeHoras)} por vaga ao dia, o mínimo para o ponto se pagar.` };
  })();

  return (
    <div className="sg">
      <header className="sg-topo">
        <Link className="sg-voltar" to="/"><Icone nome="setaDireita" tamanho={14} style={{ transform: 'rotate(180deg)' }} />Voltar</Link>
        <span className="sg-marca"><span className="brand-logo"><Icone nome="raio" tamanho={15} /></span>Ponto W · GoodWe</span>
        {perfil
          ? <span className="sg-usuario">{perfil.nome.split(' ')[0]}</span>
          : <Link className="sg-usuario" to="/entrar?volta=/seja-goodwe">Entrar</Link>}
      </header>

      <main className="sg-pagina">
        <section className="sg-hero">
          <span className="kpi-label">Franquia Ponto W</span>
          <h1>Seja GoodWe</h1>
          <p>Leve a recarga de carro elétrico para o seu comércio. O cliente fica de 1 a 2 horas e compra na sua loja.</p>
          <div className="row wrap">
            <button className="btn primary" onClick={() => irPara('pedido')}>Pedir a minha franquia</button>
            <button className="btn" onClick={() => irPara('simulador')}>Simular o meu ponto</button>
          </div>
        </section>

        <section className="sg-valor" aria-label="Por que ser GoodWe">
          <div className="card">
            <Icone nome="relogio" tamanho={20} />
            <h3>O cliente fica 1 a 2 horas</h3>
            <p>Quem recarrega o carro passa tempo no seu comércio e compra. A recarga traz o cliente; a venda continua sua.</p>
          </div>
          <div className="card">
            <Icone nome="dinheiro" tamanho={20} />
            <h3>Royalty só sobre a recarga</h3>
            <p>{pct(REGRAS.royaltyPct)} da recarga para a GoodWe e {pct(REGRAS.fundoPct)} para o fundo de marketing. Nada sobre as vendas da sua loja.</p>
          </div>
          <div className="card">
            <Icone nome="sol" tamanho={20} />
            <h3>Ecossistema solar GoodWe</h3>
            <p>Inversor, painéis e bateria no mesmo ponto. A recarga usa o sol quando há geração e protege a entrada elétrica do comércio.</p>
          </div>
        </section>

        <form id="pedido" className="sg-form" onSubmit={enviar} noValidate>
          <div id="avaliar" className="sg-bloco sg-avaliacao card">
            <div className="row between wrap">
              <h2>1. Avalie o seu local em 3D</h2>
              <Badge tom="info">Opcional, mas recomendado</Badge>
            </div>
            {avaliacao.tipo === 'ok' ? (
              <div className="stack" style={{ gap: 14 }}>
                <AvaliacaoLocalVista av={avaliacao.av} formatoPedido={r.formato} />
                {avaliacao.av.homologacaoId && (
                  <p className="sg-aviso-av">Esta avaliação já seguiu com outro pedido. Refaça a avaliação para anexar ao pedido novo.</p>
                )}
                {preenchidos.length > 0 && (
                  <p className="sg-ok" role="status">
                    Preenchemos {listaE(preenchidos)} com o que você informou na avaliação. Confira nos próximos passos antes de enviar.
                  </p>
                )}
                <div className="row wrap">
                  {linkVR && <a className="btn" href={linkVR}>Refazer a avaliação</a>}
                  <button type="button" className="btn" onClick={descartarAvaliacao}>Remover a avaliação</button>
                </div>
              </div>
            ) : (
              <div className="stack" style={{ gap: 14 }}>
                {avaliacao.tipo === 'carregando' && <p className="muted" role="status" style={{ margin: 0 }}>Carregando a sua avaliação…</p>}
                {avaliacao.tipo === 'naoEncontrada' && (
                  <p className="sg-aviso-av" role="alert">Não encontrei essa avaliação. Faça uma nova ou siga sem ela.</p>
                )}
                {avaliacao.tipo === 'erro' && (
                  <p className="sg-aviso-av" role="alert">
                    Não consegui carregar a avaliação agora.{' '}
                    <button type="button" className="sg-link" onClick={() => setRecarga((n) => n + 1)}>Tentar de novo</button>
                  </p>
                )}
                <p className="sg-avaliacao-texto">
                  Tire uma foto do estacionamento, marque a área e veja o Ponto W projetado no seu espaço, com a medida de
                  cada formato. Leva 2 minutos, e a GoodWe recebe as fotos e as medidas junto com o seu pedido.
                </p>
                <div className="row wrap">
                  {linkVR
                    ? <a className="btn primary" href={linkVR}>Avaliar meu local</a>
                    : <button type="button" className="btn primary" disabled>Avaliar meu local</button>}
                </div>
                {!linkVR && <p className="tiny muted" style={{ margin: 0 }}>A avaliação fica disponível quando o app está conectado ao banco.</p>}
                <p className="tiny muted" style={{ margin: 0 }}>Você volta para esta página sozinho. Dá para pedir a franquia sem avaliar.</p>
              </div>
            )}
          </div>

          <div className="sg-bloco sg-formatos">
            <h2>2. Escolha o formato</h2>
            <div className="sg-opcoes" role="radiogroup" aria-label="Formato da franquia">
              {FORMATOS_LISTA.map((f) => {
                const c = FORMATOS[f];
                return (
                  <label key={f} className={`card sg-formato ${r.formato === f ? 'on' : ''}`}>
                    <input type="radio" name="formato" value={f} checked={r.formato === f} onChange={() => set('formato', f)} />
                    <span className="sg-formato-nome">{f}</span>
                    <span className="sg-formato-lema">{LEMA[f]}</span>
                    <dl>
                      <div><dt>Vagas</dt><dd>{plural(c.carregadores, 'vaga', 'vagas')} de {kw(MODELOS_CARREGADOR[c.modelo].potenciaKW)}</dd></div>
                      <div><dt>Investimento estimado</dt><dd>{brl(c.capex)}</dd></div>
                      <div><dt>Taxa de franquia</dt><dd>{brl(c.taxaFranquia)}</dd></div>
                      <div><dt>Entrada elétrica</dt><dd>{kw(cargaNecessariaKW(f))}</dd></div>
                    </dl>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="sg-bloco sg-entradas card" id="simulador">
            <h2>3. Conte sobre o seu ponto</h2>
            <div className="sg-grade">
              <div className="sg-campo">
                <label htmlFor="sg-regiao">Região</label>
                <select id="sg-regiao" className="sg-input" value={r.regiaoId} onChange={(e) => set('regiaoId', e.target.value)}>
                  {REGIOES.map((x) => <option key={x.id} value={x.id}>{x.zona}, {x.cidade}/{x.uf}</option>)}
                </select>
              </div>
              <div className="sg-campo">
                <label htmlFor="sg-segmento">Segmento do comércio</label>
                <select id="sg-segmento" className="sg-input" value={r.segmento} onChange={(e) => set('segmento', e.target.value as SegmentoComercio)}>
                  {SEGMENTOS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="sg-campo">
                <label htmlFor="sg-carga">Carga elétrica disponível (kW)</label>
                <input id="sg-carga" className="sg-input" inputMode="decimal" value={r.carga} aria-invalid={campoErro === 'carga'}
                       aria-describedby="sg-carga-ajuda" onChange={(e) => set('carga', e.target.value)} />
                <span id="sg-carga-ajuda" className={`sg-ajuda ${cargaFalta ? 'alerta' : ''}`}>
                  Veja na conta de luz (demanda contratada) ou pergunte ao eletricista. O formato {r.formato} precisa de {kw(necessaria)}.
                  {carga > 0 && (cargaFalta ? ` Faltam ${kw(necessaria - carga)}.` : ' A sua entrada atende.')}
                </span>
              </div>
              <div className="sg-campo">
                <label htmlFor="sg-fluxo">Pessoas por dia no comércio</label>
                <input id="sg-fluxo" className="sg-input" inputMode="numeric" value={r.fluxo} aria-invalid={campoErro === 'fluxo'}
                       aria-describedby="sg-fluxo-ajuda" onChange={(e) => set('fluxo', e.target.value)} />
                <span id="sg-fluxo-ajuda" className="sg-ajuda">Quantas pessoas entram ou passam por dia. Uma estimativa já serve.</span>
              </div>
            </div>
          </div>

          <aside className="sg-bloco sg-resultado card" aria-live="polite">
            <div className="row between">
              <h2>Pré-análise da IA</h2>
              {veredito && <Badge tom={veredito.tom} dot>{veredito.titulo}</Badge>}
            </div>
            {analise && veredito ? (
              <>
                <div className="sg-numeros">
                  <div><span className="kpi-label">Potencial do ponto</span><strong>{num(analise.score)}<small> / 100</small></strong></div>
                  <div><span className="kpi-label">Uso por vaga</span><strong>{horas(analise.horasUsoPrevistas)}<small> / dia</small></strong></div>
                </div>
                <div className="sg-escala" role="img"
                     aria-label={`Uso previsto de ${horas(analise.horasUsoPrevistas)} por dia; mínimo de ${horas(REGRAS.limiarViabilidadeHoras)}`}>
                  <span className={`sg-escala-fill ${veredito.tom}`} style={{ width: `${Math.min(100, (analise.horasUsoPrevistas / HORAS_ESCALA) * 100)}%` }} />
                  <span className="sg-escala-marca" style={{ left: `${(REGRAS.limiarViabilidadeHoras / HORAS_ESCALA) * 100}%` }} />
                </div>
                <div className="sg-escala-leg"><span>0 h</span><span>mínimo para se pagar: {horas(REGRAS.limiarViabilidadeHoras)}</span></div>
                <p className="sg-veredito">{veredito.texto}</p>
                <ul className="sg-fatores">
                  {analise.fatores.map((f) => (
                    <li key={f.rotulo}>
                      <span>{f.rotulo}</span>
                      <span className="sg-barra"><span style={{ width: `${f.nota * 100}%` }} /></span>
                      <span className="sg-pct">{pct(f.nota)}</span>
                    </li>
                  ))}
                </ul>
                <p className="tiny muted">Pré-análise do modelo da GoodWe. A decisão final vem depois da análise da equipe e da vistoria.</p>
              </>
            ) : (
              <p className="muted">Informe a carga elétrica e o fluxo de pessoas para ver o potencial do seu ponto.</p>
            )}
          </aside>

          <div className="sg-bloco sg-pedido card">
            <h2>4. Envie o pedido</h2>
            {!perfil ? (
              <div className="stack" style={{ gap: 12 }}>
                <p className="muted" style={{ margin: 0 }}>Crie uma conta de comerciante para enviar o pedido e acompanhar a análise. O que você preencheu fica guardado.</p>
                <div className="row wrap">
                  <Link className="btn primary" to="/entrar?modo=cadastro&tipo=comercio&volta=/seja-goodwe">Criar conta de comerciante</Link>
                  <Link className="btn" to="/entrar?volta=/seja-goodwe">Já tenho conta</Link>
                </div>
              </div>
            ) : (
              <div className="stack" style={{ gap: 14 }}>
                <div className="sg-grade">
                  <div className="sg-campo">
                    <label htmlFor="sg-comercio">Nome do comércio</label>
                    <input id="sg-comercio" className="sg-input" value={r.comercio} autoComplete="organization"
                           aria-invalid={campoErro === 'comercio'} onChange={(e) => set('comercio', e.target.value)} />
                  </div>
                  <div className="sg-campo">
                    <label htmlFor="sg-cnpj">CNPJ <span className="muted">(opcional)</span></label>
                    <input id="sg-cnpj" className="sg-input" inputMode="numeric" autoComplete="off" placeholder="00.000.000/0000-00" maxLength={18}
                           value={r.cnpj} aria-invalid={campoErro === 'cnpj'} onChange={(e) => set('cnpj', mascaraCNPJ(e.target.value))} />
                  </div>
                </div>
                <p className="tiny muted" style={{ margin: 0 }}>
                  Formato {r.formato} em {regiao.zona}, {regiao.cidade}/{regiao.uf}: {plural(cfg.carregadores, 'vaga', 'vagas')}, investimento estimado de {brl(cfg.capex)} e taxa de franquia de {brl(cfg.taxaFranquia)}.
                </p>
                <div ref={aviso} role="alert" aria-live="assertive">
                  {msg && <div className={msg.tom === 'erro' ? 'sg-erro' : 'sg-ok'}>{msg.texto}</div>}
                </div>
                <div className="row wrap">
                  <button type="submit" className="btn primary sg-enviar" disabled={enviando} aria-busy={enviando}>
                    {enviando ? 'Enviando…' : 'Enviar solicitação'}
                  </button>
                  {DEMO && <button type="button" className="btn" onClick={() => { setR(EXEMPLO); setMsg(null); setCampoErro(''); }}>Preencher com um exemplo</button>}
                </div>
              </div>
            )}
          </div>
        </form>

        <section className="sg-etapas" aria-labelledby="sg-etapas-t">
          <h2 id="sg-etapas-t">Do pedido ao ponto no ar</h2>
          <ol>
            {ETAPAS_FRANQUIA.map((e, i) => (
              <li key={e.chave} className="card">
                <span className="sg-num" aria-hidden="true">{i + 1}</span>
                <b>{e.titulo}</b>
                <span className="sg-quem">{e.quem === 'Você' ? 'Com você' : 'Com a GoodWe'}</span>
                <p>{e.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        {perfil && minhas.length > 0 && (
          <section id="acompanhar" className="sg-acompanhar" aria-labelledby="sg-acomp-t">
            <h2 id="sg-acomp-t">Acompanhe o seu pedido</h2>
            {minhas.map((h) => <Acompanhamento key={h.id} h={h} />)}
          </section>
        )}
      </main>
    </div>
  );
}

/** Um pedido como linha do tempo: o que já foi feito, a etapa da vez e o que vem depois. */
function Acompanhamento({ h }: { h: SolicitacaoHomologacao }) {
  const ponto = h.pontoId ? obterPonto(h.pontoId) : undefined;
  const etapas = linhaDoTempo(h, ponto?.status);
  return (
    <div className="card sg-pedido-card">
      <div className="row between wrap">
        <div>
          <div className="strong">{h.comercio}</div>
          <div className="tiny muted">Formato {h.formatoDesejado} · enviado em {dataHora(h.criadoEm)}</div>
          {h.avaliacaoId && (
            <div className="tiny muted sg-com-avaliacao"><IconeCamera tamanho={13} />Com avaliação do local em 3D</div>
          )}
        </div>
        <EstadoBadge estado={h.status} />
      </div>
      <ol className="sg-linha">
        {etapas.map((e) => (
          <li key={e.chave} className={e.estado} aria-current={e.estado === 'atual' ? 'step' : undefined}>
            <span className="sg-marco" aria-hidden="true">
              {e.estado === 'feita' && <Icone nome="check" tamanho={16} />}
              {e.estado === 'bloqueada' && <Icone nome="fechar" tamanho={14} />}
            </span>
            <div>
              <b>{e.titulo}</b>
              {e.estado === 'atual' && <span className="sg-agora">agora</span>}
              <p>{e.texto}</p>
            </div>
          </li>
        ))}
      </ol>
      {h.status === 'APROVADO' && (
        <div><Link className="btn primary" to="/franqueado/ponto">Ir para o meu ponto</Link></div>
      )}
      {h.status === 'REPROVADO' && (
        <div><button type="button" className="btn" onClick={() => irPara('pedido')}>Ajustar e enviar um novo pedido</button></div>
      )}
    </div>
  );
}
