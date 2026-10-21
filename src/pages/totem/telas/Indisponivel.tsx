import { Bloco } from '../componentes';
import type { DadosTela, Partes } from '../tipos';

/** T9 — vaga em manutenção ou fora do ar (e nenhuma outra vaga livre) */
export function parteManutencao(d: DadosTela): Partes {
  const todas = d.vagas.length > 1;
  const foraDoAr = d.foco?.situacao === 'foraDoAr';
  const titulo = todas
    ? 'Vagas indisponíveis no momento'
    : `${d.foco?.apelido ?? 'Vaga'} ${foraDoAr ? 'fora do ar' : 'em manutenção'}`;
  return {
    estado: (
      <Bloco
        icone="chave" tom="aviso" titulo={titulo} texto="Volte mais tarde ou veja outro ponto no app Ponto W."
        apoio="Precisa de ajuda? Chame um atendente da loja."
      />
    ),
  };
}

/** T10 — ponto ainda em instalação */
export function parteInstalacao(): Partes {
  return {
    estado: (
      <Bloco icone="raio" titulo="Em breve: recarga GoodWe aqui" texto="Este ponto está em instalação." apoio="Veja os pontos já ativos no app Ponto W." />
    ),
  };
}

/** T10 — ponto suspenso */
export function parteSuspenso(): Partes {
  return {
    estado: (
      <Bloco
        icone="bloqueio" tom="aviso" titulo="Ponto temporariamente fora de operação"
        texto="Volte mais tarde ou veja outro ponto no app Ponto W." apoio="Precisa de ajuda? Chame um atendente da loja."
      />
    ),
  };
}

/** T11 — a vaga parou de mandar sinal (mais de 90 s) e não há recarga em curso */
export function parteSemSinal(d: DadosTela): Partes {
  return {
    estado: (
      <Bloco
        icone="semWifi" tom="aviso" titulo="Sem comunicação" texto="Chame um atendente da loja."
        apoio={d.demo ? 'Demonstração: confira se o simulador está ligado.' : `${d.foco?.apelido ?? 'A vaga'} não responde há alguns minutos.`}
      />
    ),
  };
}
