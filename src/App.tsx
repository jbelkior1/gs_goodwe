import { useEffect, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { telaCheia } from './app/tela';
import Layout from './app/Layout';
import AppMotorista from './app/AppMotorista';
import { Quiosque } from './ui/Quiosque';
import { GuiaDemo } from './ui/GuiaDemo';
import { useApp } from './app/estado';
import { bancoConfigurado } from './data/supabase';
import { lerPontoGuardado } from './data/totens';
import { garantirHistorico } from './domain/db';
import Demo from './pages/demo/Demo';
import { DemoGlobal } from './pages/demo/DemoGlobal';
import Entrar from './pages/entrar/Entrar';
import Mapa from './pages/motorista/Mapa';
import Vincular from './pages/motorista/Vincular';
import MeuPonto from './pages/franqueado/MeuPonto';
import SejaGoodwe from './pages/SejaGoodwe';

import Portal from './pages/portal/Portal';

import Recarga from './pages/motorista/Recarga';
import Pagar from './pages/motorista/Pagar';
import Assistente from './pages/motorista/Assistente';

import Totem from './pages/totem/Totem';

import Painel from './pages/franqueado/Painel';
import Demanda from './pages/franqueado/Demanda';
import Financeiro from './pages/franqueado/Financeiro';

import Visao from './pages/goodwe/Visao';
import Homologacao from './pages/goodwe/Homologacao';
import Prospeccao from './pages/goodwe/Prospeccao';

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

function CascaMotorista() {
  const { search } = useLocation();
  return telaCheia('motorista', search) ? <AppMotorista /> : <Layout />;
}

/** franqueado e GoodWe: mesma tela, com ou sem a troca de painel da vitrine */
function CascaPainel() {
  const { pathname, search } = useLocation();
  return <Layout cheia={telaCheia(pathname.startsWith('/goodwe') ? 'goodwe' : 'franqueado', search)} />;
}

function CascaTotem() {
  const { search } = useLocation();
  return telaCheia('totem', search) ? <Outlet /> : <Layout />;
}

/**
 * Guia didático do totem em tela cheia: faixa por fora do totem, sem mexer nas telas dele. Usa o mesmo
 * ponto que o aparelho usa (?ponto= ou o que ficou guardado) e relê o que ficou guardado de tempos em
 * tempos, porque o pareamento grava o ponto sem avisar a base.
 */
function GuiaDoTotem() {
  const { search } = useLocation();
  const [, relogio] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => relogio((n) => n + 1), 4000);
    return () => window.clearInterval(id);
  }, []);
  const ponto = new URLSearchParams(search).get('ponto') ?? lerPontoGuardado();
  return <GuiaDemo ambiente="totem" posicao="topo-fixo" pontoId={ponto ?? undefined} semPonto={!ponto && bancoConfigurado} />;
}

function TotemNaTela() {
  const { search } = useLocation();
  return telaCheia('totem', search)
    ? (
      <>
        <GuiaDoTotem />
        <Quiosque>{(o) => <Totem orientacao={o} aparelho />}</Quiosque>
      </>
    )
    : <Totem />;
}

/** fora do quiosque (painéis, vitrine, franquia) as telas precisam do histórico inteiro da janela */
function HistoricoFora() {
  const { pathname, search } = useLocation();
  const embutido = new URLSearchParams(search).get('embed') === '1';
  const quiosque = embutido
    || (pathname.startsWith('/totem') && telaCheia('totem', search))
    || (pathname.startsWith('/motorista') && telaCheia('motorista', search));
  useEffect(() => { if (!quiosque) garantirHistorico(); }, [quiosque]);
  return null;
}

export default function App() {
  // lê o contexto para recriar as telas a cada atualização do banco em tempo real
  useApp();
  return (
    <>
    {/* ?conta= e ?guia= da demonstração, em qualquer rota */}
    <DemoGlobal />
    <HistoricoFora />
    <Routes>
      {/* porta de entrada: escolha do painel */}
      <Route path="/" element={<Portal />} />
      <Route path="/entrar" element={<Entrar />} />

      {/* central da demonstração: fluxograma ao vivo, links dos aparelhos e o palco */}
      <Route path="/demo" element={<Demo />} />

      {/* totem — vitrine no notebook ou quiosque em tela cheia no aparelho real */}
      <Route element={<CascaTotem />}>
        <Route path="/totem" element={<TotemNaTela />} />
      </Route>

      {/* motorista — vitrine (celular emoldurado) ou app em tela cheia no celular */}
      <Route element={<CascaMotorista />}>
        <Route path="/motorista" element={<Mapa />} />
        <Route path="/motorista/vincular" element={<Vincular />} />
        <Route path="/motorista/recarga" element={<Recarga />} />
        <Route path="/motorista/recarga/:sessaoId" element={<RecargaComSessao />} />
        <Route path="/motorista/pagar/:cobrancaId" element={<Pagar />} />
        <Route path="/motorista/assistente" element={<Assistente />} />
      </Route>

      {/* franqueado e GoodWe — painéis de computador (vitrine ou só o ambiente do papel) */}
      <Route element={<CascaPainel />}>

        {/* franqueado — o comércio que hospeda o ponto */}
        <Route path="/franqueado" element={<Painel />} />
        <Route path="/franqueado/demanda" element={<Demanda />} />
        <Route path="/franqueado/financeiro" element={<Financeiro />} />
        <Route path="/franqueado/ponto" element={<MeuPonto />} />

        {/* goodwe — a franqueadora */}
        <Route path="/goodwe" element={<Visao />} />
        <Route path="/goodwe/homologacao" element={<Homologacao />} />
        <Route path="/goodwe/prospeccao" element={<Prospeccao />} />
      </Route>

      <Route path="/seja-goodwe" element={<SejaGoodwe />} />

      <Route path="/lojista/*" element={<Redireciona de="/lojista" para="/franqueado" />} />
      <Route path="/lojista" element={<Navigate to="/franqueado" replace />} />
      <Route path="/rede/*" element={<Redireciona de="/rede" para="/goodwe" />} />
      <Route path="/rede" element={<Navigate to="/goodwe" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
