import { PRNG, NOMES, COMERCIOS } from './prng';
import {
  FORMATOS,
  MODELOS_CARREGADOR,
  REGIOES,
  SEGMENTOS,
  VEICULOS,
  CURVA_DEMANDA_HORA,
} from './catalogo';
import { repartir } from './engine/tarifa';
import { analisarViabilidade } from './engine/ia';
import type {
  Carregador,
  Cobranca,
  FormatoFranquia,
  Franqueado,
  Motorista,
  Ponto,
  Sessao,
  SolicitacaoHomologacao,
  AmostraTelemetria,
  EstadoCarregador,
} from './types';

/**
 * BASE FALSA (mock) do Ponto W.
 *
 * Gera uma rede inteira e 90 dias de histórico de recarga com dados
 * coerentes entre si: a energia bate com a potência e o tempo, o custo bate
 * com a tarifa, o SoC final bate com a energia entregue e a capacidade do
 * carro. Tudo determinístico (semente fixa), para o painel não mudar a cada F5.
 *
 * Quando a integração real existir, esta camada é substituída pelo Modbus +
 * SEMS+ sem que a interface precise mudar.
 */

export interface BaseDados {
  franqueados: Franqueado[];
  pontos: Ponto[];
  carregadores: Carregador[];
  motoristas: Motorista[];
  sessoes: Sessao[];
  telemetria: AmostraTelemetria[];
  cobrancas: Cobranca[];
  homologacoes: SolicitacaoHomologacao[];
  geradoEm: string;
}

const DIAS_HISTORICO = 90;

function cnpj(r: PRNG): string {
  const n = (d: number) => Array.from({ length: d }, () => r.int(0, 9)).join('');
  return `${n(2)}.${n(3)}.${n(3)}/0001-${n(2)}`;
}

function iso(d: Date): string {
  return d.toISOString();
}

/** Sorteia uma hora de início respeitando a curva de demanda do comércio. */
function horaPorCurva(r: PRNG): number {
  return r.weighted(CURVA_DEMANDA_HORA);
}

export function gerarBase(seed = 20260819): BaseDados {
  const r = new PRNG(seed);
  const agora = new Date();

  // ------------------------------------------------------------ franqueados
  const franqueados: Franqueado[] = [];
  const pontos: Ponto[] = [];
  const carregadores: Carregador[] = [];

  const distribuicaoFormato: FormatoFranquia[] = [
    'Standard', 'Light', 'Standard', 'Hub', 'Standard', 'Light',
    'Standard', 'Standard', 'Hub', 'Light', 'Standard', 'Standard',
    'Light', 'Hub', 'Standard', 'Light',
  ];

  distribuicaoFormato.forEach((formato, i) => {
    const nomeComercio = COMERCIOS[i % COMERCIOS.length];
    const regiao = REGIOES[i % REGIOES.length];
    const segmento = r.pick(SEGMENTOS);
    const cfg = FORMATOS[formato];

    const franqueado: Franqueado = {
      id: `f-${String(i + 1).padStart(3, '0')}`,
      nome: r.pick(NOMES),
      razaoSocial: `${nomeComercio} Comércio LTDA`,
      cnpj: cnpj(r),
      desde: iso(new Date(agora.getTime() - r.int(120, 900) * 86400000)),
    };
    franqueados.push(franqueado);

    const potenciaModelo = MODELOS_CARREGADOR[cfg.modelo].potenciaKW;
    // entrada elétrica: cobre os carregadores + a carga do comércio, com folga variável
    const cargaBaseKW = Number(r.float(6, 26).toFixed(1));
    const folga = r.float(0.9, 1.35);
    const limitePotenciaKW = Number(
      ((cfg.carregadores * potenciaModelo + cargaBaseKW) * folga).toFixed(1),
    );

    const ponto: Ponto = {
      id: `p-${String(i + 1).padStart(3, '0')}`,
      nome: nomeComercio,
      franqueadoId: franqueado.id,
      regiaoId: regiao.id,
      endereco: `${r.pick(['Av.', 'Rua', 'Alameda'])} ${r.pick(['das Palmeiras', 'Brasil', 'Santo Antônio', 'do Comércio', 'Ipiranga', 'Nove de Julho'])}, ${r.int(50, 2400)} — ${regiao.zona}, ${regiao.cidade}/${regiao.uf}`,
      formato,
      segmento,
      limiteCorrenteA: Math.round((limitePotenciaKW * 1000) / 220),
      limitePotenciaKW,
      cargaBaseKW,
      precoBaseKWh: Number(r.float(1.65, 2.15).toFixed(2)),
      ativo: r.chance(0.93),
      inauguradoEm: iso(new Date(agora.getTime() - r.int(100, 800) * 86400000)),
      lat: Number(r.float(-30, -8).toFixed(4)),
      lng: Number(r.float(-51, -35).toFixed(4)),
    };
    pontos.push(ponto);

    for (let c = 0; c < cfg.carregadores; c++) {
      const estado: EstadoCarregador = !ponto.ativo
        ? 'MANUTENCAO'
        : r.chance(0.06)
          ? 'OFFLINE'
          : 'DISPONIVEL';
      carregadores.push({
        id: `${ponto.id}-c${c + 1}`,
        pontoId: ponto.id,
        apelido: `Vaga ${c + 1}`,
        modelo: cfg.modelo,
        estado,
        potenciaPermitidaKW: potenciaModelo,
        firmware: `HCA-G2 v${r.int(2, 4)}.${r.int(0, 9)}.${r.int(0, 9)}`,
        ultimoHeartbeat: iso(
          new Date(agora.getTime() - (estado === 'OFFLINE' ? r.int(45, 600) : r.int(0, 4)) * 60000),
        ),
      });
    }
  });

  // ------------------------------------------------------------ motoristas
  const motoristas: Motorista[] = NOMES.map((nome, i) => ({
    id: `m-${String(i + 1).padStart(3, '0')}`,
    nome,
    email: `${nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(' ')[0]}.${i}@email.com`,
    rfidUid: Array.from({ length: 8 }, () => '0123456789ABCDEF'[r.int(0, 15)]).join(''),
    veiculoId: r.pick(VEICULOS).id,
    desde: iso(new Date(agora.getTime() - r.int(30, 700) * 86400000)),
  }));

  // ------------------------------------------------------------ histórico
  const sessoes: Sessao[] = [];
  const cobrancas: Cobranca[] = [];
  let seqSessao = 0;

  /** "qualidade" comercial de cada ponto → quantas sessões por dia ele puxa */
  const qualidadePonto = new Map<string, number>();
  pontos.forEach((p) => {
    const regiao = REGIOES.find((x) => x.id === p.regiaoId)!;
    const base = 0.35 + regiao.densidadeEV * 0.75;
    qualidadePonto.set(p.id, Number(r.float(base * 0.6, base * 1.35).toFixed(3)));
  });

  for (let d = DIAS_HISTORICO; d >= 0; d--) {
    const dia = new Date(agora.getTime() - d * 86400000);
    const diaSemana = dia.getDay();
    // fim de semana muda o padrão: menos escritório, mais shopping/mercado
    const fatorSemana = diaSemana === 0 ? 0.55 : diaSemana === 6 ? 0.85 : 1;
    // a frota cresce ao longo do tempo (mercado em expansão)
    const fatorCrescimento = 0.72 + ((DIAS_HISTORICO - d) / DIAS_HISTORICO) * 0.38;

    for (const ponto of pontos) {
      if (!ponto.ativo) continue;
      const cfg = FORMATOS[ponto.formato];
      const regiao = REGIOES.find((x) => x.id === ponto.regiaoId)!;
      const qualidade = qualidadePonto.get(ponto.id)!;

      const sessoesDia = Math.max(
        0,
        Math.round(
          r.normal(cfg.carregadores * 2.4 * qualidade * fatorSemana * fatorCrescimento, 1.5, 0, 24),
        ),
      );

      for (let s = 0; s < sessoesDia; s++) {
        seqSessao++;
        const hora = horaPorCurva(r);
        const minuto = r.int(0, 59);
        const inicio = new Date(dia);
        inicio.setHours(hora, minuto, 0, 0);
        if (inicio.getTime() > agora.getTime()) continue;

        const motorista = r.pick(motoristas);
        const veiculo = VEICULOS.find((v) => v.id === motorista.veiculoId)!;
        const carregador = carregadores.filter((c) => c.pontoId === ponto.id)[
          r.int(0, cfg.carregadores - 1)
        ];
        const modelo = MODELOS_CARREGADOR[carregador.modelo];

        const socInicial = Math.round(r.normal(38, 16, 8, 82));
        const potenciaEfetiva = Math.min(modelo.potenciaKW, veiculo.potenciaMaxACkW) * r.float(0.88, 0.97);
        const duracaoH = Number(r.normal(1.5, 0.55, 0.3, 3.6).toFixed(2));

        const energiaBruta = potenciaEfetiva * duracaoH;
        const capacidadeRestante = veiculo.capacidadeKWh * ((100 - socInicial) / 100);
        const energiaKWh = Number(Math.min(energiaBruta, capacidadeRestante * 0.97).toFixed(2));
        const socFinal = Math.min(
          100,
          Math.round(socInicial + (energiaKWh / veiculo.capacidadeKWh) * 100),
        );

        const fim = new Date(inicio.getTime() + duracaoH * 3600000);
        const fatorPico = 1 + (CURVA_DEMANDA_HORA[hora] - 0.5) * 0.28;
        const tarifa = Number((ponto.precoBaseKWh * fatorPico).toFixed(2));
        const custo = Number((energiaKWh * tarifa).toFixed(2));

        const sessao: Sessao = {
          id: `s-${String(seqSessao).padStart(6, '0')}`,
          pontoId: ponto.id,
          carregadorId: carregador.id,
          motoristaId: motorista.id,
          veiculoId: veiculo.id,
          inicio: iso(inicio),
          fim: iso(fim),
          socInicial,
          socAtual: socFinal,
          energiaKWh,
          potenciaAtualKW: 0,
          estado: 'FATURADO',
          autorizacao: r.chance(0.55) ? 'RFID' : r.chance(0.7) ? 'APP' : 'QR',
          tarifaAplicadaKWh: tarifa,
          custoAcumulado: custo,
        };
        sessoes.push(sessao);

        const rep = repartir(custo, energiaKWh, regiao.custoEnergiaKWh);
        const falhou = r.chance(0.02);
        cobrancas.push({
          id: `cb-${String(seqSessao).padStart(6, '0')}`,
          sessaoId: sessao.id,
          pontoId: ponto.id,
          valor: custo,
          metodo: 'PIX',
          status: falhou ? 'FALHOU' : 'PAGO',
          txid: `PONTOW${String(seqSessao).padStart(10, '0')}`,
          criadaEm: iso(fim),
          pagaEm: falhou ? undefined : iso(new Date(fim.getTime() + r.int(4, 90) * 1000)),
          custoEnergia: rep.custoEnergia,
          royaltyGoodWe: rep.royaltyGoodWe,
          fundoMarketing: rep.fundoMarketing,
          gateway: rep.gateway,
          liquidoLojista: rep.liquidoLojista,
        });
      }
    }
  }

  // ------------------------------------------------------------ sessões ao vivo
  const telemetria: AmostraTelemetria[] = [];
  const pontosAtivos = pontos.filter((p) => p.ativo);

  for (const ponto of pontosAtivos) {
    const doPonto = carregadores.filter((c) => c.pontoId === ponto.id && c.estado === 'DISPONIVEL');
    const qualidade = qualidadePonto.get(ponto.id)!;
    const quantasAtivas = r.chance(Math.min(0.85, qualidade)) ? r.int(1, doPonto.length) : 0;

    for (let i = 0; i < quantasAtivas; i++) {
      const carregador = doPonto[i];
      if (!carregador) break;
      seqSessao++;

      const motorista = r.pick(motoristas);
      const veiculo = VEICULOS.find((v) => v.id === motorista.veiculoId)!;
      const modelo = MODELOS_CARREGADOR[carregador.modelo];

      const minutosDecorridos = r.int(4, 95);
      const inicio = new Date(agora.getTime() - minutosDecorridos * 60000);
      const socInicial = Math.round(r.normal(34, 14, 10, 70));
      const potencia = Math.min(modelo.potenciaKW, veiculo.potenciaMaxACkW) * r.float(0.85, 0.97);
      const energiaKWh = Number((potencia * (minutosDecorridos / 60)).toFixed(2));
      const socAtual = Math.min(
        99,
        Math.round(socInicial + (energiaKWh / veiculo.capacidadeKWh) * 100),
      );
      const tarifa = Number((ponto.precoBaseKWh * (1 + (CURVA_DEMANDA_HORA[agora.getHours()] - 0.5) * 0.28)).toFixed(2));

      carregador.estado = 'OCUPADO';

      const sessao: Sessao = {
        id: `s-${String(seqSessao).padStart(6, '0')}`,
        pontoId: ponto.id,
        carregadorId: carregador.id,
        motoristaId: motorista.id,
        veiculoId: veiculo.id,
        inicio: iso(inicio),
        socInicial,
        socAtual,
        energiaKWh,
        potenciaAtualKW: Number(potencia.toFixed(2)),
        estado: 'CARREGANDO',
        autorizacao: r.chance(0.6) ? 'RFID' : 'APP',
        tarifaAplicadaKWh: tarifa,
        custoAcumulado: Number((energiaKWh * tarifa).toFixed(2)),
      };
      sessoes.push(sessao);

      // telemetria dos últimos minutos (1 amostra por minuto)
      const amostras = Math.min(minutosDecorridos, 60);
      for (let t = amostras; t >= 0; t--) {
        const ts = new Date(agora.getTime() - t * 60000);
        const decorrido = (ts.getTime() - inicio.getTime()) / 3600000;
        const energiaAcum = Number((potencia * Math.max(0, decorrido)).toFixed(3));
        const socNoMomento = Math.min(
          99,
          socInicial + (energiaAcum / veiculo.capacidadeKWh) * 100,
        );
        // acima de 80% a corrente cai (curva CC/CV)
        const fatorCV = socNoMomento > 80 ? Math.max(0.12, 1 - ((socNoMomento - 80) / 20) * 0.88) : 1;
        const pot = potencia * fatorCV * r.float(0.97, 1.03);
        const tensao = modelo.fases === 1 ? r.float(218, 224) : r.float(376, 384);
        telemetria.push({
          ts: iso(ts),
          sessaoId: sessao.id,
          tensaoV: Number(tensao.toFixed(1)),
          correnteA: Number(((pot * 1000) / tensao / (modelo.fases === 1 ? 1 : 1.732)).toFixed(1)),
          potenciaKW: Number(pot.toFixed(2)),
          soc: Number(socNoMomento.toFixed(1)),
          energiaAcumKWh: energiaAcum,
        });
      }
    }
  }

  // ------------------------------------------------------------ homologações
  const homologacoes: SolicitacaoHomologacao[] = [];
  const statusPossiveis: SolicitacaoHomologacao['status'][] = [
    'ANALISE', 'VISTORIA', 'PENDENTE_DOC', 'APROVADO', 'REPROVADO',
  ];

  for (let i = 0; i < 11; i++) {
    const regiao = r.pick(REGIOES);
    const segmento = r.pick(SEGMENTOS);
    const formato = r.pick(['Light', 'Standard', 'Hub'] as FormatoFranquia[]);
    const fluxo = Math.round(r.normal(520, 260, 60, 1600));
    const carga = Number(r.float(12, 70).toFixed(1));

    const analise = analisarViabilidade(
      { fluxoDiarioPessoas: fluxo, cargaDisponivelKW: carga, formatoDesejado: formato, segmento },
      regiao,
    );

    homologacoes.push({
      id: `h-${String(i + 1).padStart(3, '0')}`,
      comercio: `${r.pick(['Café', 'Mercado', 'Empório', 'Bistrô', 'Drogaria', 'Loja'])} ${r.pick(['Primavera', 'do Lago', 'Central', 'Vila Nova', 'Horizonte', 'São Jorge', 'Aurora'])}`,
      cnpj: cnpj(r),
      regiaoId: regiao.id,
      segmento,
      formatoDesejado: formato,
      cargaDisponivelKW: carga,
      fluxoDiarioPessoas: fluxo,
      status:
        analise.veredito === 'REPROVAR' && r.chance(0.5)
          ? 'REPROVADO'
          : r.pick(statusPossiveis.slice(0, 3)),
      criadoEm: iso(new Date(agora.getTime() - r.int(1, 40) * 86400000)),
      scoreViabilidade: analise.score,
      horasUsoPrevistas: analise.horasUsoPrevistas,
      parecer: analise.parecer,
    });
  }

  return {
    franqueados,
    pontos,
    carregadores,
    motoristas,
    sessoes,
    telemetria,
    cobrancas,
    homologacoes,
    geradoEm: iso(agora),
  };
}
