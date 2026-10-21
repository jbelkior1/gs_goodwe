import { brl, num, tarifaKWh } from '../../../domain/formato';
import { duracaoTexto, minutosAte100, mmss, restanteDoCodigoMs, resumoDaConta } from '../../../domain/engine/totem';
import { gerarPixCopiaECola, gerarTxid } from '../../../domain/engine/tarifa';
import { linkDoApp } from '../../../ui/QR';
import { Anel, Bloco, Minicurva, Numero, PrecoTravado } from '../componentes';
import { Ic } from '../icones';
import { QrFlex } from '../QrFlex';
import type { DadosTela, Partes } from '../tipos';

/** T1 — QR da recarga (sessão ABERTA): o carro está no cabo, falta o motorista ler o QR ou digitar o código */
export function parteQR(d: DadosTela): Partes {
  const s = d.sessao!;
  const codigo = s.codigoVinculo ?? '';
  const restante = restanteDoCodigoMs(s, d.agora);
  const link = linkDoApp(`/motorista/vincular?c=${codigo}&tela=cheia`);
  return {
    estado: (
      <div className="tk-qr-tela">
        <h1 className="tk-titulo">{d.foco?.apelido} · carro conectado</h1>
        <div className="tk-qr-corpo">
          {codigo ? <QrFlex texto={link} rotulo="QR da recarga" /> : <div className="tk-qr" />}
          <div className="tk-qr-lado">
            <p className="tk-instrucao-g">Leia com a câmera do celular</p>
            <div className="tk-codigo" aria-label={`Código ${codigo.split('').join(' ')}`}>{codigo || '····'}</div>
            <p className="tk-instrucao">ou digite este código no app Ponto W</p>
          </div>
        </div>
      </div>
    ),
    numeros: (
      <div className="tk-qr-numeros">
        <PrecoTravado valor={d.precoKWh} rotulo="Preço do kWh, travado ao confirmar" />
        <div className="tk-contagem">
          {restante > 0 ? <>Código e preço valem por <b>{mmss(restante)}</b></> : 'Código expirando…'}
        </div>
      </div>
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
  return {
    estado: <Bloco giro icone="check" tom="ok" titulo="Tudo certo!" texto="Liberando a energia..." apoio={d.foco?.apelido} />,
    numeros: <div className="tk-qr-numeros"><PrecoTravado valor={d.precoKWh} rotulo="Preço do kWh, travado" /></div>,
  };
}

/** T3 e T4 — carregando e pausada: o anel, os números do que já aconteceu e o encerramento */
export function parteCarga(d: DadosTela, pausada: boolean): Partes {
  const s = d.sessao!;
  const kw = pausada ? 0 : s.potenciaAtualKW;
  const minutos = minutosAte100(s.socAtual, d.veiculo?.capacidadeKWh, kw);
  const visitante = s.autorizacao === 'VISITANTE';
  const valor = brl(d.cobranca?.valor ?? s.custoAcumulado);
  return {
    estado: (
      <div className={`tk-carga ${pausada ? 'pausada' : ''}`}>
        <h1 className="tk-titulo">{d.foco?.apelido} · {pausada ? 'pausada' : 'carregando'}</h1>
        {pausada && (
          <div className="tk-faixa-pausa" role="status">
            <Ic nome="pausa" tamanho={64} />
            <div>
              <b>Recarga pausada</b>
              <span>{s.motivoPausa || 'Controle de demanda do ponto'}</span>
            </div>
          </div>
        )}
        <div className="tk-anel">
          <Anel pct={s.socAtual} pausada={pausada} />
          <div className="tk-anel-centro">
            <span className="tk-anel-num">{num(s.socAtual)}<small>%</small></span>
            <span className="tk-anel-cap">bateria (estimada)</span>
          </div>
        </div>
        <p className="tk-eta">
          {pausada
            ? 'Você não paga enquanto está pausada.'
            : minutos != null
              ? <>Falta cerca de <b>{duracaoTexto(minutos)}</b> para 100%</>
              : 'Calculando o tempo até 100%…'}
        </p>
        {d.serie && <Minicurva serie={d.serie} />}
      </div>
    ),
    numeros: (
      <div className="tk-carga-numeros">
        <div className="tk-carga-grade">
          <Numero valor={valor} rotulo="até agora" destaque />
          <div className="tk-carga-pilha">
            <Numero valor={num(kw, 1)} rotulo="kW agora" />
            <Numero valor={num(s.energiaKWh, 1)} rotulo="kWh entregues" />
          </div>
        </div>
        <div className="tk-notas">
          <span>Preço travado: {tarifaKWh(s.tarifaAplicadaKWh)}</span>
          {s.limiteValor ? <span>Limite: {brl(s.limiteValor)}</span> : null}
        </div>
      </div>
    ),
    acao: visitante ? (
      <button className="tk-btn perigo" disabled={d.ocupado} onClick={() => d.pedir('encerrar')}>Encerrar recarga</button>
    ) : (
      <div className="tk-aguarda"><Ic nome="celular" tamanho={56} /><span>Encerre pelo app Ponto W</span></div>
    ),
  };
}

/** T5 — ENCERRANDO (ou CONCLUIDO ainda sem cobrança) */
export function parteEncerrando(): Partes {
  return { estado: <Bloco giro icone="dinheiro" titulo="Fechando a conta..." texto="Aguarde alguns segundos." /> };
}

/** T6 — CONCLUIDO com cobrança: QR do Pix, valor e a forma de pagar */
export function partePagar(d: DadosTela): Partes {
  const c = d.cobranca!;
  const s = d.sessao!;
  const payload = gerarPixCopiaECola(c.txid || gerarTxid(s.id), c.valor);
  return {
    estado: (
      <div className="tk-pix">
        <h1 className="tk-titulo">Pague com Pix</h1>
        <QrFlex texto={payload} rotulo="QR do Pix" />
        <p className="tk-instrucao-g">Abra o app do banco e leia o QR</p>
      </div>
    ),
    numeros: (
      <div className="tk-conta">
        <span className="tk-rotulo">Total a pagar</span>
        <div className="tk-valor-gigante">{brl(c.valor)}</div>
        <div className="tk-conta-detalhe">{num(s.energiaKWh, 2)} kWh × {tarifaKWh(s.tarifaAplicadaKWh)}</div>
      </div>
    ),
    acao: d.demo ? (
      <button className="tk-btn primario" disabled={d.ocupado} onClick={d.simularPagamento}>Simular pagamento (demonstração)</button>
    ) : (
      <div className="tk-aguarda"><span className="tk-pulso" aria-hidden="true" /><span>Aguardando a confirmação do Pix…</span></div>
    ),
  };
}

/** T7 — FATURADO com o carro ainda no cabo: confirmação e recibo */
export function partePago(d: DadosTela): Partes {
  const r = resumoDaConta(d.sessao!, d.cobranca, d.agora);
  return {
    estado: <Bloco icone="check" tom="ok" titulo="Pagamento confirmado" texto="Pode desconectar o cabo" apoio={d.foco?.apelido} />,
    numeros: (
      <div className="tk-recibo">
        <Numero valor={`${num(r.energiaKWh, 2)}`} rotulo="kWh entregues" />
        <Numero valor={brl(r.valor)} rotulo="valor pago" />
        <Numero valor={duracaoTexto(r.minutos)} rotulo="duração" />
        <Numero valor={num(r.precoKWh, 2)} rotulo="R$ por kWh" />
      </div>
    ),
    acao: <div className="tk-aguarda"><Ic nome="raio" tamanho={56} /><span>Obrigado por carregar no Ponto W</span></div>,
  };
}
