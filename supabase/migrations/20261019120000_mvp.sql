-- =============================================================================
-- Ponto W · MVP · banco no Supabase
--
-- Cole no SQL Editor do projeto (ou aplique como migration). Pode rodar de novo:
-- usa "if not exists" e recria políticas e gatilhos.
--
-- Colunas em camelCase entre aspas, para as linhas do banco terem o mesmo formato
-- dos tipos do app (src/domain/types.ts) sem conversão.
--
-- SEGURANÇA DE MVP: leitura e escrita abertas para anon e authenticated, porque é
-- só para demonstração. A versão de mercado (docs/arquitetura) tem RLS por papel.
-- =============================================================================

create table if not exists franqueados (
  "id" text primary key, "nome" text not null, "razaoSocial" text, "cnpj" text,
  "desde" timestamptz not null default now()
);

create table if not exists pontos (
  "id" text primary key, "nome" text not null, "franqueadoId" text references franqueados("id"),
  "regiaoId" text not null, "endereco" text, "formato" text not null, "segmento" text not null,
  "status" text not null default 'ATIVO' check ("status" in ('INSTALACAO', 'ATIVO', 'SUSPENSO')),
  "ativo" boolean not null default true,
  "limiteCorrenteA" numeric, "limitePotenciaKW" numeric, "cargaBaseKW" numeric, "precoBaseKWh" numeric,
  "temSolar" boolean not null default false, "potenciaFVkWp" numeric not null default 0,
  "temBateria" boolean not null default false, "capacidadeBateriaKWh" numeric not null default 0,
  "inauguradoEm" timestamptz not null default now(), "lat" numeric, "lng" numeric,
  "demo" boolean not null default false
);

create table if not exists carregadores (
  "id" text primary key, "pontoId" text not null references pontos("id") on delete cascade,
  "apelido" text not null, "modelo" text not null, "estado" text not null default 'DISPONIVEL',
  "potenciaPermitidaKW" numeric not null default 0, "firmware" text,
  "ultimoHeartbeat" timestamptz not null default now(),
  "carro" jsonb   -- carro simulado conectado: {"veiculoId","socReal","conectadoEm"}; null = vaga livre
);

create table if not exists motoristas (
  "id" text primary key, "nome" text, "email" text, "rfidUid" text, "veiculoId" text,
  "desde" timestamptz not null default now()
);

create table if not exists perfis (
  "id" uuid primary key references auth.users(id) on delete cascade,
  "nome" text, "papel" text not null default 'motorista' check ("papel" in ('motorista', 'franqueado', 'goodwe')),
  "franqueadoId" text, "motoristaId" text
);

create table if not exists sessoes (
  "id" text primary key, "pontoId" text not null, "carregadorId" text not null,
  "motoristaId" text, "veiculoId" text,
  "inicio" timestamptz not null default now(), "fim" timestamptz,
  "socInicial" numeric, "socAtual" numeric,
  "energiaKWh" numeric not null default 0, "potenciaAtualKW" numeric not null default 0,
  -- ABERTA → AUTENTICADO → CARREGANDO ↔ PAUSADO → ENCERRANDO → CONCLUIDO (a pagar) → FATURADO (pago); EXPIRADA
  "estado" text not null, "autorizacao" text,
  "tarifaAplicadaKWh" numeric, "custoAcumulado" numeric not null default 0, "motivoPausa" text,
  "codigoVinculo" text, "limiteValor" numeric,
  "demo" boolean not null default false
);
create index if not exists idx_sessoes_ponto on sessoes ("pontoId");
create index if not exists idx_sessoes_estado on sessoes ("estado");
create index if not exists idx_sessoes_motorista on sessoes ("motoristaId");

create table if not exists telemetria (
  "id" bigint generated always as identity primary key,
  "ts" timestamptz not null default now(), "sessaoId" text not null,
  "tensaoV" numeric, "correnteA" numeric, "potenciaKW" numeric, "soc" numeric, "energiaAcumKWh" numeric
);
create index if not exists idx_telemetria_sessao on telemetria ("sessaoId", "ts");

create table if not exists cobrancas (
  "id" text primary key, "sessaoId" text unique, "pontoId" text not null,
  "valor" numeric not null, "metodo" text not null default 'PIX',
  "status" text not null check ("status" in ('PENDENTE', 'PAGO', 'FALHOU')),
  "txid" text, "criadaEm" timestamptz not null default now(), "pagaEm" timestamptz,
  "custoEnergia" numeric, "royaltyGoodWe" numeric, "fundoMarketing" numeric, "gateway" numeric, "liquidoLojista" numeric,
  "demo" boolean not null default false
);
create index if not exists idx_cobrancas_ponto on cobrancas ("pontoId");

create table if not exists homologacoes (
  "id" text primary key, "comercio" text not null, "cnpj" text, "regiaoId" text not null,
  "segmento" text not null, "formatoDesejado" text not null,
  "cargaDisponivelKW" numeric, "fluxoDiarioPessoas" integer, "status" text not null,
  "criadoEm" timestamptz not null default now(),
  "scoreViabilidade" numeric, "horasUsoPrevistas" numeric, "parecer" text,
  "solicitanteId" uuid, "pontoId" text
);

create table if not exists eventos (
  "id" bigint generated always as identity primary key, "ts" timestamptz not null default now(),
  "tipo" text not null, "pontoId" text, "sessaoId" text, "ator" text, "detalhe" jsonb
);

-- ------------------------------------------------------------ acesso aberto (MVP)
do $$
declare t text;
begin
  foreach t in array array['franqueados','pontos','carregadores','motoristas','perfis','sessoes',
                           'telemetria','cobrancas','homologacoes','eventos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists mvp_aberto on %I', t);
    execute format('create policy mvp_aberto on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ------------------------------------------------------------ tempo real
do $$
declare t text;
begin
  foreach t in array array['pontos','carregadores','sessoes','telemetria','cobrancas','homologacoes','perfis'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ------------------------------------------------------------ cadastro: todo usuário novo vira motorista
create or replace function public.mvp_novo_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_nome text := coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1));
begin
  insert into public.perfis ("id", "nome", "papel", "motoristaId")
  values (new.id, v_nome, 'motorista', new.id::text) on conflict do nothing;
  insert into public.motoristas ("id", "nome", "email", "veiculoId", "rfidUid")
  values (new.id::text, v_nome, new.email, coalesce(new.raw_user_meta_data->>'veiculoId', 'v-dolphin'),
          upper(substr(md5(new.id::text), 1, 8)))
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists mvp_novo_usuario on auth.users;
create trigger mvp_novo_usuario after insert on auth.users
  for each row execute function public.mvp_novo_usuario();
