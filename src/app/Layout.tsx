import { useEffect, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp, type Persona } from './estado';
import { base, obterPonto } from '../domain/db';
import { Badge } from '../ui/kit';
import { Icone, type NomeIcone } from '../ui/icones';

const MENUS: Record<Persona, { grupo: string; itens: { to: string; ico: NomeIcone; label: string }[] }[]> = {
  motorista: [
    {
      grupo: 'App do motorista',
      itens: [
        { to: '/motorista', ico: 'mapa', label: 'Onde carregar' },
        { to: '/motorista/recarga', ico: 'raio', label: 'Recarga e pagamento' },
      ],
    },
  ],
  totem: [
    {
      grupo: 'Totem do eletroposto',
      itens: [
        { to: '/totem', ico: 'pulso', label: 'Tela do totem' },
      ],
    },
  ],
  lojista: [
    {
      grupo: 'Minha unidade',
      itens: [
        { to: '/lojista', ico: 'painel', label: 'Painel' },
        { to: '/lojista/demanda', ico: 'tomada', label: 'Controle de demanda' },
        { to: '/lojista/financeiro', ico: 'dinheiro', label: 'Tarifas e financeiro' },
      ],
    },
  ],
  rede: [
    {
      grupo: 'Rede GoodWe',
      itens: [
        { to: '/rede', ico: 'globo', label: 'Visão da rede' },
        { to: '/rede/homologacao', ico: 'check', label: 'Homologação' },
      ],
    },
  ],
};

const TITULOS: Record<string, { t: string; s: string }> = {
  '/motorista': { t: 'Onde carregar', s: 'Pontos da rede Ponto W disponíveis agora' },
  '/motorista/recarga': { t: 'Recarga e pagamento', s: 'Acompanhe a sessão e feche a conta por Pix' },
  '/totem': { t: 'Totem do eletroposto', s: 'Autoatendimento com o assistente Volt' },
  '/lojista': { t: 'Painel da unidade', s: 'Como o ponto está performando neste mês' },
  '/lojista/demanda': { t: 'Controle de demanda', s: 'Distribuição de potência e proteção da entrada elétrica' },
  '/lojista/financeiro': { t: 'Tarifas e financeiro', s: 'Preço dinâmico, cobranças e resultado da unidade' },
  '/rede': { t: 'Visão da rede', s: 'Todos os pontos Ponto W no Brasil' },
  '/rede/homologacao': { t: 'Homologação de pontos', s: 'Análise de viabilidade dos candidatos' },
};

/** A rota manda: abrir /totem direto tem de trazer o totem junto. */
function personaDaRota(pathname: string): Persona | null {
  if (pathname.startsWith('/totem')) return 'totem';
  if (pathname.startsWith('/motorista')) return 'motorista';
  if (pathname.startsWith('/lojista')) return 'lojista';
  if (pathname.startsWith('/rede')) return 'rede';
  return null;
}

const ROTA_INICIAL: Record<Persona, string> = {
  motorista: '/motorista',
  totem: '/totem',
  lojista: '/lojista',
  rede: '/rede',
};

/**
 * Cada persona vê o produto no aparelho em que ele roda de verdade:
 * o motorista dentro de uma moldura retangular de celular, o atendimento
 * dentro do totem físico do eletroposto, e a operação em tela cheia.
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
        <div className="totem">
          <div className="totem-cabeca">
            <div className="totem-visor">{children}</div>
          </div>
          <div className="totem-coluna">
            <span className="totem-coluna-marca">GOODWE</span>
          </div>
          <div className="totem-base" />
        </div>
        <div className="palco-nota meta">TOTEM DO ELETROPOSTO · 1080 × 1920</div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function Layout() {
  const { persona, setPersona, pontoId, setPontoId } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const ponto = obterPonto(pontoId);

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

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo"><Icone nome="raio" tamanho={16} /></div>
          <div>
            <div className="brand-name">GoodWe</div>
            <div className="brand-sub">Torre de controle</div>
          </div>
        </div>

        <div className="persona-switch">
          <div className="persona-label">Perfil</div>
          {([
            ['motorista', 'carro', 'Motorista'],
            ['totem', 'raio', 'Totem'],
            ['lojista', 'loja', 'Lojista'],
            ['rede', 'antena', 'GoodWe (rede)'],
          ] as [Persona, NomeIcone, string][]).map(([p, ico, label]) => (
            <button
              key={p}
              className={`persona-btn ${personaAtual === p ? 'active' : ''}`}
              onClick={() => trocarPersona(p)}
            >
              <span className="ico"><Icone nome={ico} tamanho={15} /></span>
              {label}
            </button>
          ))}
        </div>

        <nav className="nav">
          {MENUS[personaAtual].map((grupo) => (
            <div key={grupo.grupo}>
              <div className="nav-sep">{grupo.grupo}</div>
              {grupo.itens.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/motorista' || item.to === '/lojista' || item.to === '/rede'}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <span className="ico"><Icone nome={item.ico} tamanho={15} /></span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          BASE DE DEMONSTRAÇÃO · {base.sessoes.length.toLocaleString('pt-BR')} SESSÕES
          <br />DADOS SIMULADOS (MOCK)
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <h1>{titulo.t}</h1>
            <div className="sub">{titulo.s}</div>
          </div>
          <div className="topbar-actions">
            {personaAtual === 'lojista' && (
              <select
                className="btn"
                value={pontoId}
                onChange={(e) => setPontoId(e.target.value)}
                style={{ maxWidth: 250 }}
              >
                {base.pontos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} — {p.formato}
                  </option>
                ))}
              </select>
            )}
            {personaAtual === 'lojista' && ponto && (
              <Badge tom={ponto.ativo ? 'green' : 'amber'} dot>
                {ponto.ativo ? 'Operando' : 'Inativo'}
              </Badge>
            )}
            {personaAtual === 'totem' && (
              <Badge tom="red" dot pulse>totem em operação</Badge>
            )}
            {personaAtual === 'rede' && (
              <Badge tom="teal" dot pulse>
                {base.pontos.filter((p) => p.ativo).length} pontos ativos
              </Badge>
            )}
          </div>
        </header>

        <main className={`content content-${personaAtual}`}>
          <Moldura persona={personaAtual}>
            <Outlet />
          </Moldura>
        </main>
      </div>
    </div>
  );
}
