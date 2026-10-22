# Simulador do Ponto W na VPS (temporário)

O simulador faz o papel dos carregadores: sinal de vida das vagas, abertura da recarga (QR e código),
carga, fechamento da conta e saída do carro. Sem ele o site abre, mas a recarga não anda. Esta pasta
sobe o simulador na VPS de forma isolada, para o site funcionar com o notebook desligado.

**Isolado de propósito:** projeto Docker próprio (`pontow-simulador`), rede própria, nenhuma porta
aberta (só chamadas de saída para o Supabase), teto de 0,25 CPU e 192 MB de memória, log limitado a
10 MB. Não usa nem altera nenhum outro contêiner, rede, proxy ou pasta da VPS.

## Arquivos

| Arquivo | O que é | No git? |
|---|---|---|
| `Dockerfile` | `node:22-alpine` rodando um arquivo só | sim |
| `docker-compose.yml` | contêiner `pontow-simulador`, limites e log | sim |
| `simulador.mjs` | o simulador empacotado (`npm run simulador:pacote`) | não (gerado) |
| `.env` | `SUPABASE_URL` e `SUPABASE_SECRET_KEY`, copiados do `.env.local` | **nunca** |

## Subir

No PowerShell, dentro do repositório:

```powershell
npm run simulador:pacote
Select-String -Path .env.local -Pattern '^(SUPABASE_URL|SUPABASE_SECRET_KEY)=' | ForEach-Object { $_.Line } | Set-Content -Encoding ascii deploy/vps-simulador/.env
ssh root@72.60.52.177 "mkdir -p /opt/pontow-simulador && chmod 700 /opt/pontow-simulador"
scp deploy/vps-simulador/Dockerfile deploy/vps-simulador/docker-compose.yml deploy/vps-simulador/simulador.mjs deploy/vps-simulador/.env root@72.60.52.177:/opt/pontow-simulador/
```

**Desligue o simulador do notebook antes do próximo passo.** Dois simuladores ao mesmo tempo podem
abrir duas recargas para o mesmo carro e fazem a carga andar em dobro.

```powershell
ssh root@72.60.52.177 "cd /opt/pontow-simulador && chmod 600 .env && docker compose up -d --build && docker logs --tail 5 pontow-simulador"
```

O log deve mostrar `simulador ligado · aceleração 10× · ciclo de 2 s`. Depois apague a cópia local da
chave: `Remove-Item deploy/vps-simulador/.env`.

## Ver se está rodando

```powershell
ssh root@72.60.52.177 "docker ps --filter name=pontow-simulador && docker logs --tail 20 pontow-simulador"
```

## Remover sem deixar rastro

```powershell
ssh root@72.60.52.177 "cd /opt/pontow-simulador && docker compose down --rmi all && rm -rf /opt/pontow-simulador"
```

Isso para e apaga o contêiner, a rede e a imagem `pontow-simulador:1`, e apaga a pasta (com o `.env`).
A imagem base `node:22-alpine` só deve ser apagada se nenhum outro contêiner a usa:
`docker ps -a --filter ancestor=node:22-alpine` vazio, então `docker image rm node:22-alpine`.
Para voltar ao notebook: `npm run simulador`.
