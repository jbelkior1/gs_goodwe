import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ProvedorEstado } from './app/estado';
import { carregarBase } from './domain/db';
import App from './App';
import './styles.css';

const raiz = createRoot(document.getElementById('root')!);
const aviso = (texto: string) => (
  <div style={{ display: 'grid', placeItems: 'center', height: '100vh', color: '#f4f2ee', fontFamily: 'Inter, sans-serif' }}>
    <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>{texto}</div>
  </div>
);

raiz.render(aviso('Carregando a rede…'));

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
  .catch((e: Error) => raiz.render(aviso(`Não foi possível carregar o banco: ${e.message}`)));
