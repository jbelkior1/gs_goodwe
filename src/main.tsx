import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { ProvedorEstado } from './app/estado';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ProvedorEstado>
        <App />
      </ProvedorEstado>
    </HashRouter>
  </StrictMode>,
);
