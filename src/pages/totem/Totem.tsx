import { useState, type ReactNode } from 'react';
import { useApp } from '../../app/estado';
import {
  carregadoresDoPonto, cobrancaDaSessao, conexaoTempoReal, obterPonto, semSinal, sessaoDaVaga, solarDoPonto,
  tarifaAtual, telemetriaDaSessao,
} from '../../domain/db';
import type { ContextoVolt } from '../../domain/engine/assistente';
import {
  minutosAte100, prioritariasAgora, serieDePotencia, telaDoTotem, TEMPO, veiculoDaVaga,
  type Aviso, type EscolhaManual, type NomeTela, type VagaDados,
} from '../../domain/engine/totem';
import { brl, horaMin, tarifaKWh } from '../../domain/formato';
import { conectarCarro, desconectarCarro, encerrarSessao, iniciarVisitante, pagarCobranca } from '../../data/acoes';
import { PalcoEscalado } from '../../ui/Quiosque';
import { DESENHO, useInatividade, useQuiosque, useToquesSecretos } from '../../ui/quiosqueContexto';
import { Volt } from '../../ui/Volt';
import { Bloco } from './componentes';
import { Confirmacao, SimularCarro } from './Dialogos';
import { useAgora, useExpiradas, useOnline, usePontoDoTotem } from './hooks';
import { Ic } from './icones';
import { PainelVolt } from './PainelVolt';
import { parteExpirado, parteEspera, parteReconhecendo } from './telas/Espera';
import { parteCarga, parteEncerrando, parteIniciando, partePagar, partePago, parteQR } from './telas/Fluxo';
import { parteInstalacao, parteManutencao, parteSemSinal, parteSuspenso } from './telas/Indisponivel';
import { parteParear } from './telas/Parear';
import type { DadosTela, Partes } from './tipos';
import { CartoesDeVaga } from './Vagas';
import './totem.css';

const DEMO = import.meta.env.VITE_MODO_DEMO === 'true';
type Orientacao = 'vertical' | 'horizontal';

/**
 * Totem do eletroposto (quiosque 1080×1920 ou 1920×1080). Uma tela por estado da vaga
 * (telaDoTotem, em domain/engine/totem.ts); o código da recarga só nasce quando um carro é
 * conectado, e o totem mostra o QR assim que a sessão ABERTA aparece. Sem ponto, o aparelho
 * mostra o código de 6 dígitos de pareamento (passo 4 do fluxograma).
 *
 * `aparelho`: aberto em tela cheia no aparelho real (dentro do Quiosque, que escala o palco).
 * Sem isso é a vitrine: o mesmo componente, escalado para dentro da moldura 3D.
 */
export default function Totem({ orientacao = 'vertical', aparelho = false }: { orientacao?: Orientacao; aparelho?: boolean }) {
  const { pontoId: pontoDoPainel } = useApp();
  const alvo = usePontoDoTotem(aparelho, pontoDoPainel);
  const online = useOnline() && conexaoTempoReal === 'ok';
  const agora = useAgora();

  const tela = alvo.fase === 'pareando' ? (
    <Casca
      orientacao={orientacao} tela="parear" nomePonto="Totem sem ponto" online={online} hora={horaMin(new Date(agora))}
      avisos={[]} partes={parteParear(alvo)}
    />
  ) : (
    <TotemDoPonto pontoId={alvo.pontoId} orientacao={orientacao} online={online} agora={agora} />
  );
  if (aparelho) return tela;
  const d = DESENHO[orientacao];
  return <div className="tk-vitrine"><PalcoEscalado largura={d.w} altura={d.h}>{tela}</PalcoEscalado></div>;
}

// ------------------------------------------------------------------ o totem de um ponto
type PedidoDialogo = { tipo: 'visitante' | 'encerrar' } | { tipo: 'simular'; vagaId: string };
/** diálogo aberto numa tela e vinculado a ela: quando a tela muda, o diálogo some sem efeito colateral */
type Dialogo = PedidoDialogo & { chave: string };

function TotemDoPonto({ pontoId, orientacao, online, agora }: { pontoId: string; orientacao: Orientacao; online: boolean; agora: number }) {
  const ponto = obterPonto(pontoId);
  const [escolha, setEscolha] = useState<EscolhaManual | null>(null);
  const [dialogoAberto, setDialogo] = useState<Dialogo | null>(null);
  const [voltChave, setVoltChave] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const expiradas = useExpiradas(pontoId);

  const dados: VagaDados[] = (ponto ? carregadoresDoPonto(pontoId) : []).map((vaga) => {
    const s = sessaoDaVaga(vaga.id);
    return { vaga, sessao: s, cobranca: s ? cobrancaDaSessao(s.id) : undefined, semSinal: semSinal(vaga), expirada: expiradas[vaga.id] };
  });
  const r = telaDoTotem({ ponto, vagas: dados, agora, escolha, semInternet: !online });
  // escolha que deixou de valer (45 s ou outra vaga entrou em QR/pagar): esquece de vez
  if (escolha && !r.escolhaAtiva) setEscolha(null);

  const sessao = r.foco?.sessao;
  const cobranca = r.foco?.cobranca;
  const chaveFase = `${r.fase}:${sessao?.id ?? ''}`;
  const chaveTela = `${r.tela}:${r.foco?.id ?? ''}:${sessao?.id ?? ''}`;
  // painel do Volt e diálogos valem só para a tela em que abriram: mudou a fase/sessão, fecham
  const voltAberto = voltChave === chaveFase;
  const dialogo = dialogoAberto?.chave === chaveTela ? dialogoAberto : null;

  // sem toque por 45 s: zera conversa, escolha de vaga, diálogos e erros (a tela em si segue o estado da vaga)
  useInatividade(TEMPO.inatividadeMs, () => { setEscolha(null); setErro(''); setVoltChave(null); setDialogo(null); });

  if (!ponto) {
    return (
      <Casca
        orientacao={orientacao} tela="semPonto" nomePonto="Totem sem ponto" online={online} hora={horaMin(new Date(agora))} avisos={[]}
        partes={{
          estado: (
            <Bloco
              icone="alerta" tom="aviso" titulo="Este totem não achou o ponto" texto="Chame o responsável pelo comércio."
              apoio="No menu de manutenção (5 toques no logo), desparear e parear de novo."
            />
          ),
        }}
      />
    );
  }

  const tarifa = tarifaAtual(pontoId);
  const veiculo = veiculoDaVaga(sessao, r.foco?.dados.vaga);
  const precoKWh = sessao && sessao.tarifaAplicadaKWh > 0 ? sessao.tarifaAplicadaKWh : tarifa.precoFinalKWh;
  const emCurva = r.tela === 'carga' || r.tela === 'pausada';
  // a autossuficiência solar (média do dia) só interessa na espera e na conversa com o Volt
  const solarDoDia = ponto.temSolar && (r.tela === 'espera' || voltAberto) ? solarDoPonto(pontoId).resumo.autossuficiencia : null;

  const agir = (f: () => Promise<void>, depois?: () => void) => {
    if (ocupado) return;
    setErro(''); setOcupado(true);
    f().then(depois).catch((e: Error) => setErro(e.message)).finally(() => setOcupado(false));
  };
  const abrir = (p: PedidoDialogo) => { setErro(''); setDialogo({ ...p, chave: chaveTela }); };
  const fechar = () => { setDialogo(null); setErro(''); };
  const escolher = (vagaId: string) => setEscolha({ vagaId, em: agora, prioritarias: prioritariasAgora(r.vagas) });

  const d: DadosTela = {
    orientacao, ponto, agora, demo: DEMO, foco: r.foco, vagas: r.vagas, vagasLivres: r.vagasLivres, sessao, cobranca, veiculo,
    tarifa, precoKWh, solar: r.tela === 'espera' ? solarDoDia : null,
    serie: sessao && emCurva ? serieDePotencia(telemetriaDaSessao(sessao.id), sessao.potenciaAtualKW, r.tela === 'carga') : null,
    ocupado,
    pedir: (tipo) => abrir({ tipo }),
    simularPagamento: () => { if (cobranca) agir(() => pagarCobranca(cobranca)); },
    simularCarro: (vagaId) => abrir({ tipo: 'simular', vagaId }),
    retirarCabo: (vagaId) => agir(() => desconectarCarro(vagaId)),
  };

  const partes = escolherPartes(r.tela, d);

  // contexto do Volt: sessão só quando há recarga (sem ela o Volt não cita número de recarga)
  const comRecarga = ['iniciando', 'carga', 'pausada', 'encerrando', 'pagar', 'pago'].includes(r.fase);
  const sessaoVolt = sessao && comRecarga ? {
    socAtual: sessao.socAtual, energiaKWh: sessao.energiaKWh, potenciaAtualKW: sessao.potenciaAtualKW,
    tarifaAplicadaKWh: sessao.tarifaAplicadaKWh, custoAcumulado: sessao.custoAcumulado,
    visitante: sessao.autorizacao === 'VISITANTE', limiteValor: sessao.limiteValor, motivoPausa: sessao.motivoPausa,
  } : undefined;
  const minutos = sessao && r.fase === 'carga' ? minutosAte100(sessao.socAtual, veiculo?.capacidadeKWh, sessao.potenciaAtualKW) : null;
  const contexto: ContextoVolt = {
    ponto, fase: r.fase, sessao: sessaoVolt, minutosRestantes: minutos ?? undefined,
    precoAgoraKWh: r.fase === 'qr' ? precoKWh : tarifa.precoFinalKWh,
    valorConta: sessaoVolt ? (cobranca?.valor ?? sessaoVolt.custoAcumulado) : undefined,
    autossuficiencia: solarDoDia ?? undefined,
    vagasLivres: r.vagasLivres, totalVagas: r.vagas.length,
    potenciaVagaKW: r.vagas.length ? Math.max(...r.vagas.map((v) => v.potenciaKW)) : undefined,
    onde: 'totem',
  };

  const vagaDoDialogo = dialogo?.tipo === 'simular' ? r.vagas.find((v) => v.id === dialogo.vagaId) : undefined;

  return (
    <Casca
      orientacao={orientacao} tela={r.tela} nomePonto={ponto.nome} online={online} hora={horaMin(new Date(agora))} avisos={r.avisos}
      partes={{
        ...partes,
        acao: (
          <>
            {partes.acao}
            {erro && !dialogo && <p className="tk-erro" role="alert">{erro}</p>}
            {DEMO && r.foco?.comCarro && r.tela !== 'espera' && (
              <button className="tk-demo-btn" disabled={ocupado} onClick={() => d.retirarCabo(r.foco!.id)}>
                Simular retirada do cabo (demonstração)
              </button>
            )}
          </>
        ),
      }}
      vagas={r.tela === 'instalacao' || r.tela === 'suspenso' ? undefined : <CartoesDeVaga vagas={r.vagas} focoId={r.foco?.id} aoEscolher={escolher} />}
      volt={(
        <button
          className="tk-volt-btn" onClick={() => setVoltChave(voltAberto ? null : chaveFase)}
          aria-label="Dúvidas? Falar com o Volt" aria-expanded={voltAberto}
        >
          <span className="tk-volt-disco"><Volt tamanho={92} /></span>
          <span className="tk-volt-rotulo">Dúvidas?</span>
        </button>
      )}
      sobreposicao={(
        <>
          {voltAberto && <PainelVolt key={chaveFase} contexto={contexto} aoFechar={() => setVoltChave(null)} />}
          {dialogo?.tipo === 'visitante' && (
            <Confirmacao
              titulo="Carregar sem o app?"
              texto={`O preço fica travado em ${tarifaKWh(precoKWh)}. Você encerra e paga com Pix aqui no totem.`}
              rotuloOk="Começar a carregar" ocupado={ocupado} erro={erro}
              aoConfirmar={() => { if (sessao) agir(() => iniciarVisitante(sessao), fechar); }}
              aoVoltar={fechar}
            />
          )}
          {dialogo?.tipo === 'encerrar' && (
            <Confirmacao
              titulo="Encerrar a recarga?" perigo
              texto={`Você paga só o que já foi entregue: ${brl(sessao?.custoAcumulado ?? 0)}.`}
              rotuloOk="Encerrar e pagar" rotuloVoltar="Continuar carregando" ocupado={ocupado} erro={erro}
              aoConfirmar={() => {
                if (!sessao) return;
                // só a recarga de visitante termina no totem; a do app termina pelo app
                if (sessao.autorizacao !== 'VISITANTE') { setErro('Esta recarga foi iniciada pelo app. Encerre pelo app Ponto W.'); return; }
                agir(() => encerrarSessao(sessao, 'totem'), fechar);
              }}
              aoVoltar={fechar}
            />
          )}
          {dialogo?.tipo === 'simular' && vagaDoDialogo && (
            <SimularCarro
              vagaNome={vagaDoDialogo.apelido} ocupado={ocupado} erro={erro}
              aoConectar={(veiculoId, soc) => agir(() => conectarCarro(vagaDoDialogo.id, veiculoId, soc), fechar)}
              aoVoltar={fechar}
            />
          )}
        </>
      )}
    />
  );
}

function escolherPartes(tela: NomeTela, d: DadosTela): Partes {
  switch (tela) {
    case 'reconhecendo': return parteReconhecendo(d);
    case 'qr': return d.sessao ? parteQR(d) : parteEspera(d);
    case 'iniciando': return parteIniciando(d);
    case 'carga': return d.sessao ? parteCarga(d, false) : parteEspera(d);
    case 'pausada': return d.sessao ? parteCarga(d, true) : parteEspera(d);
    case 'encerrando': return parteEncerrando();
    case 'pagar': return d.sessao && d.cobranca ? partePagar(d) : parteEncerrando();
    case 'pago': return d.sessao ? partePago(d) : parteEspera(d);
    case 'expirado': return parteExpirado();
    case 'manutencao': return parteManutencao(d);
    case 'instalacao': return parteInstalacao();
    case 'suspenso': return parteSuspenso();
    case 'semSinal': return parteSemSinal(d);
    default: return parteEspera(d);
  }
}

// ------------------------------------------------------------------ a casca: grade da tela
function Casca({
  orientacao, tela, nomePonto, online, hora, avisos, partes, vagas, volt, sobreposicao,
}: {
  orientacao: Orientacao; tela: string; nomePonto: string; online: boolean; hora: string; avisos: Aviso[];
  partes: Partes; vagas?: ReactNode; volt?: ReactNode; sobreposicao?: ReactNode;
}) {
  const quiosque = useQuiosque();
  // acesso escondido ao menu de manutenção: 5 toques no logo em 3 s
  const toqueNoLogo = useToquesSecretos(() => quiosque?.abrirMenu());
  return (
    <div className={`tk ${orientacao === 'horizontal' ? 'tk-h' : 'tk-v'}`} data-tela={tela}>
      <header className="tk-topo">
        <button className="tk-marca" onClick={toqueNoLogo} tabIndex={-1} aria-label="GoodWe Ponto W">
          <span className="tk-marca-raio"><Ic nome="raio" tamanho={40} /></span>
          <span className="tk-marca-texto"><b>GoodWe</b><span>Ponto W</span></span>
        </button>
        <div className="tk-topo-ponto">{nomePonto}</div>
        <div className="tk-topo-lado">
          <span className="tk-hora">{hora}</span>
          <span className={`tk-conexao ${online ? 'ok' : 'sem'}`}>
            <Ic nome={online ? 'wifi' : 'semWifi'} tamanho={36} />
            <span>{online ? 'Online' : 'Sem conexão'}</span>
          </span>
        </div>
      </header>

      {avisos.length > 0 && (
        <div className="tk-avisos">
          {avisos.map((a) => (
            <div key={a.id} className={`tk-aviso ${a.id}`} role="status">
              <Ic nome={a.id === 'semInternet' ? 'semWifi' : 'alerta'} tamanho={40} />
              <span>{a.texto}</span>
            </div>
          ))}
        </div>
      )}

      <main className="tk-estado" aria-live="polite">{partes.estado}</main>
      {partes.numeros && <section className="tk-numeros">{partes.numeros}</section>}
      {vagas}
      {partes.acao && <section className="tk-acao">{partes.acao}</section>}
      {volt && <div className="tk-volt-area">{volt}</div>}
      {sobreposicao}
    </div>
  );
}
