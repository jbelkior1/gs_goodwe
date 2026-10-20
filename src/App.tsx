import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import Layout from './app/Layout';
import AppMotorista from './app/AppMotorista';
import { Quiosque } from './ui/Quiosque';
import { useApp } from './app/estado';
import Entrar from './pages/entrar/Entrar';
import Mapa from './pages/motorista/Mapa';
import Vincular from './pages/motorista/Vincular';
import MeuPonto from './pages/franqueado/MeuPonto';
import SejaGoodwe from './pages/SejaGoodwe';

import Portal from './pages/portal/Portal';

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
  // lê o contexto para recriar as telas a cada atualização do banco em tempo real
  useApp();
  return (
    <Routes>
      {/* porta de entrada: escolha do painel */}
      <Route path="/" element={<Portal />} />
      <Route path="/entrar" element={<Entrar />} />

      {/* totem — quiosque em tela cheia no aparelho real (vertical ou horizontal) */}
      <Route path="/totem" element={<Quiosque>{(o) => <Totem orientacao={o} />}</Quiosque>} />

      {/* motorista — app em tela cheia no celular */}
      <Route element={<AppMotorista />}>
        <Route path="/motorista" element={<Mapa />} />
        <Route path="/motorista/vincular" element={<Vincular />} />
        <Route path="/motorista/recarga" element={<Recarga />} />
        <Route path="/motorista/recarga/:sessaoId" element={<RecargaComSessao />} />
        <Route path="/motorista/assistente" element={<Assistente />} />
      </Route>

      {/* franqueado e GoodWe — painéis de computador */}
      <Route element={<Layout />}>

        {/* franqueado — o comércio que hospeda o ponto */}
        <Route path="/franqueado" element={<Painel />} />
        <Route path="/franqueado/demanda" element={<Demanda />} />
        <Route path="/franqueado/financeiro" element={<Financeiro />} />
        <Route path="/franqueado/ponto" element={<MeuPonto />} />

        {/* goodwe — a franqueadora */}
        <Route path="/goodwe" element={<Visao />} />
        <Route path="/goodwe/homologacao" element={<Homologacao />} />
      </Route>

      <Route path="/seja-goodwe" element={<SejaGoodwe />} />

      <Route path="/lojista/*" element={<Redireciona de="/lojista" para="/franqueado" />} />
      <Route path="/lojista" element={<Navigate to="/franqueado" replace />} />
      <Route path="/rede/*" element={<Redireciona de="/rede" para="/goodwe" />} />
      <Route path="/rede" element={<Navigate to="/goodwe" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
