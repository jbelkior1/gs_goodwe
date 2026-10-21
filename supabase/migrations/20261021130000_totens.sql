-- =============================================================================
-- Ponto W · MVP · pareamento do totem
--
-- Passo 4 do fluxograma: o franqueado pareia o totem. O aparelho novo abre o endereço do totem
-- sem ponto, gera uma linha aqui com um código de 6 dígitos e mostra o código na tela. No painel
-- do comércio (Meu ponto e totem) o franqueado digita o código: a linha ganha o "pontoId" e o
-- totem, que escuta a própria linha, passa a mostrar o ponto.
--
-- Pode rodar de novo: usa "if not exists" e recria política.
-- Mesmo acesso aberto do MVP (veja 20261019120000_mvp.sql): a versão de mercado amarra o
-- pareamento ao franqueado dono do ponto.
-- =============================================================================

create table if not exists totens (
  "id" text primary key,                                   -- id do aparelho, guardado no navegador do totem
  "codigo" text unique,                                    -- 6 dígitos mostrados na tela enquanto não pareado
  "pontoId" text references pontos("id") on delete set null,
  "criadoEm" timestamptz not null default now(),
  "pareadoEm" timestamptz,
  "ultimoSinal" timestamptz                                -- o totem avisa que está vivo
);

create index if not exists idx_totens_ponto on totens ("pontoId");

alter table totens enable row level security;
drop policy if exists mvp_aberto on totens;
create policy mvp_aberto on totens for all to anon, authenticated using (true) with check (true);

-- tempo real: o totem escuta a própria linha para saber na hora que foi pareado
do $$
begin
  alter publication supabase_realtime add table totens;
exception when duplicate_object then null;
end $$;
