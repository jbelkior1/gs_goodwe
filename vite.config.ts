import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// O site é publicado em https://<usuario>.github.io/gs_goodwe/, então os
// assets precisam sair com esse prefixo. Em desenvolvimento continua na raiz.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/gs_goodwe/' : '/',
  plugins: [react()],
}))
