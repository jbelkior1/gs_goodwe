# ADR-0011: Bateria do carro como estimativa em recarga AC

**Status:** Proposta
**Data:** 19/10/2026
**Decisores:** João

## Contexto

O sistema atual mostra o SoC (porcentagem da bateria) como dado medido. Na recarga AC (IEC 61851, cabo Tipo 2), o carregador e o carro trocam só o limite de corrente (PWM do Control Pilot) e o estado da conexão. O carregador não recebe o SoC. Na ISO 15118-2 o SoC só vem em DC; em AC, só a ISO 15118-20 o traz, e ela não está disponível neste projeto. Um engenheiro da GoodWe notaria a inconsistência.

## Decisão

- O motorista informa a bateria ao confirmar a recarga (opcional).
- O app estima `soc ≈ soc_informado + energia_kwh × 0,92 / capacidade_kwh × 100` (0,92 = eficiência típica de carga AC), limitado a 100.
- A tela mostra o número como **estimativa** ("≈ 64%"); sem bateria informada, mostra só kWh, R$ e tempo.
- O simulador conhece a bateria real do carro simulado, mas **não a publica**; ela só influencia a física (a queda de corrente acima de 80%).
- A prioridade do controle de demanda usa a estimativa quando existe; senão, a ordem de chegada.

## Consequências

- **Fica mais fácil:** responder à banca com precisão técnica.
- **Fica mais difícil:** a curva ao vivo mostra potência e energia, não bateria.
