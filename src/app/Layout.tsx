import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp, type Persona } from './estado';
import { base, obterPonto } from '../domain/db';
import { Badge } from '../ui/kit';

const MENUS: Record<Persona, { grupo: string; itens: { to: string; ico: string; label: string }[] }[]> = {
  motorista: [
    {
      grupo: 'App do motorista',
      itens: [
        { to: '/motorista', ico: '🗺️', label: 'Onde carregar' },
        { to: '/motorista/recarga', ico: '⚡', label: 'Recarga ao vivo' },
        { to: '/motorista/pagamento', ico: '💳', label: 'Pagamento' },
        { to: '/motorista/historico', ico: '🧾', label: 'Histórico' },
      ],
    },
  ],
  lojista: [
    {
      grupo: 'Minha unidade',
      itens: [
        { to: '/lojista', ico: '📊', label: 'Painel' },
        { to: '/lojista/demanda', ico: '🔌', label: 'Controle de demanda' },
        { to: '/lojista/carregadores', ico: '🅿️', label: 'Carregadores' },
        { to: '/lojista/sessoes', ico: '📋', label: 'Sessões' },
      ],
    },
    {
      grupo: 'Comercial',
      itens: [
        { to: '/lojista/tarifas', ico: '🏷️', label: 'Tarifação' },
        { to: '/lojista/financeiro', ico: '💰', label: 'Financeiro' },
        { to: '/lojista/inteligencia', ico: '🧠', label: 'Inteligência' },
      ],
    },
  ],
  rede: [
    {
      grupo: 'Rede GoodWe',
      itens: [
        { to: '/rede', ico: '🌐', label: 'Visão da rede' },
        { to: '/rede/pontos', ico: '📍', label: 'Pontos e franqueados' },
        { to: '/rede/homologacao', ico: '✅', label: 'Homologação' },
      ],
    },
    {
      grupo: 'Operação',
      itens: [
        { to: '/rede/frota', ico: '🛰️', label: 'Saúde da frota' },
        { to: '/rede/royalties', ico: '🏦', label: 'Royalties' },
        { to: '/rede/ia', ico: '🧠', label: 'IA e previsões' },
      ],
    },
  ],
};

const TITULOS: Record<string, { t: string; s: string }> = {
  '/motorista': { t: 'Onde carregar', s: 'Pontos da rede Ponto W disponíveis agora' },
  '/motorista/recarga': { t: 'Recarga ao vivo', s: 'Acompanhe a sessão em tempo real' },
  '/motorista/pagamento': { t: 'Pagamento', s: 'Feche a conta da recarga por Pix' },
  '/motorista/historico': { t: 'Histórico', s: 'Suas recargas e recibos' },
  '/lojista': { t: 'Painel da unidade', s: 'Como o ponto está performando neste mês' },
  '/lojista/demanda': { t: 'Controle de demanda', s: 'Distribuição de potência e proteção da entrada elétrica' },
  '/lojista/carregadores': { t: 'Carregadores', s: 'Estado e operação de cada vaga' },
  '/lojista/sessoes': { t: 'Sessões', s: 'Todas as recargas do ponto' },
  '/lojista/tarifas': { t: 'Tarifação', s: 'Preço dinâmico por faixa horária' },
  '/lojista/financeiro': { t: 'Financeiro', s: 'Cobranças, repasses e royalties' },
  '/lojista/inteligencia': { t: 'Inteligência', s: 'Previsões e recomendações da IA' },
  '/rede': { t: 'Visão da rede', s: 'Todos os pontos Ponto W no Brasil' },
  '/rede/pontos': { t: 'Pontos e franqueados', s: 'Ranking e desempenho por unidade' },
  '/rede/homologacao': { t: 'Homologação de pontos', s: 'Análise de viabilidade dos candidatos' },
  '/rede/frota': { t: 'Saúde da frota', s: 'Carregadores, firmware e comunicação' },
  '/rede/royalties': { t: 'Royalties', s: 'Receita recorrente da franqueadora' },
  '/rede/ia': { t: 'IA e previsões', s: 'O motor de decisão da rede' },
};

export default function Layout() {
  const { persona, setPersona, pontoId, setPontoId } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const ponto = obterPonto(pontoId);

  const titulo = TITULOS[location.pathname] ?? { t: 'Ponto W', s: '' };

  const trocarPersona = (p: Persona) => {
    setPersona(p);
    navigate(p === 'motorista' ? '/motorista' : p === 'lojista' ? '/lojista' : '/rede');
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">W</div>
          <div>
            <div className="brand-name">Ponto W</div>
            <div className="brand-sub">GoodWe · EV Challenge</div>
          </div>
        </div>

        <div className="persona-switch">
          <div className="persona-label">Perfil</div>
          {([
            ['motorista', '🚗', 'Motorista'],
            ['lojista', '🏪', 'Lojista'],
            ['rede', '🛰️', 'GoodWe (rede)'],
          ] as [Persona, string, string][]).map(([p, ico, label]) => (
            <button
              key={p}
              className={`persona-btn ${persona === p ? 'active' : ''}`}
              onClick={() => trocarPersona(p)}
            >
              <span className="ico">{ico}</span>
              {label}
            </button>
          ))}
        </div>

        <nav className="nav">
          {MENUS[persona].map((grupo) => (
            <div key={grupo.grupo}>
              <div className="nav-sep">{grupo.grupo}</div>
              {grupo.itens.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/motorista' || item.to === '/lojista' || item.to === '/rede'}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <span className="ico">{item.ico}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          Base de demonstração · {base.sessoes.length.toLocaleString('pt-BR')} sessões
          <br />Dados simulados (mock)
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <h1>{titulo.t}</h1>
            <div className="sub">{titulo.s}</div>
          </div>
          <div className="topbar-actions">
            {persona === 'lojista' && (
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
            {persona === 'lojista' && ponto && (
              <Badge tom={ponto.ativo ? 'green' : 'amber'} dot>
                {ponto.ativo ? 'Operando' : 'Inativo'}
              </Badge>
            )}
            {persona === 'rede' && <Badge tom="teal" dot pulse>{base.pontos.filter(p => p.ativo).length} pontos ativos</Badge>}
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
