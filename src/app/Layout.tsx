import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp, type Persona } from './estado';
import { base, obterPonto, pontoAtivo, statusDoPonto, dadosAte, conexaoTempoReal } from '../domain/db';
import { dataHora, horaMin, plural } from '../domain/formato';
import { bancoConfigurado } from '../data/supabase';
import { comTela, telaDoNavegador } from './tela';
import { Badge, Nota, StatusBadge } from '../ui/kit';
import { Icone, type NomeIcone } from '../ui/icones';
import { Totem3D } from '../ui/Totem3D';
import { GuiaDemo } from '../ui/GuiaDemo';
import { EMBUTIDO, useGuiaVisivel } from '../pages/demo/ambienteDemo';

/** a troca de painel é da vitrine: só aparece no modo demonstração */
const DEMO = import.meta.env.VITE_MODO_DEMO === 'true';

const PAPEL_LEGIVEL: Record<string, string> = {
  motorista: 'Motorista',
  franqueado: 'Franqueado · comércio',
  goodwe: 'GoodWe · franqueadora',
};

/** "Comerciante (demo)" → "C"; "Maria Souza" → "MS" (só palavras que começam com letra) */
const iniciais = (nome: string) =>
  nome.split(/\s+/).filter((p) => /^\p{L}/u.test(p)).slice(0, 2).map((p) => p[0].toUpperCase()).join('')
  || nome.charAt(0).toUpperCase() || '?';

function IconeTelaCheia() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5" />
    </svg>
  );
}

const MENUS: Record<Persona, { grupo: string; itens: { to: string; ico: NomeIcone; label: string }[] }[]> = {
  motorista: [
    {
      grupo: 'App do motorista',
      itens: [
        { to: '/motorista', ico: 'globo', label: 'Onde carregar' },
        { to: '/motorista/recarga', ico: 'raio', label: 'Minha recarga' },
        { to: '/motorista/vincular', ico: 'qr', label: 'Ler o QR da recarga' },
        { to: '/motorista/assistente', ico: 'chat', label: 'Falar com o Volt' },
      ],
    },
  ],
  totem: [
    {
      grupo: 'Totem do eletroposto',
      itens: [{ to: '/totem', ico: 'pulso', label: 'Tela do totem' }],
    },
  ],
  franqueado: [
    {
      grupo: 'Minha unidade',
      itens: [
        { to: '/franqueado', ico: 'painel', label: 'Painel' },
        { to: '/franqueado/demanda', ico: 'tomada', label: 'Controle de demanda' },
        { to: '/franqueado/financeiro', ico: 'dinheiro', label: 'Tarifas e financeiro' },
        { to: '/franqueado/ponto', ico: 'loja', label: 'Meu ponto e totem' },
      ],
    },
  ],
  goodwe: [
    {
      grupo: 'Rede GoodWe',
      itens: [
        { to: '/goodwe', ico: 'globo', label: 'Visão da rede' },
        { to: '/goodwe/homologacao', ico: 'check', label: 'Homologação' },
        { to: '/goodwe/prospeccao', ico: 'mapaLupa', label: 'Prospecção' },
      ],
    },
  ],
};

const TITULOS: Record<string, { t: string; s: string }> = {
  '/motorista': { t: 'Onde carregar', s: 'Pontos da rede disponíveis agora' },
  '/motorista/recarga': { t: 'Minha recarga', s: 'Acompanhe a sessão e feche a conta por Pix' },
  '/motorista/vincular': { t: 'Confirmar recarga', s: 'Leia o QR que o totem mostra ou digite o código da recarga' },
  '/franqueado/ponto': { t: 'Meu ponto', s: 'Instalação, configuração, vagas e totem' },
  '/motorista/assistente': { t: 'Volt', s: 'O assistente da rede no seu bolso' },
  '/totem': { t: 'Totem do eletroposto', s: 'Autoatendimento com o assistente Volt' },
  '/franqueado': { t: 'Painel da unidade', s: 'Resultado, uso das vagas e o que precisa de atenção' },
  '/franqueado/demanda': { t: 'Controle de demanda', s: 'Distribuição de potência e proteção da entrada elétrica' },
  '/franqueado/financeiro': { t: 'Tarifas e financeiro', s: 'Preço dinâmico, cobranças e resultado da unidade' },
  '/goodwe': { t: 'Visão da rede', s: 'Todos os pontos Ponto W no Brasil' },
  '/goodwe/homologacao': { t: 'Homologação de pontos', s: 'Análise de viabilidade dos candidatos' },
  '/goodwe/prospeccao': { t: 'Prospecção de pontos', s: 'Onde passa muito carro e ainda falta carregador' },
};

const ROTULO: Record<Persona, { nome: string; ico: NomeIcone; sub: string }> = {
  motorista: { nome: 'Motorista', ico: 'carro', sub: 'App · celular' },
  totem: { nome: 'Totem', ico: 'raio', sub: 'Quiosque' },
  franqueado: { nome: 'Franqueado', ico: 'loja', sub: 'Painel da unidade' },
  goodwe: { nome: 'GoodWe', ico: 'antena', sub: 'Torre de controle' },
};

/** A rota manda: abrir /totem direto tem de trazer o totem junto. */
function personaDaRota(pathname: string): Persona | null {
  if (pathname.startsWith('/totem')) return 'totem';
  if (pathname.startsWith('/motorista')) return 'motorista';
  if (pathname.startsWith('/franqueado')) return 'franqueado';
  if (pathname.startsWith('/goodwe')) return 'goodwe';
  return null;
}

const ROTA_INICIAL: Record<Persona, string> = {
  motorista: '/motorista',
  totem: '/totem',
  franqueado: '/franqueado',
  goodwe: '/goodwe',
};

/**
 * Cada inquilino vê o produto no aparelho em que ele roda de verdade: o
 * motorista dentro de uma moldura de celular, o atendimento dentro do totem,
 * e a operação em tela cheia. No celular de verdade a moldura desaparece.
 */
function Moldura({ persona, children }: { persona: Persona; children: ReactNode }) {
  if (persona === 'motorista') {
    return (
      <div className="palco palco-celular">
        <div className="celular">
          <div className="celular-tela">{children}</div>
        </div>
        <div className="palco-nota meta">APP DO MOTORISTA · 390 × 844</div>
      </div>
    );
  }

  if (persona === 'totem') {
    return (
      <div className="palco palco-totem">
        <Totem3D>{children}</Totem3D>
        <div className="palco-nota meta">TOTEM DO ELETROPOSTO · 1080 × 1920</div>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Tela cheia é o ambiente real: o painel do franqueado e o da GoodWe pedem a conta daquele papel.
 * No modo demonstração, sem conta nenhuma, o painel abre direto (a apresentação não depende de login).
 */
function Porta({ persona, atual }: { persona: Persona; atual?: string }) {
  const { pathname, search } = useLocation();
  return (
    <div style={{ maxWidth: 520, margin: '48px auto' }}>
      <Nota titulo={`Ambiente do ${ROTULO[persona].nome.toLowerCase()}`} tom="amber">
        {atual ? `Você está com a conta ${atual}. ` : ''}Entre com a conta do {ROTULO[persona].nome.toLowerCase()} para usar este painel.
        <div style={{ marginTop: 10 }}>
          <Link className="btn primary" to={`/entrar?volta=${encodeURIComponent(pathname + search)}`}>Entrar</Link>
        </div>
      </Nota>
    </div>
  );
}

/** cheia: só o ambiente do papel da rota, sem a troca de painel da vitrine */
export default function Layout({ cheia = false }: { cheia?: boolean }) {
  const { persona, setPersona, pontoId, setPontoId, perfil, sair } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const ponto = obterPonto(pontoId);
  // franqueado vê só as unidades dele; a vitrine (demonstração) e a GoodWe veem todas
  const pontosVisiveis = perfil?.papel === 'franqueado'
    ? base.pontos.filter((p) => p.franqueadoId === perfil.franqueadoId)
    : DEMO || perfil?.papel === 'goodwe' || !bancoConfigurado ? base.pontos : ponto ? [ponto] : [];

  const [menuConta, setMenuConta] = useState(false);
  const contaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuConta) return;
    const fora = (e: PointerEvent) => { if (!contaRef.current?.contains(e.target as Node)) setMenuConta(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuConta(false); };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc); };
  }, [menuConta]);
  const ate = dadosAte();
  const guia = useGuiaVisivel();
  // sem a conexão em tempo real a tela fica parada: avisa até quando os dados valem
  const reconectando = bancoConfigurado && conexaoTempoReal === 'reconectando';

  // deep link (ou F5 numa rota interna) precisa acertar o perfil e a moldura
  const personaAtual = personaDaRota(location.pathname) ?? persona;
  useEffect(() => {
    if (personaAtual !== persona) setPersona(personaAtual);
  }, [personaAtual, persona, setPersona]);

  const titulo = TITULOS[location.pathname]
    ?? (location.pathname.startsWith('/motorista/recarga')
      ? TITULOS['/motorista/recarga']
      : { t: 'Ponto W', s: '' });

  const trocarPersona = (p: Persona) => {
    setPersona(p);
    navigate(ROTA_INICIAL[p]);
  };
  const mudarTela = (tela: 'cheia' | 'vitrine') => {
    telaDoNavegador(tela === 'cheia');
    navigate(comTela(location.pathname, location.search, tela));
  };

  return (
    <div className={`app app-${personaAtual}${cheia ? ' app-cheia' : ''}${EMBUTIDO ? ' app-embed' : ''}`}>
      <aside className="sidebar">
        <Link to={cheia ? ROTA_INICIAL[personaAtual] : '/'} className="brand" title={cheia ? ROTULO[personaAtual].nome : 'Voltar para a escolha de painel'}>
          <div className="brand-logo"><Icone nome="raio" tamanho={16} /></div>
          <div className="brand-txt">
            <div className="brand-name">GoodWe</div>
            <div className="brand-sub">{ROTULO[personaAtual].sub}</div>
          </div>
          <span className="brand-voltar"><Icone nome="casa" tamanho={14} /></span>
        </Link>

        {!cheia && DEMO && <div className="persona-switch">
          <div className="persona-label">Demonstração</div>
          {(Object.keys(ROTULO) as Persona[]).map((p) => (
            <button
              key={p}
              className={`persona-btn ${personaAtual === p ? 'active' : ''}`}
              onClick={() => trocarPersona(p)}
            >
              <span className="ico"><Icone nome={ROTULO[p].ico} tamanho={15} /></span>
              {ROTULO[p].nome}
            </button>
          ))}
          <Link className="persona-btn" to="/demo">
            <span className="ico"><Icone nome="mapaLupa" tamanho={15} /></span>
            Central da demonstração
          </Link>
        </div>}

        <nav className="nav">
          {MENUS[personaAtual].map((grupo) => (
            <div key={grupo.grupo}>
              <div className="nav-sep">{grupo.grupo}</div>
              {grupo.itens.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === ROTA_INICIAL[personaAtual]}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <span className="ico"><Icone nome={item.ico} tamanho={15} /></span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot" ref={contaRef}>
          {EMBUTIDO ? null : perfil ? (
            <>
              {menuConta && (
                <div className="conta-menu" role="menu">
                  <div className="conta-linha">
                    <strong style={{ color: 'var(--k-text)' }}>{perfil.nome}</strong><br />
                    {PAPEL_LEGIVEL[perfil.papel] ?? perfil.papel}
                  </div>
                  <button className="btn" role="menuitem" onClick={() => { setMenuConta(false); sair(); }}>Sair da conta</button>
                </div>
              )}
              <button
                className="conta-btn" aria-haspopup="menu" aria-expanded={menuConta}
                onClick={() => setMenuConta((v) => !v)}
              >
                <span className="conta-avatar" aria-hidden="true">{iniciais(perfil.nome)}</span>
                <span className="conta-txt">
                  <span className="conta-nome">{perfil.nome}</span>
                  <span className="conta-papel">{PAPEL_LEGIVEL[perfil.papel] ?? perfil.papel}</span>
                </span>
              </button>
            </>
          ) : (
            <Link className="btn" to="/entrar">Entrar</Link>
          )}
          <div
            className={`vivo ${bancoConfigurado ? '' : 'simulado'}`}
            title={ate ? `Dados até ${dataHora(ate)}` : undefined}
            style={reconectando ? { color: 'var(--warn)' } : undefined}
          >
            <span className={`dot ${bancoConfigurado && !reconectando ? 'pulse' : ''}`} style={reconectando ? { color: 'var(--warn)' } : undefined} />
            {reconectando
              ? `reconectando · ${ate ? `dados até ${horaMin(ate)}` : 'sem dados ainda'}`
              : bancoConfigurado ? 'ao vivo' : ate ? `dados simulados até ${dataHora(ate)}` : 'dados simulados'}
          </div>
          {cheia && DEMO && !EMBUTIDO && <button className="btn sm" onClick={() => mudarTela('vitrine')}>Sair da tela cheia</button>}
        </div>
      </aside>

      <div className={`main${guia ? ' main-guia' : ''}`}>
        {guia && <GuiaDemo ambiente={personaAtual} posicao="fluxo" />}
        <header className="topbar">
          <div className="topbar-tit">
            <h1>{titulo.t}</h1>
            <div className="sub">{titulo.s}</div>
          </div>
          <div className="topbar-actions">
            {personaAtual === 'franqueado' && (pontosVisiveis.length > 1 && !EMBUTIDO ? (
              <select
                className="btn"
                aria-label="Unidade"
                value={pontoId}
                onChange={(e) => setPontoId(e.target.value)}
                style={{ maxWidth: 250 }}
              >
                {pontosVisiveis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} — {p.formato}
                  </option>
                ))}
              </select>
            ) : ponto && (
              <span className="strong">{ponto.nome} <span className="muted">· {ponto.formato}</span></span>
            ))}
            {personaAtual === 'franqueado' && ponto && <StatusBadge estado={statusDoPonto(ponto)} />}
            {!cheia && !EMBUTIDO && (
              <button className="btn" onClick={() => mudarTela('cheia')} title="Abre só este ambiente, como no aparelho real">
                <IconeTelaCheia />Abrir em tela cheia
              </button>
            )}
            {personaAtual === 'totem' && <Badge tom="pos" dot pulse>totem em operação</Badge>}
            {personaAtual === 'goodwe' && (
              <Badge tom="pos" dot>
                {plural(base.pontos.filter(pontoAtivo).length, 'ponto operando', 'pontos operando')}
              </Badge>
            )}
          </div>
        </header>

        <main className={`content content-${personaAtual}`}>
          {cheia && !EMBUTIDO && bancoConfigurado && (personaAtual === 'franqueado' || personaAtual === 'goodwe') && perfil?.papel !== personaAtual && !(DEMO && !perfil)
            ? <Porta persona={personaAtual} atual={perfil ? `${perfil.nome} (${perfil.papel})` : undefined} />
            : personaAtual === 'franqueado' && !ponto
              ? <Nota titulo="Ponto não encontrado" tom="amber">Este ponto saiu da rede. Escolha outro ponto.</Nota>
              : <Moldura persona={personaAtual}><Outlet /></Moldura>}
        </main>
      </div>
    </div>
  );
}
