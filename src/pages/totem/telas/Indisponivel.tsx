import { linkDoApp } from '../../../ui/QR';
import { Bloco, Cartao, Instrucao } from '../componentes';
import { Ic } from '../icones';
import { QrFlex } from '../QrFlex';
import type { DadosTela, Partes } from '../tipos';

/** quando o ponto não atende: um QR que abre o mapa de pontos no celular de quem está na frente do totem */
function cartaoOutrosPontos(tom: 'erro' | 'aviso' | 'neutro', titulo: string) {
  return (
    <Cartao tom={tom} className="tk-cartao-mapa">
      <div className="tk-recibo-qr">
        <QrFlex className="mini" texto={linkDoApp('/motorista?tela=cheia')} rotulo="QR do mapa de pontos" />
        <div className="tk-recibo-qr-texto">
          <b>{titulo}</b>
          <span>Leia o QR com a câmera para abrir o mapa de pontos no celular.</span>
        </div>
      </div>
    </Cartao>
  );
}

const ajuda = <Instrucao icone="pessoa">Precisa de ajuda? Chame um atendente da loja</Instrucao>;

/** T9 — vaga em manutenção ou fora do ar (e nenhuma outra vaga livre) */
export function parteManutencao(d: DadosTela): Partes {
  const todas = d.vagas.length > 1;
  const foraDoAr = d.foco?.situacao === 'foraDoAr';
  const titulo = todas
    ? 'Recarga indisponível agora'
    : `${d.foco?.apelido ?? 'Vaga'} ${foraDoAr ? 'fora do ar' : 'em manutenção'}`;
  return {
    estado: (
      <Bloco
        icone={foraDoAr ? 'bloqueio' : 'chave'} tom="erro" titulo={titulo}
        apoio={todas
          ? 'Nenhuma vaga deste ponto está funcionando agora. Volte mais tarde ou carregue em outro ponto.'
          : 'Volte mais tarde ou carregue em outro ponto.'}
      />
    ),
    numeros: cartaoOutrosPontos('erro', 'Veja outros pontos Ponto W perto daqui'),
    acao: ajuda,
  };
}

/** T10 — ponto ainda em instalação */
export function parteInstalacao(): Partes {
  return {
    estado: <Bloco icone="raio" titulo="Em breve: recarga GoodWe aqui" apoio="Este ponto está em instalação." />,
    numeros: cartaoOutrosPontos('neutro', 'Veja os pontos Ponto W que já funcionam'),
    acao: <Instrucao icone="mapa">Enquanto isso, carregue em outro ponto Ponto W</Instrucao>,
  };
}

/** T10 — ponto suspenso */
export function parteSuspenso(): Partes {
  return {
    estado: (
      <Bloco icone="bloqueio" tom="aviso" titulo="Ponto temporariamente fora de operação" apoio="Volte mais tarde ou carregue em outro ponto." />
    ),
    numeros: cartaoOutrosPontos('aviso', 'Veja outros pontos Ponto W perto daqui'),
    acao: ajuda,
  };
}

/** T11 — a vaga parou de mandar sinal (mais de 90 s) e não há recarga em curso */
export function parteSemSinal(d: DadosTela): Partes {
  const apelido = d.foco?.apelido ?? 'A vaga';
  const livre = d.vagas.find((v) => v.situacao === 'livre' && v.id !== d.foco?.id);
  return {
    estado: (
      <Bloco
        icone="semWifi" tom="erro" titulo={`${apelido} sem comunicação`}
        apoio="A vaga não responde há alguns minutos, então não dá para começar uma recarga nela agora."
      />
    ),
    numeros: (
      <Cartao tom="erro" rotulo="O que fazer">
        <div className="tk-fazer">
          {livre && <div className="tk-fazer-item ok"><Ic nome="check" tamanho={44} /><span>Use a {livre.apelido}, que está livre</span></div>}
          <div className="tk-fazer-item"><Ic nome="pessoa" tamanho={44} /><span>{livre ? 'Ou chame' : 'Chame'} um atendente da loja</span></div>
        </div>
        <div className="tk-cartao-nota"><span className="tk-dim">Para o suporte: ponto {d.ponto.id} · {apelido}</span></div>
      </Cartao>
    ),
    acao: <Instrucao icone="semWifi">Volta ao normal quando a vaga responder</Instrucao>,
    demo: d.demo ? <span className="tk-demo-nota">Confira se o simulador está ligado</span> : undefined,
  };
}
