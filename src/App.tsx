import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './app/Layout';

import Mapa from './pages/motorista/Mapa';
import Recarga from './pages/motorista/Recarga';
import Pagamento from './pages/motorista/Pagamento';
import Historico from './pages/motorista/Historico';

import Painel from './pages/lojista/Painel';
import Demanda from './pages/lojista/Demanda';
import Carregadores from './pages/lojista/Carregadores';
import Sessoes from './pages/lojista/Sessoes';
import Tarifas from './pages/lojista/Tarifas';
import Financeiro from './pages/lojista/Financeiro';
import Inteligencia from './pages/lojista/Inteligencia';

import Visao from './pages/rede/Visao';
import Pontos from './pages/rede/Pontos';
import Homologacao from './pages/rede/Homologacao';
import Frota from './pages/rede/Frota';
import Royalties from './pages/rede/Royalties';
import IA from './pages/rede/IA';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/lojista" replace />} />

        <Route path="/motorista" element={<Mapa />} />
        <Route path="/motorista/recarga" element={<Recarga />} />
        <Route path="/motorista/recarga/:sessaoId" element={<Recarga />} />
        <Route path="/motorista/pagamento" element={<Pagamento />} />
        <Route path="/motorista/pagamento/:sessaoId" element={<Pagamento />} />
        <Route path="/motorista/historico" element={<Historico />} />

        <Route path="/lojista" element={<Painel />} />
        <Route path="/lojista/demanda" element={<Demanda />} />
        <Route path="/lojista/carregadores" element={<Carregadores />} />
        <Route path="/lojista/sessoes" element={<Sessoes />} />
        <Route path="/lojista/tarifas" element={<Tarifas />} />
        <Route path="/lojista/financeiro" element={<Financeiro />} />
        <Route path="/lojista/inteligencia" element={<Inteligencia />} />

        <Route path="/rede" element={<Visao />} />
        <Route path="/rede/pontos" element={<Pontos />} />
        <Route path="/rede/homologacao" element={<Homologacao />} />
        <Route path="/rede/frota" element={<Frota />} />
        <Route path="/rede/royalties" element={<Royalties />} />
        <Route path="/rede/ia" element={<IA />} />

        <Route path="*" element={<Navigate to="/lojista" replace />} />
      </Route>
    </Routes>
  );
}
