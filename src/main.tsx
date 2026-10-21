import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ProvedorEstado } from './app/estado';
import { Carregando, Falha } from './app/Abertura';
import { carregarBase } from './domain/db';
import App from './App';
import './styles.css';

const raiz = createRoot(document.getElementById('root')!);

// ao abrir, lê o banco; se não responder, mostra a falha e tenta de novo (a cada 15 s ou pelo botão)
let carregando = false;
function iniciar() {
  if (carregando) return;
  carregando = true;
  raiz.render(<Carregando />);
  carregarBase()
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
