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
  '/lojista': { t: 'Painel da unidade', s: 'Como o ponto está performando neste mês' },
  '/lojista/demanda': { t: 'Controle de demanda', s: 'Distribuição de potência e proteção da entrada elétrica' },
  '/lojista/financeiro': { t: 'Tarifas e financeiro', s: 'Preço dinâmico, cobranças e resultado da unidade' },
  '/rede': { t: 'Visão da rede', s: 'Todos os pontos Ponto W no Brasil' },
  '/rede/homologacao': { t: 'Homologação de pontos', s: 'Análise de viabilidade dos candidatos' },
};

export default function Layout() {
  const { persona, setPersona, pontoId, setPontoId } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const ponto = obterPonto(pontoId);

  const titulo = TITULOS[location.pathname]
    ?? (location.pathname.startsWith('/motorista/recarga')
      ? TITULOS['/motorista/recarga']
      : { t: 'Ponto W', s: '' });

  const trocarPersona = (p: Persona) => {
    setPersona(p);
    navigate(p === 'motorista' ? '/motorista' : p === 'lojista' ? '/lojista' : '/rede');
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
            ['lojista', 'loja', 'Lojista'],
            ['rede', 'antena', 'GoodWe (rede)'],
          ] as [Persona, NomeIcone, string][]).map(([p, ico, label]) => (
            <button
              key={p}
              className={`persona-btn ${persona === p ? 'active' : ''}`}
              onClick={() => trocarPersona(p)}
            >
              <span className="ico"><Icone nome={ico} tamanho={15} /></span>
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
            {persona === 'rede' && (
              <Badge tom="teal" dot pulse>
                {base.pontos.filter((p) => p.ativo).length} pontos ativos
              </Badge>
            )}
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
