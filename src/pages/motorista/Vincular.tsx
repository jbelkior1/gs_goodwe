import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../../app/estado';
import { carregadoresDoPonto, cotacaoDaSessao, obterMotorista, obterPonto, sessaoDoMotorista, sessaoPorCodigo } from '../../domain/db';
import { vincularSessao } from '../../data/acoes';
import { ALFABETO_CODIGO, REGRAS, VEICULOS } from '../../domain/catalogo';
import { horaMin, tarifaKWh } from '../../domain/formato';
import type { Sessao } from '../../domain/types';
import { Card, Nota } from '../../ui/kit';
import { Icone } from '../../ui/icones';
import { LeitorQR } from '../../ui/LeitorQR';
import { ComoCarregar, LinhasDoPreco } from './ComoCarregar';

const DEMO = import.meta.env.VITE_MODO_DEMO === 'true';

/** Maiúsculas, só os caracteres do alfabeto do totem (sem 0/O, 1/I...), no máximo 4. */
const limparCodigo = (v: string) =>
  v.toUpperCase().split('').filter((c) => ALFABETO_CODIGO.includes(c)).join('').slice(0, 4);

/** Destino do QR do totem: confirma o preço travado e assume a recarga. */
export default function Vincular() {
  const [params] = useSearchParams();
  const { pathname, search } = useLocation();
  const nav = useNavigate();
  const { perfil, motoristaId } = useApp();
  // o campo guarda o que foi digitado (até 8 caracteres) e o código sai dele: assim dá para perceber
  // quando a pessoa digita os 6 números do pareamento do totem, mesmo tecla por tecla
  const [digitado, setDigitado] = useState(() => limparCodigo(params.get('c') ?? ''));
  const codigo = limparCodigo(digitado);
  // chegou pelo QR do totem (o link traz ?c=); se a pessoa mexe no campo, passa a ser código digitado
  const [peloQR, setPeloQR] = useState(() => limparCodigo(params.get('c') ?? '').length === 4);
  const semEspaco = digitado.replace(/\s/g, '');
  // 6 números é o código de pareamento do totem novo (do franqueado), não o da recarga
  const pareceParear = /^\d{5,6}$/.test(semEspaco);
  const cortou = !pareceParear && semEspaco.length > 0 && limparCodigo(semEspaco).length < Math.min(semEspaco.length, 4);
  const [soc, setSoc] = useState('');
  const [limite, setLimite] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [confirmando, setConfirmando] = useState<Sessao | null>(null);
  const [lendo, setLendo] = useState(false);
  const [erroQR, setErroQR] = useState('');

  // quem confirma: a conta logada; no modo demonstração, sem login, o motorista de demonstração
  const quemId = perfil?.motoristaId ?? perfil?.id ?? (DEMO && motoristaId ? motoristaId : undefined);
  const motorista = obterMotorista(quemId);
  const [veiculoId, setVeiculoId] = useState(motorista?.veiculoId ?? 'v-dolphin');
  const [mexeuNoCarro, setMexeuNoCarro] = useState(false);
  // o perfil chega depois do login: traz o carro do cadastro, a menos que a pessoa já tenha escolhido outro
  useEffect(() => {
    if (!mexeuNoCarro && motorista?.veiculoId) setVeiculoId(motorista.veiculoId);
  }, [motorista?.veiculoId, mexeuNoCarro]);

  // segura a sessão durante a confirmação: o tempo real pode tirá-la de "aberta" um instante antes da resposta
  const sessao = (codigo.length === 4 ? sessaoPorCodigo(codigo) : undefined) ?? confirmando ?? undefined;
  const ponto = sessao ? obterPonto(sessao.pontoId) : undefined;
  const vaga = sessao ? carregadoresDoPonto(sessao.pontoId).find((c) => c.id === sessao.carregadorId) : undefined;
  const cot = sessao && ponto ? cotacaoDaSessao(sessao) : undefined;
  // uma recarga por vez: com outra em andamento (ou a pagar), não assume esta
  const outraAtiva = (() => {
    const a = sessaoDoMotorista(quemId);
    return a && a.id !== sessao?.id && a.id !== confirmando?.id ? a : undefined;
  })();
  const pontoDaOutra = outraAtiva ? obterPonto(outraAtiva.pontoId) : undefined;

  const digitar = (valor: string) => {
    setDigitado(valor.toUpperCase().slice(0, 8));
    setPeloQR(false);
    setErro('');
  };

  // o QR do totem é um link do app (…/motorista/vincular?c=CÓDIGO); o do Pix, no modo demonstração,
  // é o link da tela de pagamento. Qualquer outro QR não é de recarga.
  const lerQR = (texto: string) => {
    setLendo(false);
    setErroQR('');
    try {
      const u = new URL(texto);
      const raiz = import.meta.env.BASE_URL.replace(/\/$/, '');
      const rota = u.pathname.startsWith(raiz) ? u.pathname.slice(raiz.length) || '/' : u.pathname;
      if (rota.startsWith('/motorista/pagar/')) { nav(rota + u.search); return; }
      const c = limparCodigo(u.searchParams.get('c') ?? '');
      if (rota.startsWith('/motorista/vincular') && c.length === 4) {
        setDigitado(c); setPeloQR(true); setErro('');
        return;
      }
    } catch { /* não é link: pode ser o código puro */ }
    const puro = texto.trim();
    if (puro.length === 4 && limparCodigo(puro).length === 4) { setDigitado(limparCodigo(puro)); setPeloQR(true); return; }
    setErroQR('Esse QR não é de uma recarga Ponto W. Aponte a câmera para o QR que o totem mostra depois que o cabo é conectado.');
  };

  const confirmar = async () => {
    if (!sessao || !cot || !quemId || outraAtiva) return;
    setErro(''); setOcupado(true); setConfirmando(sessao);
    try {
      const s = await vincularSessao(sessao, quemId, veiculoId,
        soc ? Number(soc) : undefined, limite ? Number(limite) : undefined, cot.precoKWh, peloQR ? 'QR' : 'CODIGO');
      nav(`/motorista/recarga/${s.id}`);
    } catch (e) {
      setErro((e as Error).message);
      setConfirmando(null);
    } finally { setOcupado(false); }
  };

  // volta para esta mesma tela, com o código, depois do login
  const volta = (() => {
    const p = new URLSearchParams(search);
    p.set('c', codigo);
    return `${pathname}?${p.toString()}`;
  })();

  return (
    <div className="stack">
      {lendo && <LeitorQR titulo="Ler o QR do totem" aoLer={lerQR} aoFechar={() => setLendo(false)} />}
      <Card title="QR ou código da recarga" sub="O totem mostra os dois depois que o cabo é conectado">
        <div className="stack" style={{ gap: 8 }}>
          <button type="button" className="btn primary" style={{ justifyContent: 'center', gap: 8, minHeight: 46 }} onClick={() => { setErroQR(''); setLendo(true); }}>
            <Icone nome="qr" tamanho={16} /> Ler o QR com a câmera
          </button>
          {erroQR && <div className="tiny" role="alert" style={{ color: 'var(--k-red2)' }}>{erroQR}</div>}
          <div className="tiny muted" style={{ textAlign: 'center' }}>ou digite o código de 4 letras</div>
          <input id="codigo" className="btn cod-campo" value={digitado} maxLength={8} placeholder="7K4W"
                 inputMode="text" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
                 enterKeyHint="go" aria-label="Código de 4 letras do totem"
                 onChange={(e) => digitar(e.target.value)} />
          <div className="cod-ajuda">
            {pareceParear
              ? 'Esse é o código de 6 números do totem novo: ele é do franqueado, para ligar o totem ao ponto em Meu ponto e totem. O código da recarga tem 4 letras e aparece no totem depois que o cabo é conectado.'
              : cortou
              ? 'Esse caractere não existe no código. Ele não usa 0, O, 1, I, 5, S, 8, B, 2, Z, 6, G, Q nem L.'
              : 'Sem 0, O, 1, I, 5, S, 8, B, 2, Z, 6, G, Q nem L: o totem só usa letras e números que não se confundem.'}
          </div>
        </div>
      </Card>

      {!sessao && codigo.length === 4 && (
        <Nota titulo="Esse código não está ativo" tom="amber">
          Confira o totem — o código vale {REGRAS.codigoValidadeMin} minutos depois que o cabo é conectado.
          Se passou desse prazo, desconecte e conecte o cabo de novo para o totem gerar outro.
        </Nota>
      )}

      {!sessao && (
        <Card>
          <ComoCarregar destaque={codigo.length === 4 ? 3 : 4} />
        </Card>
      )}

      {sessao && ponto && cot && (
        <Card title={ponto.nome} sub={`${vaga?.apelido ?? 'Vaga'}${vaga ? ` · ${vaga.modelo}` : ''}`}>
          <div className="cod-resumo">
            <div className="cod-preco">
              <div>
                <div className="kpi-label">Preço do kWh</div>
                <div className="cod-preco-valor">{tarifaKWh(cot.precoKWh)}</div>
              </div>
              <div className="tiny muted">
                {cot.travada && cot.validaAte
                  ? `Travado no totem · válido até ${horaMin(cot.validaAte)}`
                  : 'Fica travado quando você confirmar'}
              </div>
            </div>
            {!cot.travada && (
              <Nota titulo="Preço atualizado" tom="amber">
                A cotação do totem venceu{cot.anterior ? ` (era ${tarifaKWh(cot.anterior)})` : ''}. O preço de agora é{' '}
                {tarifaKWh(cot.precoKWh)}; confira antes de iniciar.
              </Nota>
            )}
            <LinhasDoPreco linhas={cot.composicao.explicacao} />

            {quemId && outraAtiva ? (
              <Nota titulo="Você já tem uma recarga em andamento" tom="amber">
                {outraAtiva.estado === 'CONCLUIDO' ? 'Falta pagar o Pix da recarga' : 'A recarga'} em {pontoDaOutra?.nome ?? 'outro ponto'} ainda não terminou.
                Encerre {outraAtiva.estado === 'CONCLUIDO' ? 'e pague ' : ''}aquela antes de começar outra.{' '}
                <Link to={`/motorista/recarga/${outraAtiva.id}`}>Ver minha recarga</Link>
              </Nota>
            ) : quemId ? (
              <>
                <div className="sep" style={{ margin: '4px 0' }} />
                <select id="veiculo" className="btn" value={veiculoId} onChange={(e) => { setVeiculoId(e.target.value); setMexeuNoCarro(true); }} aria-label="Seu carro">
                  {VEICULOS.map((v) => <option key={v.id} value={v.id}>{v.montadora} {v.modelo}</option>)}
                </select>
                <input id="soc" className="btn" type="number" inputMode="numeric" min={0} max={100} placeholder="Bateria agora, em % (opcional)" value={soc} onChange={(e) => setSoc(e.target.value)} />
                <input id="limite" className="btn" type="number" inputMode="decimal" min={1} placeholder="Limite em R$ (opcional)" value={limite} onChange={(e) => setLimite(e.target.value)} />
                {erro && <div className="tiny" role="alert" style={{ color: 'var(--k-red2)' }}>{erro}</div>}
                <button className="btn primary" disabled={ocupado} style={{ justifyContent: 'center' }} onClick={confirmar}>
                  {ocupado ? 'Confirmando…' : `Iniciar recarga a ${tarifaKWh(cot.precoKWh)}`}
                </button>
                {!perfil && (
                  <div className="tiny muted">
                    Modo demonstração: a recarga fica no perfil de {motorista?.nome ?? 'motorista de demonstração'}.{' '}
                    <Link to={`/entrar?volta=${encodeURIComponent(volta)}`}>Entrar com a minha conta</Link>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="sep" style={{ margin: '4px 0' }} />
                <div className="tiny muted">
                  Para pagar com Pix e acompanhar a recarga você precisa de uma conta. Depois de entrar, volta para esta tela e o preço acima continua valendo.
                </div>
                <Link className="btn primary" style={{ justifyContent: 'center' }} to={`/entrar?volta=${encodeURIComponent(volta)}`}>
                  Entrar para confirmar
                </Link>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
