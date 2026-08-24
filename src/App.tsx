import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './app/Layout';

import Mapa from './pages/motorista/Mapa';
import Recarga from './pages/motorista/Recarga';

import Painel from './pages/lojista/Painel';
import Demanda from './pages/lojista/Demanda';
import Financeiro from './pages/lojista/Financeiro';

import Visao from './pages/rede/Visao';
import Homologacao from './pages/rede/Homologacao';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/lojista" replace />} />

        <Route path="/motorista" element={<Mapa />} />
        <Route path="/motorista/recarga" element={<Recarga />} />
        <Route path="/motorista/recarga/:sessaoId" element={<Recarga />} />

        <Route path="/lojista" element={<Painel />} />
        <Route path="/lojista/demanda" element={<Demanda />} />
        <Route path="/lojista/financeiro" element={<Financeiro />} />

        <Route path="/rede" element={<Visao />} />
        <Route path="/rede/homologacao" element={<Homologacao />} />

        <Route path="*" element={<Navigate to="/lojista" replace />} />
      </Route>
    </Routes>
  );
}
