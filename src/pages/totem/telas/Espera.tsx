import { MODELOS_CARREGADOR, REGRAS } from '../../../domain/catalogo';
import { num, tarifaKWh } from '../../../domain/formato';
import carroDoTotem from '../../../assets/carro-totem.webp';
import { Bloco, Cartao, CartaoDoPreco, Instrucao, ListaDePassos, Simulacao } from '../componentes';
import { Ic, type NomeIc } from '../icones';
import type { DadosTela, Partes } from '../tipos';

const PASSOS: { n: number; icone: NomeIc; texto: string; apoio?: string }[] = [
  { n: 1, icone: 'tomada', texto: 'Conecte o cabo na vaga' },
  { n: 2, icone: 'qr', texto: 'Leia o QR com o celular', apoio: 'ou digite o código no app Ponto W' },
  { n: 3, icone: 'raio', texto: 'Acompanhe a carga aqui ou no app' },
  { n: 4, icone: 'pix', texto: 'Pague com Pix no fim' },
];

/** T0 — Espera: o convite, o preço de agora, o passo a passo e as vagas */
export function parteEspera(d: DadosTela): Partes {
  const { tarifa } = d;
  const potencia = d.vagas.length ? Math.max(...d.vagas.map((v) => v.potenciaKW)) : 0;
  const conector = d.vagas.length
    ? MODELOS_CARREGADOR[d.vagas[0].dados.vaga.modelo]?.conector.replace(/ \(.*\)$/, '') ?? 'Tipo 2'
    : 'Tipo 2';
  const vertical = d.orientacao === 'vertical';

  const preco = (
    <CartaoDoPreco
      rotulo="Preço do kWh agora" precoKWh={tarifa.precoFinalKWh} tarifa={tarifa}
      nota={(
        <>
          {tarifa.proxima && <span className="tk-proxima">Às {tarifa.proxima.hora}h: {tarifaKWh(tarifa.proxima.precoKWh)}</span>}
          <span className="tk-dim">O preço trava quando você confirma</span>
        </>
      )}
    />
  );

  return {
    estado: (
      <div className="tk-espera">
        <div className="tk-espera-topo">
          <div className="tk-espera-texto">
            <h1 className="tk-titulo-grande">Carregue seu elétrico aqui</h1>
            <p className="tk-sub">Recarga em 4 passos, sem cadastro</p>
          </div>
          <img className="tk-espera-carro" src={carroDoTotem} alt="" draggable={false} />
        </div>
        {vertical && preco}
        <ol className="tk-passos">
          {PASSOS.map((p) => (
            <li key={p.n} className="tk-passo">
              <span className="tk-passo-n">{p.n}</span>
              <span className="tk-passo-texto">
                <b>{p.texto}</b>
                {p.apoio && <span>{p.apoio}</span>}
              </span>
              <Ic nome={p.icone} tamanho={56} />
            </li>
          ))}
        </ol>
      </div>
    ),
    // deitado, o preço fica na coluna da direita
    numeros: vertical ? undefined : <div className="tk-espera-lado">{preco}</div>,
    acao: (
      <Instrucao icone="tomada">
        Conecte o cabo para começar
        <small>{d.vagasLivres} de {d.vagas.length} {d.vagas.length === 1 ? 'vaga livre' : 'vagas livres'} · até {num(potencia)} kW · {conector}</small>
      </Instrucao>
    ),
    demo: d.demo ? <Simulacao d={d} /> : undefined,
  };
}

/** T0b — carro no cabo e a sessão ainda não existe; depois de 30 s admite que não iniciou */
export function parteReconhecendo(d: DadosTela): Partes {
  const falhou = d.foco?.situacao === 'reconhecendoFalhou';
  if (falhou) {
    return {
      etapa: { n: 1, tom: 'aviso', rotulo: 'Não iniciou' },
      estado: (
        <Bloco
          icone="alerta" tom="aviso" titulo="Não conseguimos iniciar" texto="Desconecte o cabo e conecte de novo."
          apoio={d.demo ? 'Demonstração: confira se o simulador está ligado.' : `${d.foco?.apelido ?? 'A vaga'} não reconheceu o carro em 30 segundos.`}
        />
      ),
      acao: <Instrucao icone="pessoa">Precisa de ajuda? Chame um atendente da loja</Instrucao>,
    };
  }
  return {
    etapa: { n: 1 },
    estado: (
      <Bloco
        giro icone="carro" titulo="Reconhecendo o carro"
        apoio={`${d.foco?.apelido ?? 'Vaga'} · leva alguns segundos`} alerta="Não retire o cabo"
      />
    ),
    numeros: (
      <CartaoDoPreco
        tom="neutro" rotulo="Preço que vai travar" precoKWh={d.precoKWh} tarifa={d.tarifa}
        nota={<span className="tk-dim">Vale por {REGRAS.codigoValidadeMin} minutos depois que o QR aparecer</span>}
      />
    ),
    acao: <Instrucao icone="qr">O QR aparece em instantes</Instrucao>,
  };
}

/** T8 — o código venceu antes de alguém ler o QR */
export function parteExpirado(): Partes {
  return {
    etapa: { n: 2, tom: 'aviso', rotulo: 'Expirou' },
    estado: (
      <Bloco
        icone="relogio" tom="aviso" titulo="O código expirou"
        apoio={`Passaram ${REGRAS.codigoValidadeMin} minutos sem confirmação no celular. Nada foi cobrado.`}
      />
    ),
    numeros: (
      <Cartao tom="aviso" rotulo="Para gerar um código novo">
        <ListaDePassos
          tom="aviso"
          passos={['Retire o cabo do carro', 'Conecte de novo', `Leia o QR novo em até ${REGRAS.codigoValidadeMin} min`]}
        />
        <div className="tk-cartao-nota"><span className="tk-dim">O preço do kWh é recalculado na hora do QR novo</span></div>
      </Cartao>
    ),
    acao: <Instrucao icone="pessoa">Precisa de ajuda? Chame um atendente da loja</Instrucao>,
  };
}
