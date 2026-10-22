import { brl, horaMin, num, tarifaKWh } from '../../../domain/formato';
import {
  duracaoTexto, minutosAte100, minutosDaSessao, mmss, restanteDoCodigoMs, resumoDaConta,
} from '../../../domain/engine/totem';
import { gerarPixCopiaECola, gerarTxid } from '../../../domain/engine/tarifa';
import { linkDoApp } from '../../../ui/QR';
import { Anel, Bloco, Cartao, CartaoDoPreco, Instrucao, Linha, Metrica, Minicurva } from '../componentes';
import { Ic } from '../icones';
import { QrFlex } from '../QrFlex';
import type { DadosTela, Partes } from '../tipos';

/** kWh com 2 casas abaixo de 10 (0,58 kWh) e 1 casa acima (12,4 kWh) */
const kwhTela = (v: number) => num(v, v < 10 ? 2 : 1);
const nomeDoCarro = (d: DadosTela) => (d.veiculo ? `${d.veiculo.montadora} ${d.veiculo.modelo}` : '');
const ehVisitante = (d: DadosTela) => d.sessao?.autorizacao === 'VISITANTE';

/** T1 — QR da recarga (sessão ABERTA): o carro está no cabo, falta o motorista ler o QR ou digitar o código */
export function parteQR(d: DadosTela): Partes {
  const s = d.sessao!;
  const codigo = s.codigoVinculo ?? '';
  const restante = restanteDoCodigoMs(s, d.agora);
  const link = linkDoApp(`/motorista/vincular?c=${codigo}&tela=cheia`);
  return {
    etapa: { n: 2 },
    estado: (
      <div className="tk-qr-tela">
        <div className="tk-qr-cabeca">
          <p className="tk-sub">{d.foco?.apelido} · carro conectado</p>
          <h1 className="tk-titulo">Leia o QR com o celular</h1>
        </div>
        <div className="tk-qr-corpo">
          {codigo ? <QrFlex texto={link} rotulo="QR da recarga" /> : <div className="tk-qr" />}
          <div className="tk-qr-codigo">
            <span className="tk-instrucao dim">ou digite este código no app Ponto W</span>
            <span className="tk-codigo" aria-label={`Código ${codigo.split('').join(' ')}`}>{codigo || '····'}</span>
          </div>
        </div>
      </div>
    ),
    numeros: (
      <CartaoDoPreco
        rotulo="Preço travado ao confirmar" precoKWh={d.precoKWh} tarifa={d.tarifa}
        lado={restante > 0
          ? <span className="tk-contagem">vale por <b>{mmss(restante)}</b></span>
          : <span className="tk-contagem">Código expirando…</span>}
      />
    ),
    acao: (
      <button className="tk-btn sec" disabled={d.ocupado} onClick={() => d.pedir('visitante')}>
        Sem app? Carregue e pague aqui com Pix
      </button>
    ),
  };
}

/** T2 — AUTENTICADO: preço travado, falta a vaga liberar a potência */
export function parteIniciando(d: DadosTela): Partes {
  const s = d.sessao;
  const visitante = ehVisitante(d);
  const carro = nomeDoCarro(d);
  return {
    etapa: { n: 3, tom: 'ok', visitante },
    estado: (
      <Bloco
        giro icone="check" tom="ok" titulo="Tudo certo" texto="Liberando a energia" textoNoTom
        apoio={`${visitante ? 'Recarga sem app' : 'Confirmado no celular'}${carro ? ` · ${carro}` : ''}`}
        alerta="Não retire o cabo"
      />
    ),
    numeros: (
      <CartaoDoPreco rotulo="Preço travado" precoKWh={d.precoKWh} nota={<span className="tk-dim">Não muda até o fim desta recarga</span>}>
        {s && (
          <div className="tk-linhas">
            <Linha rotulo="Bateria informada" valor={`${num(s.socInicial)}%`} />
            <Linha rotulo="Limite" valor={s.limiteValor ? brl(s.limiteValor) : 'sem limite'} />
          </div>
        )}
      </CartaoDoPreco>
    ),
    acao: <Instrucao icone="raio">A carga começa em alguns segundos</Instrucao>,
  };
}

/** T3 e T4 — carregando e pausada: o anel, os números do que já aconteceu e o encerramento */
export function parteCarga(d: DadosTela, pausada: boolean): Partes {
  const s = d.sessao!;
  const kw = pausada ? 0 : s.potenciaAtualKW;
  const minutos = minutosAte100(s.socAtual, d.veiculo?.capacidadeKWh, kw);
  const visitante = ehVisitante(d);
  const valor = brl(d.cobranca?.valor ?? s.custoAcumulado);
  const carro = nomeDoCarro(d);
  const potenciaVaga = d.foco?.potenciaKW ?? 0;
  // o carro decide quanto puxa: o teto é o menor entre o carregador de bordo dele e a vaga
  const teto = d.veiculo ? Math.min(d.veiculo.potenciaMaxACkW, potenciaVaga || d.veiculo.potenciaMaxACkW) : potenciaVaga;
  const reduzida = !pausada && !!s.motivoPausa;
  const notaPotencia = pausada ? 'pausa da entrada elétrica'
    : reduzida ? 'reduzida para proteger o disjuntor'
      : teto > 0 ? `o carro aceita até ${num(teto, 1)} kW` : undefined;

  return {
    etapa: { n: 3, tom: pausada ? 'aviso' : 'ok', rotulo: pausada ? 'Pausada' : 'Carregando', visitante },
    estado: (
      <div className={`tk-carga ${pausada ? 'pausada' : ''}`}>
        {pausada && (
          <div className="tk-faixa-pausa" role="status">
            <Ic nome="pausa" tamanho={64} />
            <div>
              <b>Recarga pausada por um instante</b>
              <span>A loja está usando mais energia agora. Para não desarmar o disjuntor, a vaga espera e volta sozinha.</span>
            </div>
          </div>
        )}
        <p className="tk-sub">{d.foco?.apelido}{carro ? ` · ${carro}` : ''}{visitante ? ' · sem app' : ''}</p>
        <div className="tk-anel">
          <Anel pct={s.socAtual} inicio={s.socInicial} pausada={pausada} />
          <div className="tk-anel-centro">
            <span className="tk-anel-num">{num(s.socAtual)}<small>%</small></span>
            <span className="tk-anel-cap">bateria (estimada)</span>
            {s.socInicial < s.socAtual && <span className="tk-anel-ini">começou em {num(s.socInicial)}%</span>}
          </div>
        </div>
        <p className="tk-eta">
          {pausada
            ? 'Você não paga enquanto está pausada'
            : minutos != null
              ? <>Faltam cerca de <b>{duracaoTexto(minutos)}</b> para 100%</>
              : 'Calculando o tempo até 100%…'}
        </p>
      </div>
    ),
    numeros: (
      <div className="tk-metricas">
        <Metrica tom="vermelho" rotulo="Valor até agora" valor={valor} />
        <Metrica rotulo="Energia entregue" valor={kwhTela(s.energiaKWh)} unidade="kWh" />
        <Metrica
          tom={pausada || reduzida ? 'aviso' : 'neutro'} rotulo="Potência agora" valor={num(kw, 1)} unidade="kW" nota={notaPotencia}
        >
          {d.serie && !pausada && <Minicurva serie={d.serie} />}
        </Metrica>
        <Metrica
          rotulo="Preço travado" valor={num(s.tarifaAplicadaKWh, 2)} unidade="R$/kWh"
          nota={s.limiteValor ? `limite de ${brl(s.limiteValor)}` : 'não muda até o fim'}
        />
      </div>
    ),
    acao: visitante ? (
      <button className="tk-btn primario" disabled={d.ocupado} onClick={() => d.pedir('encerrar')}>Encerrar e pagar com Pix</button>
    ) : pausada ? (
      <Instrucao icone="pausa">Você não precisa fazer nada: a carga volta sozinha</Instrucao>
    ) : (
      <Instrucao icone="celular">Encerre pelo app Ponto W, quando quiser</Instrucao>
    ),
  };
}

/** T5 — ENCERRANDO (ou CONCLUIDO ainda sem cobrança): o resumo do que foi entregue enquanto a conta fecha */
export function parteEncerrando(d: DadosTela): Partes {
  const s = d.sessao;
  return {
    etapa: { n: 4, visitante: ehVisitante(d) },
    estado: (
      <Bloco
        giro icone="dinheiro" titulo="Fechando a conta" texto="Aguarde alguns segundos"
        apoio={`${d.foco?.apelido ?? 'Vaga'} · a carga terminou`}
      />
    ),
    numeros: s ? (
      <Cartao rotulo="Resumo da recarga">
        <div className="tk-resumo">
          <div><b>{kwhTela(s.energiaKWh)}</b><span>kWh entregues</span></div>
          <div><b>{duracaoTexto(minutosDaSessao(s, d.agora))}</b><span>de carga</span></div>
          <div><b>{num(s.socAtual)}%</b><span>bateria no fim</span></div>
        </div>
        <div className="tk-linhas"><Linha rotulo="Preço travado" valor={tarifaKWh(s.tarifaAplicadaKWh)} /></div>
      </Cartao>
    ) : undefined,
    acao: <Instrucao icone="pix">O Pix aparece em instantes</Instrucao>,
  };
}

/** T6 — CONCLUIDO com cobrança: o total, o QR do Pix e a forma de pagar */
export function partePagar(d: DadosTela): Partes {
  const c = d.cobranca!;
  const s = d.sessao!;
  const payload = gerarPixCopiaECola(c.txid || gerarTxid(s.id), c.valor);
  const total = (
    <Cartao tom="vermelho" rotulo="Total a pagar" className="tk-cartao-total">
      <div className="tk-total">
        <span className="tk-valor-gigante">{brl(c.valor)}</span>
        <span className="tk-total-conta"><span>{kwhTela(s.energiaKWh)} kWh</span><span className="tk-dim">× {tarifaKWh(s.tarifaAplicadaKWh)}</span></span>
      </div>
    </Cartao>
  );
  const pix = (
    <div className="tk-pix">
      <h1 className="tk-titulo">Pague com Pix</h1>
      <QrFlex texto={payload} rotulo="QR do Pix" />
      <div className="tk-pix-textos">
        <p className="tk-instrucao-g">Abra o app do seu banco e leia o QR</p>
        {!ehVisitante(d) && <p className="tk-instrucao dim">Se você usa o app Ponto W, dá para pagar por lá também</p>}
      </div>
    </div>
  );
  const vertical = d.orientacao === 'vertical';
  return {
    etapa: { n: 4, visitante: ehVisitante(d) },
    // em pé, o valor vem antes do QR (quem paga confere o total e depois aponta o celular)
    estado: vertical ? <div className="tk-pagar">{total}{pix}</div> : pix,
    numeros: vertical ? undefined : total,
    acao: <Instrucao icone="pix">Aguardando a confirmação do Pix</Instrucao>,
    demo: d.demo ? <button className="tk-demo-btn" disabled={d.ocupado} onClick={d.simularPagamento}>Simular pagamento</button> : undefined,
  };
}

/** T7 — FATURADO com o carro ainda no cabo: confirmação e recibo */
export function partePago(d: DadosTela): Partes {
  const s = d.sessao!;
  const r = resumoDaConta(s, d.cobranca, d.agora);
  const pagaEm = d.cobranca?.pagaEm;
  return {
    etapa: { n: 4, tom: 'ok', concluida: true, visitante: ehVisitante(d) },
    estado: <Bloco icone="check" tom="ok" titulo="Pagamento recebido" texto="Pode retirar o cabo. Boa viagem!" />,
    numeros: (
      <div className="tk-pago-lado">
        <Cartao tom="ok" rotulo={`Recibo · ${d.foco?.apelido ?? 'Vaga'}`} lado={pagaEm ? `Pix às ${horaMin(pagaEm)}` : undefined}>
          <div className="tk-linhas">
            <Linha rotulo="Energia" valor={`${kwhTela(r.energiaKWh)} kWh`} />
            <Linha rotulo="Tempo de carga" valor={duracaoTexto(r.minutos)} />
            <Linha rotulo="Preço travado" valor={tarifaKWh(r.precoKWh)} />
          </div>
          <div className="tk-recibo-total"><span>Total pago</span><b>{brl(r.valor)}</b></div>
        </Cartao>
        <div className="tk-recibo-qr">
          <QrFlex className="mini" texto={linkDoApp(`/motorista/recarga/${s.id}?tela=cheia`)} rotulo="QR do recibo" />
          <div className="tk-recibo-qr-texto">
            <b>Quer o recibo no celular?</b>
            <span>Leia o QR com a câmera para abrir o recibo desta recarga.</span>
          </div>
        </div>
      </div>
    ),
    acao: <Instrucao icone="tomada">A vaga fica livre quando o cabo sair</Instrucao>,
  };
}
