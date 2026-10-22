import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from './estado';
import { comTela, telaDoNavegador } from './tela';
import { sessaoDoMotorista, sessaoRecenteDoMotorista } from '../domain/db';
import { GuiaDemo } from '../ui/GuiaDemo';
import { Icone, type NomeIcone } from '../ui/icones';
import { EMBUTIDO, SEGUIR_RECARGA, useGuiaVisivel } from '../pages/demo/ambienteDemo';

const DEMO = import.meta.env.VITE_MODO_DEMO === 'true';

const ABAS: { to: string; ico: NomeIcone; label: string; fim?: boolean }[] = [
  { to: '/motorista', ico: 'globo', label: 'Mapa', fim: true },
  { to: '/motorista/recarga', ico: 'raio', label: 'Recarga' },
  { to: '/motorista/vincular', ico: 'qr', label: 'Ler QR' },
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
  const navigate = useNavigate();
  const { perfil, motoristaId } = useApp();
  const guia = useGuiaVisivel();
  const ativa = sessaoDoMotorista(perfil?.motoristaId ?? motoristaId);
  const titulo = TITULOS[pathname]
    ?? (pathname.startsWith('/motorista/recarga') ? 'Minha recarga' : pathname.startsWith('/motorista/pagar') ? 'Pagar com Pix' : 'Ponto W');

  // celular do Palco (?seguir=1): vai para "Minha recarga" quando a recarga existe e volta ao mapa quando acaba
  // segue só o ponto da demonstração (?ponto=) e deixa o recibo na tela por 1 minuto depois do Pix
  const emRecarga = pathname.startsWith('/motorista/recarga');
  const pontoSeguido = SEGUIR_RECARGA ? new URLSearchParams(search).get('ponto') : null;
  const temRecarga = SEGUIR_RECARGA
    ? !!sessaoRecenteDoMotorista(perfil?.motoristaId ?? motoristaId, pontoSeguido, 60_000)
    : !!ativa;
  useEffect(() => {
    if (!SEGUIR_RECARGA) return;
    if (temRecarga && !emRecarga) navigate({ pathname: '/motorista/recarga', search }, { replace: true });
    else if (!temRecarga && emRecarga) navigate({ pathname: '/motorista', search }, { replace: true });
  }, [temRecarga, emRecarga, search, navigate]);

  return (
    <div className={`mob${guia ? ' mob-guia' : ''}`}>
      <header className="mob-topo">
        <span className="brand-logo"><Icone nome="raio" tamanho={14} /></span>
        <span className="mob-titulo">{titulo}</span>
        {DEMO && !EMBUTIDO && <Link className="mob-usuario" to={comTela(pathname, search, 'vitrine')} onClick={() => telaDoNavegador(false)}>Sair da tela cheia</Link>}
        {!EMBUTIDO && (perfil
          ? <span className="mob-usuario">{perfil.nome.split(' ')[0]}</span>
          : <Link className="mob-usuario" to={`/entrar?volta=${encodeURIComponent(pathname + search)}`}>Entrar</Link>)}
      </header>
      {guia && <GuiaDemo ambiente="motorista" posicao="fluxo" />}
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
