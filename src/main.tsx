import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ProvedorEstado } from './app/estado';
import { Carregando, Falha } from './app/Abertura';
import { carregarBase } from './domain/db';
import { telaCheia } from './app/tela';
import App from './App';
import './styles.css';

const raiz = createRoot(document.getElementById('root')!);

/** totem e celular em tela cheia (ou embutidos no palco) só precisam do que está acontecendo agora */
function abreComoQuiosque(): boolean {
  const raizApp = import.meta.env.BASE_URL.replace(/\/$/, '');
  const caminho = location.pathname.startsWith(raizApp) ? location.pathname.slice(raizApp.length) : location.pathname;
  const embutido = new URLSearchParams(location.search).get('embed') === '1';
  if (caminho.startsWith('/totem')) return embutido || telaCheia('totem', location.search);
  if (caminho.startsWith('/motorista')) return embutido || telaCheia('motorista', location.search);
  return false;
}

// ao abrir, lê o banco; se não responder, mostra a falha e tenta de novo (a cada 15 s ou pelo botão)
let carregando = false;
function iniciar() {
  if (carregando) return;
  carregando = true;
  raiz.render(<Carregando />);
  carregarBase({ quiosque: abreComoQuiosque() })
    .then(() => {
      raiz.render(
        <StrictMode>
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <ProvedorEstado>
              <App />
            </ProvedorEstado>
          </BrowserRouter>
        </StrictMode>,
      );
    })
    .catch((e: Error) => raiz.render(<Falha detalhe={e.message} aoTentar={iniciar} />))
    .finally(() => { carregando = false; });
}

iniciar();
