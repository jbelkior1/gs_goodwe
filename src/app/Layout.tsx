import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp, type Persona } from './estado';
import { base, obterPonto } from '../domain/db';
import { Badge } from '../ui/kit';
import { Icone, type NomeIcone } from '../ui/icones';
import { Totem3D } from '../ui/Totem3D';

const MENUS: Record<Persona, { grupo: string; itens: { to: string; ico: NomeIcone; label: string }[] }[]> = {
  motorista: [
    {
      grupo: 'App do motorista',
      itens: [
        { to: '/motorista/recarga', ico: 'raio', label: 'Recarga e pagamento' },
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
      ],
    },
  ],
  goodwe: [
    {
      grupo: 'Rede GoodWe',
      itens: [
        { to: '/goodwe', ico: 'globo', label: 'Visão da rede' },
        { to: '/goodwe/homologacao', ico: 'check', label: 'Homologação' },
      ],
    },
  ],
};

const TITULOS: Record<string, { t: string; s: string }> = {
  '/motorista': { t: 'Onde carregar', s: 'Pontos da rede disponíveis agora' },
  '/motorista/recarga': { t: 'Recarga e pagamento', s: 'Acompanhe a sessão e feche a conta por Pix' },
  '/motorista/assistente': { t: 'Volt', s: 'O assistente da rede no seu bolso' },
  '/totem': { t: 'Totem do eletroposto', s: 'Autoatendimento com o assistente Volt' },
  '/franqueado': { t: 'Painel da unidade', s: 'Como o ponto está performando neste mês' },
  '/franqueado/demanda': { t: 'Controle de demanda', s: 'Distribuição de potência e proteção da entrada elétrica' },
  '/franqueado/financeiro': { t: 'Tarifas e financeiro', s: 'Preço dinâmico, cobranças e resultado da unidade' },
  '/goodwe': { t: 'Visão da rede', s: 'Todos os pontos Ponto W no Brasil' },
  '/goodwe/homologacao': { t: 'Homologação de pontos', s: 'Análise de viabilidade dos candidatos' },
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
  motorista: '/motorista/recarga',
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
    <div className={`app app-${personaAtual}`}>
      <aside className="sidebar">
        <Link to="/" className="brand" title="Voltar para a escolha de painel">
          <div className="brand-logo"><Icone nome="raio" tamanho={16} /></div>
          <div className="brand-txt">
            <div className="brand-name">GoodWe</div>
            <div className="brand-sub">{ROTULO[personaAtual].sub}</div>
          </div>
          <span className="brand-voltar"><Icone nome="casa" tamanho={14} /></span>
        </Link>

        <div className="persona-switch">
          <div className="persona-label">Painel</div>
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
        </div>

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

        <div className="sidebar-foot">
          BASE DE DEMONSTRAÇÃO · {base.sessoes.length.toLocaleString('pt-BR')} SESSÕES
          <br />DADOS SIMULADOS (MOCK)
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-tit">
            <h1>{titulo.t}</h1>
            <div className="sub">{titulo.s}</div>
          </div>
          <div className="topbar-actions">
            {personaAtual === 'franqueado' && (
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
            {personaAtual === 'franqueado' && ponto && (
              <Badge tom={ponto.ativo ? 'green' : 'amber'} dot>
                {ponto.ativo ? 'Operando' : 'Inativo'}
              </Badge>
            )}
            {personaAtual === 'totem' && <Badge tom="red" dot pulse>totem em operação</Badge>}
            {personaAtual === 'goodwe' && (
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
