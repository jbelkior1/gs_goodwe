import { useNavigate } from 'react-router-dom';
import { base, kpisDaRede, sessoesAtivas, pontosParaMotorista } from '../../domain/db';
import { num, brl } from '../../ui/kit';
import { Icone, type NomeIcone } from '../../ui/icones';

/**
 * Porta de entrada da plataforma.
 *
 * A rede é multi-inquilino: o mesmo sistema atende quatro públicos com
 * poderes diferentes. Aqui a pessoa escolhe por qual porta entra — e cada
 * porta é um endereço próprio, para abrir direto no aparelho de cada um.
 */

interface Painel {
  id: string;
  rota: string;
  ico: NomeIcone;
  nome: string;
  quem: string;
  descricao: string;
  aparelho: string;
  destaque: (d: ReturnType<typeof dados>) => { valor: string; rotulo: string }[];
}

const dados = () => {
  const kpis = kpisDaRede();
  const ativas = sessoesAtivas();
  const pontos = pontosParaMotorista();
  const precoMin = Math.min(...pontos.map((p) => p.precoAgora));
  return { kpis, ativas: ativas.length, pontos: pontos.length, precoMin };
};

const PAINEIS: Painel[] = [
  {
    id: 'motorista',
    rota: '/motorista',
    ico: 'carro',
    nome: 'Motorista',
    quem: 'quem dirige o elétrico',
    descricao: 'Acha o ponto no mapa, trava o preço antes de plugar, acompanha a recarga e paga pelo Pix.',
    aparelho: 'App · celular',
    destaque: (d) => [
      { valor: String(d.pontos), rotulo: 'pontos abertos' },
      { valor: brl(d.precoMin), rotulo: 'menor preço/kWh' },
    ],
  },
  {
    id: 'totem',
    rota: '/totem',
    ico: 'raio',
    nome: 'Totem',
    quem: 'quem chega sem o app',
    descricao: 'Autoatendimento no eletroposto, com o assistente Volt respondendo em tempo real.',
    aparelho: 'Quiosque · tela vertical',
    destaque: (d) => [
      { valor: String(d.ativas), rotulo: 'recargas agora' },
      { valor: 'Volt', rotulo: 'assistente ao vivo' },
    ],
  },
  {
    id: 'franqueado',
    rota: '/franqueado',
    ico: 'loja',
    nome: 'Franqueado',
    quem: 'o comércio que hospeda',
    descricao: 'Faturamento da unidade, controle de demanda da entrada elétrica e repasse do mês.',
    aparelho: 'Painel · desktop',
    destaque: (d) => [
      { valor: String(d.kpis.pontosTotal), rotulo: 'unidades na rede' },
      { valor: '70%', rotulo: 'do bruto fica na loja' },
    ],
  },
  {
    id: 'goodwe',
    rota: '/goodwe',
    ico: 'antena',
    nome: 'GoodWe',
    quem: 'a franqueadora',
    descricao: 'Visão consolidada da rede, homologação de novos pontos e o ecossistema solar instalado.',
    aparelho: 'Torre de controle · desktop',
    destaque: (d) => [
      { valor: brl(d.kpis.faturamentoRedeMes), rotulo: 'faturamento no mês' },
      { valor: `${num(d.kpis.energiaMesKWh)} kWh`, rotulo: 'energia entregue' },
    ],
  },
];

export default function Portal() {
  const navigate = useNavigate();
  const d = dados();

  return (
    <div className="portal">
      <div className="portal-fundo" aria-hidden="true">
        <span className="portal-grade" />
        <span className="portal-halo" />
      </div>

      <header className="portal-topo">
        <div className="portal-marca">
          <span className="portal-logo"><Icone nome="raio" tamanho={17} /></span>
          <div>
            <div className="portal-marca-nome">GOODWE</div>
            <div className="portal-marca-sub">Ponto W · rede de recarga</div>
          </div>
        </div>
        <span className="meta portal-status">
          <span className="dot pulse" style={{ color: 'var(--k-ok)' }} />
          {d.ativas} SESSÕES ATIVAS · {base.pontos.filter((p) => p.ativo).length} PONTOS ONLINE
        </span>
      </header>

      <section className="portal-hero">
        <h1 className="portal-titulo">
          Uma rede.<br />Quatro formas<br /><em>de entrar nela.</em>
        </h1>
        <p className="portal-lead">
          O mesmo sistema atende quem dirige, quem hospeda o carregador e quem opera a rede
          inteira — cada um com seu painel, seus números e seu aparelho. Escolha por onde entrar.
        </p>
      </section>

      <section className="portal-grid">
        {PAINEIS.map((p, i) => (
          <button
            key={p.id}
            className={`portal-card portal-card-${p.id}`}
            style={{ animationDelay: `${i * 70}ms` }}
            onClick={() => navigate(p.rota)}
          >
            <span className="portal-card-topo">
              <span className="portal-card-ico"><Icone nome={p.ico} tamanho={19} /></span>
              <span className="portal-card-aparelho">{p.aparelho}</span>
            </span>

            <span className="portal-card-corpo">
              <span className="portal-card-nome">{p.nome}</span>
              <span className="portal-card-quem">{p.quem}</span>
              <span className="portal-card-desc">{p.descricao}</span>
            </span>

            <span className="portal-card-dados">
              {p.destaque(d).map((h) => (
                <span key={h.rotulo} className="portal-card-dado">
                  <span className="portal-card-valor">{h.valor}</span>
                  <span className="portal-card-rotulo">{h.rotulo}</span>
                </span>
              ))}
            </span>

            <span className="portal-card-entrar">
              Entrar<Icone nome="setaDireita" tamanho={14} />
            </span>
          </button>
        ))}
      </section>

      <footer className="portal-rodape meta">
        <span>GOODWE ENERGIA · EV CHALLENGE · DADOS SIMULADOS</span>
        <span>{base.sessoes.length.toLocaleString('pt-BR')} SESSÕES NA BASE</span>
      </footer>
    </div>
  );
}
