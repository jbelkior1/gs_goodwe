import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ProvedorEstado } from './app/estado';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ProvedorEstado>
        <App />
      </ProvedorEstado>
    </BrowserRouter>
  </StrictMode>,
);
