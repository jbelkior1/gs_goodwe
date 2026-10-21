import { MODELOS_CARREGADOR } from '../../../domain/catalogo';
import { brl, num, pct, tarifaKWh } from '../../../domain/formato';
import carroDoTotem from '../../../assets/carro-totem.webp';
import { Bloco, Simulacao } from '../componentes';
import { Ic, type NomeIc } from '../icones';
import type { DadosTela, Partes } from '../tipos';

const PASSOS: { n: number; icone: NomeIc; texto: string; apoio?: string }[] = [
  { n: 1, icone: 'tomada', texto: 'Conecte o cabo na vaga' },
  { n: 2, icone: 'qr', texto: 'O totem mostra o QR e o código' },
  { n: 3, icone: 'celular', texto: 'Leia o QR com o celular', apoio: 'ou digite o código no app Ponto W' },
  { n: 4, icone: 'pix', texto: 'Pague com Pix no fim' },
];

/** T0 — Espera: o convite e o passo a passo, o preço de agora e as vagas */
export function parteEspera(d: DadosTela): Partes {
  const { tarifa } = d;
  const potencia = d.vagas.length ? Math.max(...d.vagas.map((v) => v.potenciaKW)) : 0;
  const conector = d.vagas.length
    ? MODELOS_CARREGADOR[d.vagas[0].dados.vaga.modelo]?.conector.replace(/ \(.*\)$/, '') ?? 'Tipo 2'
    : 'Tipo 2';
  const motivos = tarifa.explicacao.slice(0, 3);
  return {
    estado: (
      <div className="tk-espera">
        <div className="tk-espera-topo">
          <div className="tk-espera-texto">
            <h1 className="tk-titulo-grande">Carregue seu elétrico aqui</h1>
            <p className="tk-sub">Recarga em 4 passos</p>
          </div>
          <img className="tk-espera-carro" src={carroDoTotem} alt="" draggable={false} />
        </div>
        <ol className="tk-passos">
          {PASSOS.map((p) => (
            <li key={p.n} className="tk-passo">
              <span className="tk-passo-n">{p.n}</span>
              <span className="tk-passo-texto">
                <b>{p.texto}</b>
                {p.apoio && <span>{p.apoio}</span>}
              </span>
              <Ic nome={p.icone} tamanho={64} />
            </li>
          ))}
        </ol>
        {d.demo && <Simulacao d={d} />}
      </div>
    ),
    numeros: (
      <div className="tk-preco">
        <div className="tk-preco-principal">
          <span className="tk-rotulo">Preço do kWh agora</span>
          <div className="tk-preco-valor">{brl(tarifa.precoFinalKWh)}<small>/kWh</small></div>
        </div>
        <div className="tk-preco-lado">
          <span className="tk-rotulo">Vagas livres</span>
          <div className="tk-vagas-valor">{d.vagasLivres} de {d.vagas.length}</div>
          <div className="tk-nota">até {num(potencia)} kW · {conector}</div>
          {d.solar != null && d.solar > 0 && (
            <div className="tk-solar"><Ic nome="sol" tamanho={32} /><span>Em um dia típico, {pct(d.solar)} da energia do ponto vem do sol e da bateria GoodWe</span></div>
          )}
        </div>
        {motivos.length > 0 && <ul className="tk-motivos">{motivos.map((m) => <li key={m}>{m}</li>)}</ul>}
        <div className="tk-preco-rodape">
          {tarifa.proxima && <span className="tk-proxima">Às {tarifa.proxima.hora}h: {tarifaKWh(tarifa.proxima.precoKWh)}</span>}
          <span className="tk-nota">O preço trava quando você confirma</span>
        </div>
      </div>
    ),
    acao: (
      <div className="tk-aguarda">
        <Ic nome="tomada" tamanho={56} />
        <span>Aguardando você conectar o cabo</span>
      </div>
    ),
  };
}

/** T0b — carro no cabo e a sessão ainda não existe; depois de 30 s admite que não iniciou */
export function parteReconhecendo(d: DadosTela): Partes {
  const falhou = d.foco?.situacao === 'reconhecendoFalhou';
  return {
    estado: falhou ? (
      <Bloco
        icone="alerta" tom="aviso" titulo="Não conseguimos iniciar" texto="Desconecte o cabo e conecte de novo."
        apoio={d.demo ? 'Demonstração: confira se o simulador está ligado.' : 'Se continuar assim, chame um atendente da loja.'}
      />
    ) : (
      <Bloco giro icone="carro" titulo="Carro detectado" texto="Gerando o código..." apoio={d.foco?.apelido} />
    ),
  };
}

/** T8 — o código venceu antes de alguém ler o QR */
export function parteExpirado(): Partes {
  return {
    estado: (
      <Bloco
        icone="relogio" tom="aviso" titulo="O código expirou" texto="Desconecte o cabo e conecte de novo."
        apoio="Um código novo aparece assim que o carro for conectado."
      />
    ),
  };
}
