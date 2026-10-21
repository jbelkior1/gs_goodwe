import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import antes from '../../assets/lp-antes.webp';
import depois from '../../assets/lp-depois.webp';
import { FORMATOS, MODELOS_CARREGADOR, REGRAS } from '../../domain/catalogo';
import { cargaNecessariaKW } from '../../domain/engine/ia';
import { base, economiaDoPonto, obterPonto, regiaoDoPonto, resumoDaRede, resumoDoPonto } from '../../domain/db';
import { PONTO_FRANQUEADO_DEMO } from '../../domain/seed';
import { brl, horas, kw, kwh, num, pct } from '../../domain/formato';
import type { FormatoFranquia } from '../../domain/types';
import { ETAPAS_FRANQUIA } from '../pedidoFranquia';
import { Icone } from '../../ui/icones';
import './landing.css';

const DEMO = import.meta.env.VITE_MODO_DEMO === 'true';
const FORMATOS_LISTA = Object.keys(FORMATOS) as FormatoFranquia[];

export const irPara = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

// ---------------------------------------------------------------- navegação
export function NavLanding({ usuario, aoPedir }: { usuario?: string; aoPedir: () => void }) {
  return (
    <header className="lp-nav">
      <Link to="/" className="lp-marca" aria-label="GoodWe Ponto W, início">
        <span className="lp-logo" aria-hidden="true"><Icone nome="raio" tamanho={17} /></span>
        <span className="lp-marca-txt"><b>GOODWE</b><span>Ponto W · franquia</span></span>
      </Link>
      <nav className="lp-nav-links" aria-label="Seções da página">
        <button onClick={() => irPara('como')}>Como funciona</button>
        <button onClick={() => irPara('formatos')}>Formatos</button>
        <button onClick={() => irPara('duvidas')}>Dúvidas</button>
      </nav>
      <div className="lp-nav-lado">
        {usuario
          ? <span className="lp-nav-usuario">{usuario}</span>
          : <Link className="lp-nav-entrar" to="/entrar?volta=/seja-goodwe">Entrar</Link>}
        <button className="lp-btn lp-btn-primario lp-btn-pequeno" onClick={aoPedir}>Pedir minha franquia</button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------- abertura: o estacionamento hoje x com o Ponto W
/** sem banco configurado não há link para o gs_vr: o botão leva à avaliação dentro do formulário */
function LinkAvaliar({ linkVR, className, children }: { linkVR: string | null; className?: string; children: string }) {
  return linkVR
    ? <a className={className} href={linkVR}>{children}</a>
    : <button className={className} onClick={() => irPara('avaliar')}>{children}</button>;
}

export function Hero({ linkVR, aoPedir }: { linkVR: string | null; aoPedir: () => void }) {
  return (
    <section className="lp-hero" aria-labelledby="lp-titulo">
      <span className="lp-grade" aria-hidden="true" />
      <div className="lp-hero-texto">
        <h1 id="lp-titulo">Uma vaga do seu estacionamento <em>vira ponto de recarga.</em></h1>
        <p className="lp-lead">
          O motorista carrega o carro elétrico por 1 a 2 horas e, nesse tempo, compra no seu comércio.
          A GoodWe instala o carregador, o totem e o app. Você recebe o líquido de cada recarga.
        </p>
        <div className="lp-acoes">
          <LinkAvaliar className="lp-btn lp-btn-primario" linkVR={linkVR}>Avaliar meu estacionamento em 3D</LinkAvaliar>
          <button className="lp-btn lp-btn-claro" onClick={aoPedir}>Pedir minha franquia</button>
        </div>
        <p className="lp-nota">A avaliação usa uma foto do seu estacionamento e leva uns 2 minutos no celular.</p>
      </div>
      <AntesDepois />
    </section>
  );
}

/** Comparação arrastável: um único movimento na entrada revela o Ponto W; depois, quem manda é a pessoa. */
function AntesDepois() {
  const [pos, setPos] = useState(86);
  const mexeu = useRef(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setPos(42); return; }
    let raf = 0;
    const atraso = window.setTimeout(() => {
      const ini = performance.now();
      const passo = (t: number) => {
        if (mexeu.current) return;
        const k = Math.min(1, (t - ini) / 1500);
        setPos(86 - (86 - 42) * (1 - (1 - k) ** 3));
        if (k < 1) raf = requestAnimationFrame(passo);
      };
      raf = requestAnimationFrame(passo);
    }, 700);
    return () => { window.clearTimeout(atraso); cancelAnimationFrame(raf); };
  }, []);

  return (
    <figure className="lp-ad">
      <div className="lp-ad-palco" style={{ '--pos': `${pos}%` } as CSSProperties}>
        <img src={antes} alt="O estacionamento do comércio hoje, sem ponto de recarga" draggable={false} />
        <img src={depois} className="lp-ad-depois" draggable={false}
             alt="O mesmo estacionamento com o Ponto W Standard projetado: duas vagas pintadas, dois carregadores e o totem" />
        <span className="lp-ad-rotulo lp-ad-hoje" aria-hidden="true">Hoje</span>
        <span className="lp-ad-rotulo lp-ad-com" aria-hidden="true">Com o Ponto W</span>
        <span className="lp-ad-linha" aria-hidden="true"><span className="lp-ad-alca" /></span>
        <input type="range" min={0} max={100} value={Math.round(pos)} aria-label="Comparar o estacionamento hoje e com o Ponto W"
               onChange={(e) => { mexeu.current = true; setPos(Number(e.target.value)); }} />
      </div>
      <figcaption>
        Arraste para comparar. A projeção saiu de uma única foto, pela avaliação 3D. Faça o mesmo com o seu estacionamento.
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------- a rede ao vivo, numa frase
export function FaixaRede() {
  const r = resumoDaRede('30d');
  if (!r.pontosOperando) return null;
  const cidades = new Set(base.pontos.filter((p) => p.ativo).map((p) => regiaoDoPonto(p).cidade));
  const onde = cidades.size === 1 ? `em ${[...cidades][0]}` : `em ${num(cidades.size)} cidades`;
  return (
    <section className="lp-rede" aria-labelledby="lp-rede-t">
      <div className="lp-rede-cabeca">
        <h2 id="lp-rede-t">A rede hoje</h2>
        <span className="lp-selo"><span className="lp-vivo" aria-hidden="true" />{DEMO ? 'Rede de demonstração, ao vivo' : 'Ao vivo'}</span>
      </div>
      <dl className="lp-rede-numeros">
        <div><dt>Pontos operando {onde}</dt><dd>{num(r.pontosOperando)}</dd></div>
        <div><dt>Recargas nos últimos 30 dias</dt><dd>{num(r.sessoes)}</dd></div>
        <div><dt>Energia entregue em 30 dias</dt><dd>{kwh(r.energia)}</dd></div>
        <div><dt>Faturado pelos comércios em 30 dias</dt><dd>{brl(r.receita)}</dd></div>
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------- etapas, desenhadas como vagas pintadas
export function ComoFunciona({ linkVR }: { linkVR: string | null }) {
  return (
    <section id="como" className="lp-secao lp-como" aria-labelledby="lp-como-t">
      <div className="lp-cabeca">
        <h2 id="lp-como-t">Do pedido ao ponto no ar</h2>
        <p>
          Antes de pedir, você pode <LinkAvaliar className="lp-link" linkVR={linkVR}>avaliar o estacionamento em 3D</LinkAvaliar> e ver se o Ponto W cabe.
          Depois são sete etapas, e você acompanha cada uma por aqui.
        </p>
      </div>
      <ol className="lp-vagas">
        {ETAPAS_FRANQUIA.map((e, i) => (
          <li key={e.chave} className={`lp-vaga ${e.quem === 'Você' ? 'voce' : 'goodwe'}`}>
            <span className="lp-vaga-num" aria-hidden="true">{i + 1}</span>
            <h3>{e.titulo}</h3>
            <p>{e.texto}</p>
            <span className="lp-vaga-quem">{e.quem === 'Você' ? 'Com você' : 'Com a GoodWe'}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------- o que o comércio ganha + o painel de verdade
const GANHOS: { ico: Parameters<typeof Icone>[0]['nome']; titulo: string; texto: string }[] = [
  { ico: 'relogio', titulo: 'O cliente fica mais tempo', texto: 'Uma recarga leva de 1 a 2 horas. Nesse tempo o motorista toma um café, faz as compras da semana ou espera dentro da sua loja.' },
  { ico: 'dinheiro', titulo: 'Royalty só sobre a recarga', texto: `${pct(REGRAS.royaltyPct)} da recarga vão para a GoodWe e ${pct(REGRAS.fundoPct)} para o fundo de marketing. O que o cliente compra na loja continua 100% seu.` },
  { ico: 'tomada', titulo: 'A energia da loja fica protegida', texto: 'O controle de demanda divide a potência entre a loja e os carros e nunca passa do limite do seu disjuntor.' },
  { ico: 'raio', titulo: 'O preço se ajusta sozinho', texto: 'Você define o preço base. O kWh varia por horário dentro de um piso e um teto, e o motorista vê o preço travado antes de começar.' },
  { ico: 'sol', titulo: 'Sol GoodWe no mesmo ponto', texto: 'Inversor, painéis e bateria GoodWe junto do carregador. Quando há sol, a recarga custa menos para você e para o motorista.' },
];

export function Ganhos() {
  const p = obterPonto(PONTO_FRANQUEADO_DEMO) ?? base.pontos.find((x) => x.ativo);
  const r = p ? resumoDoPonto(p.id, 'mes') : null;
  const eco = p ? economiaDoPonto(p.id) : null;
  return (
    <section className="lp-secao lp-ganhos" aria-labelledby="lp-ganhos-t">
      <div className="lp-ganhos-lista">
        <h2 id="lp-ganhos-t">O que o seu comércio ganha</h2>
        <ul>
          {GANHOS.map((g) => (
            <li key={g.titulo}>
              <span className="lp-ganho-ico"><Icone nome={g.ico} tamanho={20} /></span>
              <div><h3>{g.titulo}</h3><p>{g.texto}</p></div>
            </li>
          ))}
        </ul>
      </div>
      {p && r && (
        <figure className="lp-painel">
          <div className="lp-painel-tela">
            <div className="lp-painel-topo">
              <span className="lp-painel-ponto">{p.nome}</span>
              <span className="lp-painel-status"><span className="lp-vivo" aria-hidden="true" />Operando</span>
            </div>
            <dl className="lp-painel-kpis">
              <div><dt>Faturado no mês</dt><dd>{brl(r.receita)}</dd></div>
              <div><dt>Fica com o comércio</dt><dd>{brl(r.resultado)}</dd></div>
              <div><dt>Recargas no mês</dt><dd>{num(r.sessoes)}</dd></div>
              <div><dt>Uso por vaga</dt><dd>{horas(r.horasUsoDia)}<small>/dia</small></dd></div>
            </dl>
            {eco && Number.isFinite(eco.paybackMeses) && (
              <p className="lp-painel-rodape">No ritmo deste mês, o investimento volta em cerca de {num(Math.round(eco.paybackMeses))} meses.</p>
            )}
          </div>
          <figcaption>
            O painel que o comércio usa, com os números de hoje da unidade {p.nome}{DEMO ? ' (rede de demonstração)' : ''}.
            {DEMO && <> <Link to={`/franqueado?ponto=${p.id}&tela=vitrine`}>Abrir o painel completo</Link></>}
          </figcaption>
        </figure>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- formatos lado a lado (é tabela: é para comparar)
const PARA_QUEM: Record<FormatoFranquia, string> = {
  Light: 'Farmácia, café e loja de rua',
  Standard: 'Mercado, academia e restaurante',
  Hub: 'Hipermercado, shopping e posto de estrada',
};

export function Formatos({ aoEscolher }: { aoEscolher: (f: FormatoFranquia) => void }) {
  return (
    <section id="formatos" className="lp-secao lp-formatos" aria-labelledby="lp-formatos-t">
      <div className="lp-cabeca">
        <h2 id="lp-formatos-t">Três formatos de ponto</h2>
        <p>O formato depende de quantas vagas cabem e da entrada elétrica do comércio. A avaliação 3D e a vistoria confirmam.</p>
      </div>
      <div className="lp-tabela-rolagem">
        <table className="lp-tabela">
          <thead>
            <tr>
              <td />
              {FORMATOS_LISTA.map((f) => <th key={f} scope="col">{f}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr><th scope="row">Vagas com carregador</th>{FORMATOS_LISTA.map((f) => <td key={f}>{num(FORMATOS[f].carregadores)}</td>)}</tr>
            <tr><th scope="row">Potência por vaga</th>{FORMATOS_LISTA.map((f) => <td key={f}>{kw(MODELOS_CARREGADOR[FORMATOS[f].modelo].potenciaKW)}</td>)}</tr>
            <tr><th scope="row">Entrada elétrica mínima</th>{FORMATOS_LISTA.map((f) => <td key={f}>{kw(cargaNecessariaKW(f))}</td>)}</tr>
            <tr><th scope="row">Investimento</th>{FORMATOS_LISTA.map((f) => <td key={f}>{brl(FORMATOS[f].capex)}</td>)}</tr>
            <tr><th scope="row">Taxa de franquia</th>{FORMATOS_LISTA.map((f) => <td key={f}>{brl(FORMATOS[f].taxaFranquia)}</td>)}</tr>
            <tr><th scope="row">Mensalidade da plataforma</th>{FORMATOS_LISTA.map((f) => <td key={f}>{brl(REGRAS.plataformaMes)}</td>)}</tr>
            <tr><th scope="row">Indicado para</th>{FORMATOS_LISTA.map((f) => <td key={f} className="lp-para">{PARA_QUEM[f]}</td>)}</tr>
            <tr>
              <td />
              {FORMATOS_LISTA.map((f) => (
                <td key={f}><button className="lp-btn lp-btn-contorno" onClick={() => aoEscolher(f)}>Simular o {f}</button></td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {/* no celular a tabela vira um cartão por formato, com as mesmas linhas */}
      <div className="lp-formatos-cartoes">
        {FORMATOS_LISTA.map((f) => (
          <div key={f} className="lp-formato">
            <h3>{f}</h3>
            <dl>
              <div><dt>Vagas com carregador</dt><dd>{num(FORMATOS[f].carregadores)}</dd></div>
              <div><dt>Potência por vaga</dt><dd>{kw(MODELOS_CARREGADOR[FORMATOS[f].modelo].potenciaKW)}</dd></div>
              <div><dt>Entrada elétrica mínima</dt><dd>{kw(cargaNecessariaKW(f))}</dd></div>
              <div><dt>Investimento</dt><dd>{brl(FORMATOS[f].capex)}</dd></div>
              <div><dt>Taxa de franquia</dt><dd>{brl(FORMATOS[f].taxaFranquia)}</dd></div>
              <div><dt>Mensalidade da plataforma</dt><dd>{brl(REGRAS.plataformaMes)}</dd></div>
            </dl>
            <p>{PARA_QUEM[f]}</p>
            <button className="lp-btn lp-btn-contorno" onClick={() => aoEscolher(f)}>Simular o {f}</button>
          </div>
        ))}
      </div>
      <p className="lp-nota">Valores de referência da rede. O valor final sai da vistoria, com o projeto elétrico do seu local.</p>
    </section>
  );
}

// ---------------------------------------------------------------- dúvidas
const DUVIDAS: { p: string; r: string }[] = [
  { p: 'Quanto custa para começar?', r: `Depende do formato: de ${brl(FORMATOS.Light.capex)} (Light, uma vaga) a ${brl(FORMATOS.Hub.capex)} (Hub, quatro vagas), mais a taxa de franquia. A tabela de formatos mostra os valores de referência; o valor final sai da vistoria.` },
  { p: 'Quem paga a energia das recargas?', r: 'A energia entra na conta de luz do comércio, como hoje. O custo dela já sai do valor de cada recarga antes de calcular o que fica para você.' },
  { p: 'Quanto fica para o comércio?', r: `Do valor de cada recarga saem a energia, ${pct(REGRAS.royaltyPct)} de royalty, ${pct(REGRAS.fundoPct)} de fundo de marketing e a taxa do Pix. O resto é seu, menos a mensalidade da plataforma de ${brl(REGRAS.plataformaMes)}. O que o cliente compra na loja não entra nessa conta.` },
  { p: 'A entrada elétrica da minha loja aguenta?', r: 'O controle de demanda divide a potência entre a loja e os carros e nunca passa do limite do disjuntor. Na vistoria, a GoodWe confere a entrada e indica se é preciso algum ajuste.' },
  { p: 'Quem define o preço do kWh?', r: 'Você define o preço base. O sistema ajusta por horário (vale, normal e pico) dentro de um piso, que garante que você nunca vende abaixo do custo, e de um teto, que protege o motorista.' },
  { p: 'Preciso de alguém para atender?', r: 'Não. O totem e o app fazem o atendimento: o motorista lê o QR, confirma o preço, acompanha a recarga e paga por Pix.' },
  { p: 'Como funciona o contrato?', r: 'Depois da aprovação, a GoodWe entrega a Circular de Oferta de Franquia pelo menos 10 dias antes da assinatura, como manda a Lei 13.966/2019.' },
];

export function Duvidas() {
  return (
    <section id="duvidas" className="lp-secao lp-duvidas" aria-labelledby="lp-duvidas-t">
      <div className="lp-cabeca"><h2 id="lp-duvidas-t">Dúvidas comuns</h2></div>
      <div className="lp-faq">
        {DUVIDAS.map((d) => (
          <details key={d.p}>
            <summary>{d.p}</summary>
            <p>{d.r}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- rodapé
export function Rodape() {
  return (
    <footer className="lp-rodape">
      <div className="lp-marca">
        <span className="lp-logo" aria-hidden="true"><Icone nome="raio" tamanho={17} /></span>
        <span className="lp-marca-txt"><b>GOODWE</b><span>Ponto W · rede de recarga em comércios</span></span>
      </div>
      <nav className="lp-rodape-links" aria-label="Rodapé">
        <Link to="/">Início</Link>
        <Link to="/motorista">Sou motorista</Link>
        <Link to="/entrar?volta=/seja-goodwe">Entrar</Link>
        {DEMO && <Link to="/demo">Central da demonstração</Link>}
      </nav>
    </footer>
  );
}
