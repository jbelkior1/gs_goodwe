import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../../app/estado';
import {
  base, carregadoresDoPonto, obterPonto, pontoAtivo, regiaoDoPonto, statusDoPonto, tarifaAtual,
} from '../../domain/db';
import { num, tarifaKWh } from '../../domain/formato';
import { Nota, Segmentado, StatusBadge } from '../../ui/kit';
import { Icone } from '../../ui/icones';
import { linkSoNesteAparelho } from '../../ui/QR';
import { Aparelhos } from './Aparelhos';
import { DEMO, definirGuia, pontoPadrao, useGuiaLigado, type AparelhoId } from './ambienteDemo';
import { Fluxograma } from './Fluxograma';
import { situacaoDaDemo } from './fluxo';
import { Palco } from './Palco';
import './demo.css';

/**
 * Central da demonstração (/demo): o fluxograma do produto em 11 passos com o passo atual vindo da
 * base ao vivo, os quatro aparelhos com link direto, QR e botão Abrir, e o Palco com as quatro
 * telas lado a lado.
 */

const CHAVE_PONTO = 'pontow.demo.ponto';
type Vista = 'roteiro' | 'palco';

function pontoGuardado(): string | null {
  try { return localStorage.getItem(CHAVE_PONTO); } catch { return null; }
}

export default function Demo() {
  useApp(); // relê o componente a cada atualização do banco em tempo real
  const [params, setParams] = useSearchParams();
  const vista: Vista = params.get('vista') === 'palco' ? 'palco' : 'roteiro';
  const guia = useGuiaLigado();

  const padrao = pontoPadrao();
  const [escolhido, setEscolhido] = useState<string>(() => {
    const daUrl = params.get('ponto');
    return [daUrl, pontoGuardado()].find((id) => id && obterPonto(id)) ?? padrao;
  });
  const [abas, setAbas] = useState<Partial<Record<AparelhoId, string>>>({});

  // ponto que saiu da base volta para o padrão
  const pontoId = obterPonto(escolhido) ? escolhido : padrao;
  const ponto = obterPonto(pontoId);

  const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR');
  const grupos = {
    operando: base.pontos.filter(pontoAtivo).sort(porNome),
    instalacao: base.pontos.filter((p) => statusDoPonto(p) === 'INSTALACAO').sort(porNome),
  };

  if (!DEMO) {
    return (
      <div className="dm">
        <div className="dm-corpo">
          <Nota titulo="Central da demonstração" tom="amber">
            Esta página só existe no modo demonstração (VITE_MODO_DEMO=true).{' '}
            <Link to="/">Voltar ao início</Link>
          </Nota>
        </div>
      </div>
    );
  }

  const escolher = (id: string) => {
    setEscolhido(id);
    try { localStorage.setItem(CHAVE_PONTO, id); } catch { /* sem armazenamento */ }
  };
  const mudarVista = (v: Vista) => {
    const p = new URLSearchParams(params);
    if (v === 'palco') p.set('vista', 'palco'); else p.delete('vista');
    setParams(p, { replace: true });
  };

  const situacao = situacaoDaDemo(pontoId);
  const vagas = ponto ? carregadoresDoPonto(pontoId) : [];
  const livres = vagas.filter((c) => c.estado === 'DISPONIVEL').length;
  const regiao = ponto ? regiaoDoPonto(ponto) : null;
  const foraDoPadrao = pontoId !== padrao;
  const passosTxt = situacao.passos.length === 0 ? '' : situacao.passos.length === 1
    ? `Passo ${situacao.passos[0]}` : `Passos ${situacao.passos.join(' e ')}`;

  return (
    <div className="dm">
      <header className="dm-topo">
        <Link to="/" className="dm-marca" title="Voltar ao início">
          <span className="brand-logo"><Icone nome="raio" tamanho={16} /></span>
          <span>
            <span className="dm-marca-nome">Ponto W · GoodWe</span>
            <span className="dm-marca-sub">Central da demonstração</span>
          </span>
        </Link>
        <Segmentado<Vista>
          rotulo="Vista da central" valor={vista} aoMudar={mudarVista}
          opcoes={[{ id: 'roteiro', rotulo: 'Roteiro e aparelhos' }, { id: 'palco', rotulo: 'Palco' }]}
        />
        <label className="dm-opcao dm-guia" title="Mostra, em cada aparelho, o passo do fluxograma e o que fazer agora">
          <input type="checkbox" role="switch" checked={guia} onChange={(e) => definirGuia(e.target.checked)} />
          <span>Guia didático nos aparelhos</span>
        </label>
      </header>

      <main className={`dm-corpo${vista === 'palco' ? ' dm-corpo-palco' : ''}`}>
        <section className="card dm-ponto" aria-label="Ponto da demonstração">
          <div className="dm-ponto-campo">
            <label className="dm-rotulo" htmlFor="dm-ponto">Ponto da demonstração</label>
            <select id="dm-ponto" className="btn" value={pontoId} onChange={(e) => escolher(e.target.value)}>
              <optgroup label="Em operação">
                {grupos.operando.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} · {regiaoDoPonto(p).zona}/{regiaoDoPonto(p).uf}{p.id === padrao ? ' · franqueado de demonstração' : ''}
                  </option>
                ))}
              </optgroup>
              {grupos.instalacao.length > 0 && (
                <optgroup label="Em instalação">
                  {grupos.instalacao.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome} · {regiaoDoPonto(p).zona}/{regiaoDoPonto(p).uf}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          {ponto && (
            <div className="dm-ponto-dados">
              <StatusBadge estado={statusDoPonto(ponto)} />
              <span>{ponto.formato}</span>
              <span className="muted">{regiao ? `${regiao.zona}, ${regiao.cidade}/${regiao.uf}` : ''}</span>
              <span>{num(livres)} de {num(vagas.length)} vagas livres</span>
              {pontoAtivo(ponto) && <span>{tarifaKWh(tarifaAtual(pontoId).precoFinalKWh)} agora</span>}
            </div>
          )}
          {foraDoPadrao && (
            <div className="tiny muted dm-ponto-aviso">
              A conta franqueado@ opera só o ponto padrão. Neste ponto, o notebook do franqueado só aparece
              pela conta que for dona dele (por exemplo, a do comerciante que acabou de ativá-lo).
            </div>
          )}
        </section>

        <section className={`card dm-agora ${situacao.fase}${vista === 'palco' ? ' compacto' : ''}`} aria-live="polite" aria-label="O que está acontecendo agora">
          <div className="dm-agora-topo">
            <span className="dm-agora-rotulo"><i className="dot pulse" />Ao vivo{passosTxt ? ` · ${passosTxt}` : ''}</span>
            <span className="dm-agora-titulo">{situacao.titulo}</span>
          </div>
          <p className="dm-agora-texto">{situacao.resumo}</p>
          {situacao.numeros.length > 0 && (
            <dl className="dm-numeros">
              {situacao.numeros.map((n) => (
                <div key={n.rotulo}><dt>{n.rotulo}</dt><dd>{n.valor}</dd></div>
              ))}
            </dl>
          )}
        </section>

        {vista === 'roteiro' ? (
          <>
            <section aria-labelledby="dm-t-fluxo" className="dm-secao">
              <h2 id="dm-t-fluxo" className="dm-titulo">O fluxograma do produto</h2>
              <Fluxograma situacao={situacao} />
            </section>

            <section aria-labelledby="dm-t-ap" className="dm-secao">
              <h2 id="dm-t-ap" className="dm-titulo">Os quatro aparelhos</h2>
              {linkSoNesteAparelho() && (
                <Nota titulo="Os links e QRs apontam para localhost" tom="amber">
                  O celular e o totem não abrem localhost. Rode <code>npm run dev:rede</code> e coloque
                  {' '}<code>VITE_URL_PUBLICA=http://IP-DO-NOTEBOOK:5191</code> no <code>.env.local</code> (o IP está em <code>ipconfig</code>).
                </Nota>
              )}
              <Aparelhos
                pontoId={pontoId} pontoPadrao={padrao} guia={guia} abas={abas}
                aoMudarAba={(id, aba) => setAbas((a) => ({ ...a, [id]: aba }))}
              />
              <details className="dm-dicas">
                <summary>Antes de abrir tudo no mesmo computador</summary>
                <ul>
                  <li>
                    O login fica guardado por endereço. Dois logins ao mesmo tempo num computador pedem origens diferentes
                    (<code>localhost:5191</code>, <code>goodwe.localhost:5191</code>, <code>totem.localhost:5191</code>) ou janelas anônimas;
                    o botão Abrir já usa essas origens. Em aparelhos separados, que é o caso da apresentação, não há conflito.
                  </li>
                  <li>
                    Os links com <code>?conta=</code> entram sozinhos com a conta de demonstração e limpam o endereço.
                    Com o guia ligado, os links levam <code>&amp;guia=1</code> e cada aparelho lembra.
                  </li>
                  <li>O Palco usa o mesmo login do navegador e não troca de conta.</li>
                </ul>
              </details>
            </section>
          </>
        ) : (
          <Palco pontoId={pontoId} pontoPadrao={padrao} abas={abas} />
        )}
      </main>
    </div>
  );
}
