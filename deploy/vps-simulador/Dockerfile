# Simulador do Ponto W num contêiner mínimo: um arquivo só (empacotado com o esbuild), sem npm install na VPS.
FROM node:22-alpine
WORKDIR /app
COPY simulador.mjs .
USER node
CMD ["node", "simulador.mjs"]
