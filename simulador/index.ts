/**
 * Simulador das vagas (MVP) — faz o papel do agente do ponto e dos carregadores.
 *
 *   npm run simulador
 *
 * Lê e grava no Supabase com a chave secreta (.env.local). A cada 2 s:
 *   - carro conectado sem sessão → abre sessão ABERTA com código de vínculo (o totem mostra o QR);
 *   - sessão AUTENTICADO/CARREGANDO/PAUSADO → aplica o controle de demanda e a física da recarga;
 *   - ENCERRANDO, bateria cheia ou limite de valor → fecha a conta (cobrança PENDENTE);
 *   - sessão paga → o carro simulado sai da vaga; cabo removido → expira ou fecha a sessão.
 */
import { createClient } from '@supabase/supabase-js';
import { calcularDemanda, cargaComercioNaHora } from '../src/domain/engine/demanda';
import { calcularTarifa, repartir, gerarTxid } from '../src/domain/engine/tarifa';
import { geracaoSolarKW } from '../src/domain/engine/solar';
import { REGIOES, VEICULOS } from '../src/domain/catalogo';
import type { Carregador, Ponto, Sessao } from '../src/domain/types';

const URL = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SECRET_KEY;
if (!URL || !CHAVE) {
  console.error('Faltam SUPABASE_URL e SUPABASE_SECRET_KEY no .env.local');
  process.exit(1);
}
const sb = createClient(URL, CHAVE, { auth: { persistSession: false } });
const ACEL = Number(process.env.SIM_ACELERACAO ?? 10);
const TICK_MS = 2000;
const EXPIRA_MIN = 10;
const ALFABETO = 'ACDEFHJKMNPRTUVWXY3479';
const EM_CARGA = ['AUTENTICADO', 'CARREGANDO', 'PAUSADO', 'ENCERRANDO'];
const ABERTAS = ['ABERTA', ...EM_CARGA, 'CONCLUIDO'];

const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString('pt-BR'), ...a);
const codigo = () => Array.from({ length: 4 }, () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)]).join('');
const id = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;
const r2 = (v: number) => Math.round(v * 100) / 100;
const veiculo = (vid?: string | null) => VEICULOS.find((v) => v.id === vid) ?? VEICULOS[0];

let pontos: Ponto[] = [];
let ultimaCargaPontos = 0;
let ultimaTelemetria = 0;
const pagasVistas = new Map<string, number>();

async function q<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

async function fecharConta(s: Sessao, ponto: Ponto, motivo: string) {
  const regiao = REGIOES.find((r) => r.id === ponto.regiaoId) ?? REGIOES[0];
  const valor = r2(s.custoAcumulado);
  const rep = repartir(valor, s.energiaKWh, regiao.custoEnergiaKWh);
  if (valor > 0) {
    await q(sb.from('cobrancas').upsert({
      id: `cb-${s.id}`, sessaoId: s.id, pontoId: s.pontoId, valor, metodo: 'PIX', status: 'PENDENTE', txid: gerarTxid(s.id),
      custoEnergia: rep.custoEnergia, royaltyGoodWe: rep.royaltyGoodWe, fundoMarketing: rep.fundoMarketing,
      gateway: rep.gateway, liquidoLojista: rep.liquidoLojista,
    }, { onConflict: 'sessaoId' }));
  }
  await q(sb.from('sessoes').update({ estado: valor > 0 ? 'CONCLUIDO' : 'FATURADO', fim: new Date().toISOString(), potenciaAtualKW: 0 }).eq('id', s.id));
  await q(sb.from('eventos').insert({ tipo: 'SESSAO_ENCERRADA', pontoId: s.pontoId, sessaoId: s.id, ator: 'simulador', detalhe: { motivo, valor, energia: s.energiaKWh } }));
  log(`fim ${s.id} (${motivo}): ${s.energiaKWh.toFixed(2)} kWh, R$ ${valor.toFixed(2)}`);
}

async function ciclo() {
  if (Date.now() - ultimaCargaPontos > 30000) {
    pontos = await q<Ponto[]>(sb.from('pontos').select('*').eq('status', 'ATIVO'));
    ultimaCargaPontos = Date.now();
  }
  const ids = pontos.map((p) => p.id);
  if (!ids.length) return;
  const recente = new Date(Date.now() - 15 * 60000).toISOString();
  const [vagas, abertas, pagas] = await Promise.all([
    q<Carregador[]>(sb.from('carregadores').select('*').in('pontoId', ids)),
    q<Sessao[]>(sb.from('sessoes').select('*').in('pontoId', ids).in('estado', ABERTAS)),
    // só pagamentos recentes de sessões reais (o histórico de demonstração também está FATURADO)
    q<Sessao[]>(sb.from('sessoes').select('*').in('pontoId', ids).eq('estado', 'FATURADO').eq('demo', false).gte('fim', recente)),
  ]);
  const sessoes = [...abertas, ...pagas];
  const agora = Date.now();
  const dtH = (TICK_MS / 3600000) * ACEL;
  const gravarTelemetria = agora - ultimaTelemetria > 10000;
  if (gravarTelemetria) ultimaTelemetria = agora;
  const amostras: Record<string, unknown>[] = [];

  for (const ponto of pontos) {
    const doPonto = vagas.filter((v) => v.pontoId === ponto.id);

    // ------------------------------------------------ conexões, expiração e saída do carro
    for (const vaga of doPonto) {
      const s = sessoes.filter((x) => x.carregadorId === vaga.id).sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
      if (vaga.carro && !s && vaga.estado !== 'MANUTENCAO') {
        const tarifa = calcularTarifa(ponto, REGIOES.find((r) => r.id === ponto.regiaoId) ?? REGIOES[0], new Date().getHours(), 0.5);
        const nova = {
          id: id('s'), pontoId: ponto.id, carregadorId: vaga.id, veiculoId: vaga.carro.veiculoId,
          inicio: new Date().toISOString(), socInicial: vaga.carro.socReal, socAtual: vaga.carro.socReal,
          energiaKWh: 0, potenciaAtualKW: 0, estado: 'ABERTA', tarifaAplicadaKWh: tarifa.precoFinalKWh,
          custoAcumulado: 0, codigoVinculo: codigo(),
        };
        await q(sb.from('sessoes').insert(nova));
        if (vaga.estado !== 'OCUPADO') await q(sb.from('carregadores').update({ estado: 'OCUPADO' }).eq('id', vaga.id));
        log(`carro conectado em ${ponto.nome} / ${vaga.apelido}: código ${nova.codigoVinculo}`);
        continue;
      }
      if (!s) {
        if (!vaga.carro && vaga.estado === 'OCUPADO') await q(sb.from('carregadores').update({ estado: 'DISPONIVEL', potenciaPermitidaKW: 0 }).eq('id', vaga.id));
        continue;
      }
      if (!vaga.carro) {                                     // cabo removido
        if (s.estado === 'ABERTA') await q(sb.from('sessoes').update({ estado: 'EXPIRADA', codigoVinculo: null }).eq('id', s.id));
        else if (EM_CARGA.includes(s.estado)) await fecharConta(s, ponto, 'cabo removido');
        await q(sb.from('carregadores').update({ estado: 'DISPONIVEL', potenciaPermitidaKW: 0 }).eq('id', vaga.id));
        continue;
      }
      if (s.estado === 'ABERTA' && agora - new Date(s.inicio).getTime() > EXPIRA_MIN * 60000) {
        await q(sb.from('sessoes').update({ estado: 'EXPIRADA', codigoVinculo: null }).eq('id', s.id));
        await q(sb.from('carregadores').update({ carro: null, estado: 'DISPONIVEL' }).eq('id', vaga.id));
        log(`código ${s.codigoVinculo} expirou`);
        continue;
      }
      if (s.estado === 'FATURADO') {                         // pagou: o motorista desconecta alguns segundos depois
        const vista = pagasVistas.get(s.id) ?? agora;
        pagasVistas.set(s.id, vista);
        if (agora - vista > 6000) {
          await q(sb.from('carregadores').update({ carro: null, estado: 'DISPONIVEL', potenciaPermitidaKW: 0 }).eq('id', vaga.id));
          pagasVistas.delete(s.id);
          log(`carro saiu de ${vaga.apelido} (${ponto.nome})`);
        }
      }
    }

    // ------------------------------------------------ controle de demanda e física
    const ativas = sessoes.filter((s) => s.pontoId === ponto.id && ['AUTENTICADO', 'CARREGANDO', 'PAUSADO'].includes(s.estado));
    for (const s of sessoes.filter((x) => x.pontoId === ponto.id && x.estado === 'ENCERRANDO')) await fecharConta(s, ponto, 'pedido de encerramento');
    if (!ativas.length) continue;

    const h = new Date().getHours();
    const cargaLiquida = Math.max(0, cargaComercioNaHora(ponto, h) - geracaoSolarKW(ponto, h));
    const maxPorSessao: Record<string, number> = {};
    for (const s of ativas) maxPorSessao[s.id] = veiculo(s.veiculoId).potenciaMaxACkW;
    const d = calcularDemanda({ ponto, carregadores: doPonto, sessoesAtivas: ativas, cargaComercioKW: cargaLiquida }, maxPorSessao);

    for (const s of ativas) {
      const a = d.alocacoes.find((x) => x.sessaoId === s.id);
      const pot = a?.potenciaConcedidaKW ?? 0;
      const v = veiculo(s.veiculoId);
      const energia = s.energiaKWh + pot * dtH;
      const soc = Math.min(100, s.socAtual + ((pot * dtH * 0.92) / v.capacidadeKWh) * 100);
      const custo = r2(energia * (s.tarifaAplicadaKWh ?? 0));
      const pausado = !!a?.pausado;
      const atualizado = {
        estado: pausado ? 'PAUSADO' : 'CARREGANDO', energiaKWh: Number(energia.toFixed(3)), socAtual: Number(soc.toFixed(1)),
        potenciaAtualKW: Number(pot.toFixed(2)), custoAcumulado: custo, motivoPausa: a?.motivo ?? null,
      };
      await q(sb.from('sessoes').update(atualizado).eq('id', s.id));
      if (a) await q(sb.from('carregadores').update({ potenciaPermitidaKW: atualizado.potenciaAtualKW }).eq('id', s.carregadorId));
      if (gravarTelemetria) {
        const tensao = 220 + (Math.random() - 0.5) * 4;
        amostras.push({ sessaoId: s.id, tensaoV: Number(tensao.toFixed(1)), correnteA: Number(((pot * 1000) / tensao).toFixed(1)),
          potenciaKW: atualizado.potenciaAtualKW, soc: atualizado.socAtual, energiaAcumKWh: atualizado.energiaKWh });
      }
      const fechar = soc >= 99.5 ? 'bateria cheia' : s.limiteValor && custo >= s.limiteValor ? 'limite de valor' : null;
      if (fechar) await fecharConta({ ...s, ...atualizado } as Sessao, ponto, fechar);
    }
  }
  if (amostras.length) await q(sb.from('telemetria').insert(amostras));
}

log(`simulador ligado · aceleração ${ACEL}× · ciclo de ${TICK_MS / 1000} s`);
let rodando = false;
setInterval(async () => {
  if (rodando) return;
  rodando = true;
  try { await ciclo(); } catch (e) { log('erro no ciclo:', (e as Error).message); } finally { rodando = false; }
}, TICK_MS);
