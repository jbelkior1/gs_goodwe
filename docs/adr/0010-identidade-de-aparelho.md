# ADR-0010: Identidade de aparelho por usuário técnico criado no pareamento

**Status:** Proposta
**Data:** 19/10/2026
**Decisores:** João

## Contexto

Totem e agente precisam ler e gravar dados do próprio ponto, sem uma pessoa logada. A documentação do Supabase recomenda nunca pôr a chave secreta num aparelho fora do seu controle. O login anônimo tem limite de 30 por hora por IP e perde a identidade se o armazenamento for limpo.

## Decisão

1. O franqueado gera um código de 6 dígitos (válido por 10 min).
2. O aparelho envia o código para a Edge Function `parear-dispositivo`, que:
   - confere o código;
   - cria um usuário técnico (e-mail sintético `disp-<uuid>@dispositivos.pontow.local` e senha aleatória longa);
   - grava `dispositivos` (tipo, ponto);
   - devolve as credenciais **uma vez**.
3. O aparelho faz login com elas e guarda a sessão (totem: no navegador; agente: em arquivo local ou variável de ambiente).
4. Revogar é desativar o usuário pela Edge Function `revogar-dispositivo`.
5. Um mesmo usuário técnico pode atender vários pontos (`dispositivos` tem uma linha por ponto). É o caso do agente simulador da demo.
6. **Totem e agente têm poderes diferentes.** As funções do agente (abrir, medir, encerrar, comandos) usam `private.pontos_do_agente()` e recusam o totem. O totem fica num lugar público e só lê o ponto e cria a sessão do visitante (`pontos_do_totem()`).

## Opções consideradas

### A: Usuário técnico criado no pareamento (escolhida)
**Prós:** sem chave mestra no aparelho; RLS pelo ponto; revogação simples.
**Contras:** uma Edge Function com a chave secreta (ela roda no Supabase, sob nosso controle).

### B: Login anônimo
**Contras:** limite de taxa, perda de identidade, e a doc pede políticas restritivas.

### C: Chave secreta no aparelho
**Contras:** quem tiver o aparelho tem o banco inteiro. Descartada.

## Consequências

- **Fica mais fácil:** saber qual aparelho fez o quê (o ator dos eventos é o dispositivo).
- **Fica mais difícil:** recuperar um aparelho que perdeu as credenciais. É preciso parear de novo; o usuário antigo é revogado.
