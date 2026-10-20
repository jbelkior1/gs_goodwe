import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useApp } from './estado';
import { comTela, telaDoNavegador } from './tela';
import { sessaoDoMotorista } from '../domain/db';
import { Icone, type NomeIcone } from '../ui/icones';

const DEMO = import.meta.env.VITE_MODO_DEMO === 'true';

const ABAS: { to: string; ico: NomeIcone; label: string; fim?: boolean }[] = [
  { to: '/motorista', ico: 'globo', label: 'Carregar', fim: true },
  { to: '/motorista/recarga', ico: 'raio', label: 'Recarga' },
  { to: '/motorista/vincular', ico: 'check', label: 'Código' },
  { to: '/motorista/assistente', ico: 'chat', label: 'Volt' },
];

const TITULOS: Record<string, string> = {
  '/motorista': 'Onde carregar',
  '/motorista/vincular': 'Confirmar recarga',
  '/motorista/assistente': 'Volt',
};

/** App do motorista em tela cheia no celular real: barra no topo, conteúdo e abas embaixo. */
export default function AppMotorista() {
  const { pathname, search } = useLocation();
  const { perfil, motoristaId } = useApp();
  const ativa = sessaoDoMotorista(perfil?.motoristaId ?? motoristaId);
  const titulo = TITULOS[pathname] ?? (pathname.startsWith('/motorista/recarga') ? 'Minha recarga' : 'Ponto W');

  return (
    <div className="mob">
      <header className="mob-topo">
        <span className="brand-logo"><Icone nome="raio" tamanho={14} /></span>
        <span className="mob-titulo">{titulo}</span>
        {DEMO && <Link className="mob-usuario" to={comTela(pathname, search, 'vitrine')} onClick={() => telaDoNavegador(false)}>Sair da tela cheia</Link>}
        {perfil
          ? <span className="mob-usuario">{perfil.nome.split(' ')[0]}</span>
          : <Link className="mob-usuario" to={`/entrar?volta=${encodeURIComponent(pathname)}`}>Entrar</Link>}
      </header>
      <main className="mob-conteudo celular-tela">
        <Outlet />
      </main>
      <nav className="mob-abas">
        {ABAS.map((a) => (
          <NavLink key={a.to} to={a.to} end={a.fim} className={({ isActive }) => `mob-aba ${isActive ? 'on' : ''}`}>
            <Icone nome={a.ico} tamanho={18} />
            <span>{a.label}</span>
            {a.to === '/motorista/recarga' && ativa && <i className="mob-ponto" />}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
