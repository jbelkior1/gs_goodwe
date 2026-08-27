import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import Layout from './app/Layout';

import Portal from './pages/portal/Portal';

import Mapa from './pages/motorista/Mapa';
import Recarga from './pages/motorista/Recarga';
import Assistente from './pages/motorista/Assistente';

import Totem from './pages/totem/Totem';

import Painel from './pages/franqueado/Painel';
import Demanda from './pages/franqueado/Demanda';
import Financeiro from './pages/franqueado/Financeiro';

import Visao from './pages/goodwe/Visao';
import Homologacao from './pages/goodwe/Homologacao';

/** Mantém vivo o endereço antigo (/lojista, /rede) apontando para o novo. */
function Redireciona({ de, para }: { de: string; para: string }) {
  const { pathname, search } = useLocation();
  return <Navigate to={pathname.replace(de, para) + search} replace />;
}

/** /motorista/recarga/:sessaoId — a tela lê o parâmetro por conta própria. */
function RecargaComSessao() {
  useParams();
  return <Recarga />;
}

export default function App() {
  return (
    <Routes>
      {/* porta de entrada: escolha do painel */}
      <Route path="/" element={<Portal />} />

      <Route element={<Layout />}>
        {/* motorista — app de celular */}
        <Route path="/motorista" element={<Mapa />} />
        <Route path="/motorista/recarga" element={<Recarga />} />
        <Route path="/motorista/recarga/:sessaoId" element={<RecargaComSessao />} />
        <Route path="/motorista/assistente" element={<Assistente />} />

        {/* totem — quiosque do eletroposto */}
        <Route path="/totem" element={<Totem />} />

        {/* franqueado — o comércio que hospeda o ponto */}
        <Route path="/franqueado" element={<Painel />} />
        <Route path="/franqueado/demanda" element={<Demanda />} />
        <Route path="/franqueado/financeiro" element={<Financeiro />} />

        {/* goodwe — a franqueadora */}
        <Route path="/goodwe" element={<Visao />} />
        <Route path="/goodwe/homologacao" element={<Homologacao />} />
      </Route>

      <Route path="/lojista/*" element={<Redireciona de="/lojista" para="/franqueado" />} />
      <Route path="/lojista" element={<Navigate to="/franqueado" replace />} />
      <Route path="/rede/*" element={<Redireciona de="/rede" para="/goodwe" />} />
      <Route path="/rede" element={<Navigate to="/goodwe" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
