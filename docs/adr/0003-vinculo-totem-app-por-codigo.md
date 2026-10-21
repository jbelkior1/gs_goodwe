# ADR-0003: Vínculo totem ↔ app por código de sessão em QR

**Status:** Proposta
**Data:** 19/10/2026
**Decisores:** João

## Contexto

O pedido central: "quando eu iniciar um carregamento pelo totem, ele vincula com o aplicativo". O carregador AC não sabe quem é o motorista. É preciso um jeito simples de ligar a vaga física à conta do motorista, funcionando com a câmera nativa do celular, sem instalar nada.

## Decisão

A sessão nasce quando o cabo é conectado (o agente chama `abrir_sessao`) e recebe um **código de vínculo de 4 caracteres**. O totem mostra o código e um QR com o endereço `…/motorista/vincular?c=CODIGO`. O motorista lê com a câmera, faz login se precisar, confirma o preço e a sessão fica AUTORIZADA. Para quem começa pelo app, cada vaga também tem um **QR fixo** (adesivo) com um token próprio.

## Opções consideradas

### A: Código da sessão aberta pelo cabo, em QR dinâmico no totem (escolhida)
**Prós:** amarra o carro realmente conectado à conta; o código morre em 10 min; dá para digitar se a câmera falhar.
**Contras:** depende do totem online.

### B: Só QR fixo por vaga (adesivo)
**Prós:** dispensa o totem.
**Contras:** qualquer um pode fotografar o adesivo e assumir a vaga de outro; não sabe se o carro já está conectado. Entra só como complemento (fluxo pelo app, com reserva de 5 min).

### C: Cartão RFID
**Prós:** o HCA G2 já lê cartões.
**Contras:** depende de o hardware expor o cartão lido; fica para quando houver integração.

## Consequências

- **Fica mais fácil:** demonstrar com um celular de verdade; dar suporte ("qual era o código?").
- **Fica mais difícil:** garantir código único entre sessões abertas e tratar corrida (dois celulares lendo o mesmo QR). A primeira leitura vence; a segunda recebe `PW002`. A tela de confirmação lê a sessão pelo código com `previa_vinculo`. Vaga reservada pelo app: a sessão nasce reservada e só quem reservou confirma (`confirmar_reserva`); nunca autoriza sozinha.
- **A revisitar:** RFID e reserva antecipada.

## Itens de ação

1. [ ] Alfabeto do código sem caracteres ambíguos (`ACDEFHJKMNPRTUVWXY3479`); índice único entre sessões ABERTA.
2. [ ] QR gerado no próprio app (biblioteca `qrcode`), sem serviço externo.
