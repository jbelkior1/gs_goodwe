/**
 * Simulador das vagas (MVP) — faz o papel do agente do ponto e dos carregadores.
 *
 *   npm run simulador
 *
 * Lê e grava no Supabase com a chave secreta (.env.local). A cada 2 s:
 *   - carro conectado sem sessão → abre sessão ABERTA com código de vínculo (o totem mostra o QR) e
 *     já com o preço cotado, travado por REGRAS.codigoValidadeMin minutos (evento SESSAO_COTADA);
 *   - sessão AUTENTICADO/CARREGANDO/PAUSADO → aplica o controle de demanda e a física da recarga;
 *   - ENCERRANDO, bateria cheia ou limite de valor → fecha a conta (cobrança PENDENTE);
 *   - sessão paga → o carro simulado sai da vaga; cabo removido → expira ou fecha a sessão.
 */
import { createClient } from '@supabase/supabase-js';
import { calcularDemanda, cargaComercioNaHora } from '../src/domain/engine/demanda';
import { calcularTarifa, cent, cotarPonto, repartir, gerarTxid } from '../src/domain/engine/tarifa';
import { geracaoSolarKW } from '../src/domain/engine/solar';
import { ALFABETO_CODIGO, REGIOES, REGRAS, VEICULOS } from '../src/domain/catalogo';
import { fimDeSemana, horaLocal } from '../src/domain/tempo';
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
const EXPIRA_MIN = REGRAS.codigoValidadeMin;
const EM_CARGA = ['AUTENTICADO', 'CARREGANDO', 'PAUSADO', 'ENCERRANDO'];
const ABERTAS = ['ABERTA', ...EM_CARGA, 'CONCLUIDO'];

const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString('pt-BR'), ...a);
const codigo = () => Array.from({ length: 4 }, () => ALFABETO_CODIGO[Math.floor(Math.random() * ALFABETO_CODIGO.length)]).join('');
const id = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;
const r2 = cent;                                            // meio para cima, sem ruído de ponto flutuante
const veiculo = (vid?: string | null) => VEICULOS.find((v) => v.id === vid) ?? VEICULOS[0];

let pontos: Ponto[] = [];
let ultimaCargaPontos = 0;
let ultimaTelemetria = 0;
let ultimoSinal = 0;
const pagasVistas = new Map<string, number>();

async function q<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

async function registrarErro(tipo: string, s: { id?: string; pontoId: string }, detalhe: Record<string, unknown>) {
  await q(sb.from('eventos').insert({ tipo, pontoId: s.pontoId, sessaoId: s.id || null, ator: 'simulador', detalhe }));
  log(`ERRO ${tipo} em ${s.id || s.pontoId}:`, JSON.stringify(detalhe));
}

/**
 * Cotação do preço para uma vaga: o mesmo motor e a mesma conta de ocupação do app (tarifaAtual),
 * na hora e no dia de Brasília. A vaga da sessão cotada já conta como ocupada.
 */
function cotar(ponto: Ponto, doPonto: Carregador[], sessoes: Sessao[], vagaId: string) {
  const regiao = REGIOES.find((r) => r.id === ponto.regiaoId) ?? REGIOES[0];
  const ocupada = (id: string) => {
    const daRecarga = doPonto.find((v) => v.id === id)?.carro?.sessaoId;
    return sessoes.some((x) => x.carregadorId === id && (
      ['ABERTA', ...EM_CARGA].includes(x.estado) || (['CONCLUIDO', 'FATURADO'].includes(x.estado) && x.id === daRecarga)));
  };
  return cotarPonto(ponto, regiao, doPonto, ocupada, new Date(), vagaId);
}

async function fecharConta(s: Sessao, ponto: Ponto, motivo: string) {
  const regiao = REGIOES.find((r) => r.id === ponto.regiaoId) ?? REGIOES[0];
  let valor = r2(s.custoAcumulado);
  if (valor <= 0 && s.energiaKWh > 0) {
    // energia entregue com valor zero: preço nulo ou <= 0 não pode virar recarga de graça. Recota e registra o erro.
    const agora = new Date();
    const preco = s.tarifaAplicadaKWh > 0 ? s.tarifaAplicadaKWh
      : calcularTarifa(ponto, regiao, horaLocal(agora), 0, { fimDeSemana: fimDeSemana(agora) }).precoFinalKWh;
    valor = r2(s.energiaKWh * preco);
    await registrarErro('ERRO_TARIFA_INVALIDA', s, { gravada: s.tarifaAplicadaKWh ?? null, usada: preco, energiaKWh: s.energiaKWh, valor, motivo });
  }
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
  const [vagas, abertas] = await Promise.all([
    q<Carregador[]>(sb.from('carregadores').select('*').in('pontoId', ids)),
    q<Sessao[]>(sb.from('sessoes').select('*').in('pontoId', ids).in('estado', ABERTAS)),
  ]);
  // pagas que ainda importam: a recarga de cada carro que continua no cabo (o id fica anotado no carro)
  const daVez = vagas.map((v) => v.carro?.sessaoId).filter((x): x is string => !!x);
  const pagas = daVez.length ? await q<Sessao[]>(sb.from('sessoes').select('*').in('id', daVez).eq('estado', 'FATURADO')) : [];
  const fechadas = new Set<string>();
  const sessoes = [...abertas, ...pagas];
  const agora = Date.now();
  const dtH = (TICK_MS / 3600000) * ACEL;
  const gravarTelemetria = agora - ultimaTelemetria > 10000;
  if (gravarTelemetria) ultimaTelemetria = agora;
  const amostras: Record<string, unknown>[] = [];
  if (agora - ultimoSinal > 20000) {                      // sinal de vida: sem ele o totem mostra "sem sinal"
    ultimoSinal = agora;
    await q(sb.from('carregadores').update({ ultimoHeartbeat: new Date().toISOString() }).in('pontoId', ids).neq('estado', 'OFFLINE'));
  }

  for (const ponto of pontos) {
    const doPonto = vagas.filter((v) => v.pontoId === ponto.id);

    // ------------------------------------------------ conexões, expiração e saída do carro
    for (const vaga of doPonto) {
      // uma sessão terminada (a pagar ou paga) só "segura" a vaga se é a recarga do carro que está no cabo
      const daRecarga = (x: Sessao) => !['CONCLUIDO', 'FATURADO'].includes(x.estado) || x.id === vaga.carro?.sessaoId;
      const s = sessoes.filter((x) => x.carregadorId === vaga.id && daRecarga(x))
        .sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
      if (vaga.carro && !s && vaga.estado !== 'MANUTENCAO') {
        // a cotação nasce aqui e fica travada por EXPIRA_MIN minutos: o totem mostra este preço e o app confirma o mesmo
        const tarifa = cotar(ponto, doPonto, sessoes, vaga.id);
        if (!(tarifa.precoFinalKWh > 0)) {                  // nunca abre recarga sem preço
          await registrarErro('ERRO_COTACAO', { id: '', pontoId: ponto.id }, { vaga: vaga.id, preco: tarifa.precoFinalKWh });
          continue;
        }
        const inicio = new Date();
        const nova = {
          id: id('s'), pontoId: ponto.id, carregadorId: vaga.id, veiculoId: vaga.carro.veiculoId,
          inicio: inicio.toISOString(), socInicial: vaga.carro.socReal, socAtual: vaga.carro.socReal,
          energiaKWh: 0, potenciaAtualKW: 0, estado: 'ABERTA', tarifaAplicadaKWh: tarifa.precoFinalKWh,
          custoAcumulado: 0, codigoVinculo: codigo(),
        };
        await q(sb.from('sessoes').insert(nova));
        // anota no carro qual é a recarga dele (só se o carro ainda está lá: a bancada pode ter desconectado)
        await q(sb.from('carregadores').update({ estado: 'OCUPADO', carro: { ...vaga.carro, sessaoId: nova.id } }).eq('id', vaga.id).not('carro', 'is', null));
        // o registro da cotação é só auditoria: se falhar, a recarga segue
        try {
          await q(sb.from('eventos').insert({
            tipo: 'SESSAO_COTADA', pontoId: ponto.id, sessaoId: nova.id, ator: 'simulador',
            detalhe: {
              precoKWh: tarifa.precoFinalKWh, validaAte: new Date(inicio.getTime() + EXPIRA_MIN * 60000).toISOString(),
              hora: horaLocal(inicio), faixa: tarifa.faixa, precoBaseKWh: tarifa.precoBaseKWh, fatorHorario: tarifa.fatorHorario,
              adicionalEscassez: tarifa.adicionalEscassez, descontoSolar: tarifa.descontoSolar, pisoKWh: tarifa.pisoKWh,
              tetoKWh: tarifa.tetoKWh, custoEnergiaKWh: tarifa.custoEnergiaKWh, margemKWh: tarifa.margemKWh,
              proxima: tarifa.proxima ?? null, explicacao: tarifa.explicacao,
            },
          }));
        } catch (e) { log('evento SESSAO_COTADA não gravado:', (e as Error).message); }
        log(`carro conectado em ${ponto.nome} / ${vaga.apelido}: código ${nova.codigoVinculo} · R$ ${tarifa.precoFinalKWh.toFixed(2)}/kWh`);
        continue;
      }
      if (!s) {
        if (!vaga.carro && vaga.estado === 'OCUPADO') await q(sb.from('carregadores').update({ estado: 'DISPONIVEL', potenciaPermitidaKW: 0 }).eq('id', vaga.id));
        continue;
      }
      if (!vaga.carro) {                                     // cabo removido
        if (s.estado === 'ABERTA') await q(sb.from('sessoes').update({ estado: 'EXPIRADA', codigoVinculo: null, fim: new Date().toISOString() }).eq('id', s.id).eq('estado', 'ABERTA'));
        else if (EM_CARGA.includes(s.estado)) { await fecharConta(s, ponto, 'cabo removido'); fechadas.add(s.id); }
        await q(sb.from('carregadores').update({ estado: 'DISPONIVEL', potenciaPermitidaKW: 0 }).eq('id', vaga.id));
        continue;
      }
      if (s.estado === 'ABERTA' && agora - new Date(s.inicio).getTime() > EXPIRA_MIN * 60000) {
        // o motorista pode ter confirmado bem na hora: só expira o que ainda está ABERTA
        const expirou = await q<{ id: string }[]>(sb.from('sessoes').update({ estado: 'EXPIRADA', codigoVinculo: null, fim: new Date().toISOString() }).eq('id', s.id).eq('estado', 'ABERTA').select('id'));
        if (!expirou.length) continue;
        await q(sb.from('carregadores').update({ carro: null, estado: 'DISPONIVEL' }).eq('id', vaga.id));
        log(`código ${s.codigoVinculo} expirou`);
        continue;
      }
      if (s.estado === 'FATURADO') {                         // pagou: o motorista desconecta alguns segundos depois
        const vista = pagasVistas.get(s.id) ?? agora;
        pagasVistas.set(s.id, vista);
        // o motorista tira o cabo uns 20 s depois de pagar: dá tempo de o totem mostrar o recibo
        if (agora - vista > 20000) {
          await q(sb.from('carregadores').update({ carro: null, estado: 'DISPONIVEL', potenciaPermitidaKW: 0 }).eq('id', vaga.id));
          pagasVistas.delete(s.id);
          log(`carro saiu de ${vaga.apelido} (${ponto.nome})`);
        }
      }
    }

    // ------------------------------------------------ controle de demanda e física
    const ativas = sessoes.filter((s) => s.pontoId === ponto.id && ['AUTENTICADO', 'CARREGANDO', 'PAUSADO'].includes(s.estado));
    for (const s of sessoes.filter((x) => x.pontoId === ponto.id && x.estado === 'ENCERRANDO' && !fechadas.has(x.id))) await fecharConta(s, ponto, 'pedido de encerramento');
    if (!ativas.length) continue;

    const h = horaLocal();
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
      let preco = s.tarifaAplicadaKWh;
      if (!(preco > 0)) {                                    // preço nulo ou <= 0 nunca vira recarga de graça: recota e avisa
        preco = cotar(ponto, doPonto, sessoes, s.carregadorId).precoFinalKWh;
        await q(sb.from('sessoes').update({ tarifaAplicadaKWh: preco }).eq('id', s.id).in('estado', ['AUTENTICADO', 'CARREGANDO', 'PAUSADO']));
        await registrarErro('ERRO_TARIFA_INVALIDA', s, { gravada: s.tarifaAplicadaKWh ?? null, recotada: preco });
        s.tarifaAplicadaKWh = preco;
      }
      const custo = r2(energia * preco);
      const pausado = !!a?.pausado;
      const atualizado = {
        estado: pausado ? 'PAUSADO' : 'CARREGANDO', energiaKWh: Number(energia.toFixed(3)), socAtual: Number(soc.toFixed(1)),
        potenciaAtualKW: Number(pot.toFixed(2)), custoAcumulado: custo, motivoPausa: a?.motivo ?? null,
      };
      // só grava se ninguém mudou o estado no meio do ciclo (ex.: o motorista pediu para encerrar)
      const gravou = await q<{ id: string }[]>(sb.from('sessoes').update(atualizado).eq('id', s.id).in('estado', ['AUTENTICADO', 'CARREGANDO', 'PAUSADO']).select('id'));
      if (!gravou.length) continue;
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
