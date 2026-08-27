import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// O app roda em dois lugares: no Railway na raiz do domínio, e no GitHub
// Pages sob /gs_goodwe/. O caminho vem do ambiente para não precisar de dois
// builds diferentes — sem a variável, assume a raiz.
export default defineConfig(() => ({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
}))
