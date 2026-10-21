-- =============================================================================
-- Ponto W · tarifa dinâmica v2 (ADR-0013) · trava de preço no banco
--
-- Preço zero não pode existir: nem como preço base do ponto, nem como preço travado
-- da sessão. Antes disto, uma base vazia virava 0 e a recarga fechava como FATURADO
-- sem cobrança.
--
-- Aplicar DEPOIS do npm run tarifa:migrar? Tanto faz: as travas entram como NOT VALID
-- (valem para toda linha nova ou alterada, sem reprovar o histórico) e a validação das
-- linhas antigas é tentada no fim, sem derrubar a migration se houver sobra.
-- Pode rodar de novo.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pontos_preco_base_positivo' and conrelid = 'public.pontos'::regclass) then
    alter table public.pontos
      add constraint pontos_preco_base_positivo check ("precoBaseKWh" > 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sessoes_tarifa_positiva' and conrelid = 'public.sessoes'::regclass) then
    alter table public.sessoes
      add constraint sessoes_tarifa_positiva check ("tarifaAplicadaKWh" is null or "tarifaAplicadaKWh" > 0) not valid;
  end if;
end $$;

-- valida as linhas que já existem; se alguma não passar, só avisa (confira com as consultas abaixo)
do $$
begin
  begin
    alter table public.pontos validate constraint pontos_preco_base_positivo;
  exception when check_violation then
    raise notice 'pontos com precoBaseKWh <= 0: corrija (npm run tarifa:migrar ajusta para o sugerido da região) e valide de novo';
  end;
  begin
    alter table public.sessoes validate constraint sessoes_tarifa_positiva;
  exception when check_violation then
    raise notice 'sessoes com tarifaAplicadaKWh <= 0: confira com a consulta do final deste arquivo';
  end;
end $$;

-- consultas de conferência (rodar à mão):
--   select "id", "precoBaseKWh" from public.pontos where "precoBaseKWh" is null or "precoBaseKWh" <= 0;
--   select "id", "estado", "tarifaAplicadaKWh" from public.sessoes where "tarifaAplicadaKWh" <= 0;
--   select count(*) from public.eventos where "tipo" = 'TARIFA_V2_MIGRADA';       -- um por ponto, depois do npm run tarifa:migrar
--   select "ts", "tipo", "sessaoId", "detalhe" from public.eventos
--    where "tipo" in ('ERRO_TARIFA_INVALIDA', 'ERRO_COTACAO') order by "ts" desc;   -- erros do simulador
