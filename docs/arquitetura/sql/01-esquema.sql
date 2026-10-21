-- =============================================================================
-- Ponto W · esquema v2 (RASCUNHO DE DESENHO)
--
-- Vira as migrations da fase F0 (supabase/migrations/). Ainda não foi aplicado
-- em banco nenhum. Postgres 15+ (Supabase). Convenções:
--   * nomes em português, snake_case;
--   * chave primária uuid + código curto legível para o suporte (P-0042, S-000123);
--   * dinheiro numeric(12,2), energia numeric(10,3), corrente numeric(5,1);
--   * todo horário é timestamptz;
--   * regras com vigência (ADR-0006); lançamentos e eventos só de inclusão.
-- Ordem: 01-esquema → 02-rls → 03-funcoes.
-- =============================================================================

create schema if not exists private;
-- funções criadas em private não ganham EXECUTE para PUBLIC por padrão (o 03 concede só o necessário)
alter default privileges in schema private revoke execute on functions from public;

-- ---------------------------------------------------------------- enums
create type tipo_organizacao     as enum ('GOODWE', 'FRANQUEADO');
create type papel_membro         as enum ('ADMIN', 'OPERADOR', 'SUPORTE');
create type segmento_comercio    as enum ('Café / Restaurante', 'Mercado', 'Farmácia', 'Shopping', 'Posto', 'Clínica', 'Loja de rua');
create type status_solicitacao   as enum ('ANALISE', 'VISTORIA', 'PENDENTE_DOC', 'APROVADO', 'REPROVADO');
create type status_ponto         as enum ('PLANEJADO', 'INSTALACAO', 'ATIVO', 'SUSPENSO', 'ENCERRADO');
create type estado_vaga          as enum ('DISPONIVEL', 'RESERVADO', 'CONECTADO', 'CARREGANDO', 'PAUSADO',
                                          'SUSPENSO_EV', 'FINALIZADO', 'OFFLINE', 'FALHA', 'MANUTENCAO');
create type tipo_dispositivo     as enum ('TOTEM', 'AGENTE');
create type estado_sessao        as enum ('ABERTA', 'AUTORIZADA', 'CARREGANDO', 'PAUSADA', 'ENCERRADA',
                                          'PAGA', 'PENDENTE', 'EXPIRADA', 'CANCELADA');
create type origem_sessao        as enum ('TOTEM', 'APP', 'VISITANTE', 'RFID');
create type motivo_encerramento  as enum ('PEDIDO_MOTORISTA', 'PEDIDO_TOTEM', 'PEDIDO_OPERADOR', 'SUPORTE',
                                          'LIMITE_VALOR', 'CARRO_PAROU', 'CABO_REMOVIDO', 'FALHA');
create type tipo_comando         as enum ('INICIAR', 'PARAR', 'LIMITAR',
                                          'SIM_CONECTAR', 'SIM_DESCONECTAR', 'SIM_CARGA_COMERCIO', 'SIM_SOL', 'SIM_FALHA');
create type status_comando       as enum ('PENDENTE', 'ENTREGUE', 'EXECUTADO', 'FALHOU', 'EXPIRADO');
create type status_cobranca      as enum ('PAGA', 'PENDENTE', 'ESTORNADA', 'ESTORNADA_PARCIAL');
create type finalidade_pagamento as enum ('RECARGA_CARTEIRA', 'VISITANTE');
create type status_pagamento     as enum ('CRIADO', 'AGUARDANDO', 'PAGO', 'EXPIRADO', 'FALHOU', 'ESTORNADO');
create type tipo_conta           as enum ('CARTEIRA', 'RECEBIVEL_PONTO', 'ROYALTIES', 'FUNDO_MARKETING',
                                          'TARIFAS', 'RECEITA_PLATAFORMA', 'EXTERNO');
create type tipo_transacao       as enum ('RECARGA_CARTEIRA', 'PRE_PAGO_VISITANTE', 'RECARGA_VEICULO', 'DEVOLUCAO_SOBRA',
                                          'ESTORNO', 'TARIFA_GATEWAY', 'MENSALIDADE', 'REPASSE', 'AJUSTE');
create type status_fechamento    as enum ('ABERTO', 'FECHADO', 'QUITADO');
create type severidade_alerta    as enum ('INFO', 'ATENCAO', 'CRITICO');
create type status_alerta        as enum ('ABERTO', 'EM_ANDAMENTO', 'RESOLVIDO');
create type ator_evento          as enum ('USUARIO', 'DISPOSITIVO', 'SISTEMA', 'GATEWAY');

-- ---------------------------------------------------------------- utilitário
create or replace function private.tocar_atualizado_em() returns trigger
language plpgsql set search_path = '' as $$
begin new.atualizado_em := now(); return new; end $$;

-- código legível sem truncar (lpad corta quando o número passa da largura)
create or replace function private.codigo(p_prefixo text, p_n bigint, p_largura int) returns text
language sql immutable set search_path = '' as $$
  select p_prefixo || case when length(p_n::text) >= p_largura then p_n::text
                           else lpad(p_n::text, p_largura, '0') end;
$$;

create or replace function private.bloquear_alteracao() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'PW900: registro imutável (%)', tg_table_name using errcode = 'PW900'; end $$;

-- ============================================================ 1. CATÁLOGOS (GoodWe edita)
create table regioes (
  id                 text primary key,                 -- 'r-sp-pinheiros'
  uf                 char(2)      not null,
  cidade             text         not null,
  zona               text         not null,
  custo_energia_kwh  numeric(6,4) not null check (custo_energia_kwh > 0),
  densidade_ev       numeric(4,3) not null check (densidade_ev between 0 and 1),
  lat                numeric(9,6) not null,
  lng                numeric(9,6) not null,
  ativo              boolean      not null default true
);

create table modelos_carregador (
  id              text primary key,                    -- 'GW7K-HCA-20'
  potencia_kw     numeric(5,2) not null,
  fases           smallint     not null check (fases in (1, 3)),
  tensao_v        numeric(6,1) not null,               -- nominal de projeto (230 mono / 400 tri); a potência
                                                       -- efetiva depende da rede do ponto e da ligação da vaga
  corrente_max_a  numeric(5,1) not null,
  corrente_min_a  numeric(5,1) not null default 6,     -- IEC 61851
  conector        text         not null default 'Tipo 2 (IEC 62196-2)',
  protocolos      text[]       not null,
  suporta_ocpp    boolean      not null default false,
  ativo           boolean      not null default true
);

create table veiculos (
  id                  text primary key,                -- 'v-dolphin'
  montadora           text         not null,
  modelo              text         not null,
  capacidade_kwh      numeric(6,2) not null,
  potencia_max_ac_kw  numeric(5,2) not null,
  fases_obc           smallint     not null default 1 check (fases_obc in (1, 3)),
  ativo               boolean      not null default true
);

create table formatos_franquia (
  id             text primary key,                     -- 'Light' | 'Standard' | 'Hub'
  carregadores   smallint     not null,
  modelo_id      text         not null references modelos_carregador(id),
  capex          numeric(12,2) not null,
  taxa_franquia  numeric(12,2) not null,
  ativo          boolean      not null default true
);

-- ============================================================ 2. ORGANIZAÇÕES E PESSOAS
create table organizacoes (
  id            uuid primary key default gen_random_uuid(),
  tipo          tipo_organizacao not null,
  nome          text not null,
  razao_social  text,
  cnpj          text unique,
  ativa         boolean not null default true,
  demo          boolean not null default false,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
-- só existe uma organização GOODWE
create unique index uq_organizacao_goodwe on organizacoes (tipo) where tipo = 'GOODWE';

create table membros (
  organizacao_id uuid not null references organizacoes(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  papel          papel_membro not null,
  ativo          boolean not null default true,
  convidado_por  uuid references auth.users(id),
  criado_em      timestamptz not null default now(),
  primary key (organizacao_id, user_id)
);
create index idx_membros_user on membros (user_id);

create table motoristas (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  nome         text not null,
  telefone     text,
  veiculo_id   text references veiculos(id),
  rfid_uid     text unique,
  demo         boolean not null default false,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ============================================================ 3. PARÂMETROS DA REDE (vigência)
create table parametros_rede (
  id                         uuid primary key default gen_random_uuid(),
  vigente_desde              timestamptz  not null,
  royalty_pct                numeric(5,4) not null,      -- 0.0600
  fundo_pct                  numeric(5,4) not null,      -- 0.0200
  processamento_pct          numeric(5,4) not null,      -- 0.0150 (Q10)
  mensalidade_plataforma     numeric(12,2) not null,     -- 180.00
  limiar_viabilidade_h       numeric(4,2) not null,      -- 2.30
  saldo_minimo               numeric(12,2) not null,     -- 20.00
  custo_energia_referencia   numeric(6,4) not null,      -- 0.85 (fatorEnergia)
  amortecimento_energia      numeric(4,3) not null,      -- 0.600
  minutos_expira_sessao      smallint     not null default 10,
  minutos_reserva            smallint     not null default 5,
  minutos_codigo_pareamento  smallint     not null default 10,
  segundos_comando           smallint     not null default 30,
  minutos_offline            smallint     not null default 2,
  dias_retencao_telemetria   smallint     not null default 30,
  criado_por                 uuid references auth.users(id),
  criado_em                  timestamptz  not null default now(),
  unique (vigente_desde)
);

-- ============================================================ 4. EXPANSÃO
create sequence seq_solicitacao;
create table solicitacoes (
  id                    uuid primary key default gen_random_uuid(),
  codigo                text not null unique default private.codigo('H-', nextval('public.seq_solicitacao'), 4),
  solicitante_id        uuid not null references auth.users(id),
  organizacao_id        uuid references organizacoes(id),       -- preenchida na aprovação
  comercio              text not null,
  razao_social          text,
  cnpj                  text not null,
  regiao_id             text not null references regioes(id),
  endereco              text not null,
  lat                   numeric(9,6),
  lng                   numeric(9,6),
  segmento              segmento_comercio not null,
  formato_desejado      text not null references formatos_franquia(id),
  carga_disponivel_kw   numeric(6,2) not null,
  fluxo_diario_pessoas  integer not null check (fluxo_diario_pessoas >= 0),
  status                status_solicitacao not null default 'ANALISE',
  score                 smallint check (score between 0 and 100),   -- [IA]
  horas_uso_previstas   numeric(4,2),                               -- [IA]
  veredito_ia           text,                                       -- APROVAR | APROVAR_COM_RESSALVA | REPROVAR
  fatores               jsonb,                                      -- [{rotulo, peso, nota}]
  parecer               text,
  versao_modelo         text,                                       -- 'viabilidade-v2'
  decidido_por          uuid references auth.users(id),
  decidido_em           timestamptz,
  motivo_decisao        text,
  ponto_id              uuid,                                       -- FK adicionada depois de pontos
  demo                  boolean not null default false,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);
create index idx_solicitacoes_status on solicitacoes (status, criado_em desc);
create index idx_solicitacoes_solicitante on solicitacoes (solicitante_id);

-- ============================================================ 5. REDE
create sequence seq_ponto;
create table pontos (
  id                      uuid primary key default gen_random_uuid(),
  codigo                  text not null unique default private.codigo('P-', nextval('public.seq_ponto'), 4),
  organizacao_id          uuid not null references organizacoes(id),
  solicitacao_id          uuid references solicitacoes(id),
  regiao_id               text not null references regioes(id),
  nome                    text not null,
  endereco                text not null,
  lat                     numeric(9,6),
  lng                     numeric(9,6),
  formato_id              text not null references formatos_franquia(id),
  segmento                segmento_comercio not null,
  status                  status_ponto not null default 'PLANEJADO',
  -- entrada elétrica (base do controle de demanda). O Brasil tem as duas redes de baixa tensão:
  -- 127/220 V (Enel SP, Light, CEMIG, Copel, CPFL...) e 220/380 V (DF, parte do NE e do Sul).
  tensao_fn_v             numeric(5,1) check (tensao_fn_v in (127, 220)),   -- fase-neutro
  tensao_ff_v             numeric(5,1) check (tensao_ff_v in (220, 380)),   -- fase-fase
  fases                   smallint check (fases in (1, 2, 3)),              -- fases disponíveis
  limite_corrente_a       numeric(6,1),             -- disjuntor, por fase
  carga_base_kw           numeric(6,2),             -- carga típica do comércio
  -- ecossistema GoodWe
  tem_solar               boolean not null default false,
  potencia_fv_kwp         numeric(6,2) not null default 0,
  tem_bateria             boolean not null default false,
  capacidade_bateria_kwh  numeric(6,2) not null default 0,
  horario                 jsonb,                    -- {"seg":["07:00","22:00"], ...}
  simulado                boolean not null default true,   -- vagas atendidas pelo driver simulado
  demo                    boolean not null default false,
  inaugurado_em           timestamptz,
  ativado_em              timestamptz,
  motivo_status           text,
  criado_em               timestamptz not null default now(),
  atualizado_em           timestamptz not null default now()
);
create index idx_pontos_org on pontos (organizacao_id);
create index idx_pontos_status on pontos (status);
alter table solicitacoes add constraint fk_solicitacao_ponto foreign key (ponto_id) references pontos(id);

create table regras_tarifa (
  id                      uuid primary key default gen_random_uuid(),
  ponto_id                uuid not null references pontos(id) on delete cascade,
  vigente_desde           timestamptz  not null,
  preco_base_kwh          numeric(6,2) not null check (preco_base_kwh > 0),
  fatores_hora            numeric(4,3)[] not null check (array_length(fatores_hora, 1) = 24),
  fatores_ocupacao        jsonb not null,           -- [{"min":0.9,"fator":1.15},{"min":0.7,"fator":1.07},{"max":0.2,"fator":0.95}]
  usar_fator_energia      boolean not null default true,
  taxa_sessao             numeric(12,2) not null default 0,
  preco_minuto            numeric(6,2)  not null default 0,
  tolerancia_ocioso_min   smallint      not null default 10,
  preco_minuto_ocioso     numeric(6,2)  not null default 0,
  valor_minimo            numeric(12,2) not null default 0,
  criado_por              uuid references auth.users(id),
  criado_em               timestamptz not null default now(),
  unique (ponto_id, vigente_desde)
);

create sequence seq_vaga;
create table carregadores (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text not null unique default private.codigo('V-', nextval('public.seq_vaga'), 5),
  ponto_id           uuid not null references pontos(id) on delete cascade,
  numero             smallint not null,                       -- 1, 2, 3...
  apelido            text not null,                           -- 'Vaga 1'
  modelo_id          text not null references modelos_carregador(id),
  numero_serie       text,
  -- como a vaga está ligada na entrada: monofásico entre fase e neutro (rede 220/380) ou entre
  -- duas fases (rede 127/220); trifásico nas três. O controle de demanda soma a corrente por fase.
  ligacao            text not null default 'L1-N'
                     check (ligacao in ('L1-N','L2-N','L3-N','L1-L2','L2-L3','L1-L3','L1-L2-L3')),
  driver             jsonb not null default '{"tipo":"SIMULADO"}',   -- {"tipo":"MODBUS","endereco":1}
  -- Esta tabela está na publicação de tempo real: só muda em transição de estado ou de limite.
  -- Potência ao vivo vai pela telemetria; sinal de vida fica em dispositivos.
  estado             estado_vaga not null default 'OFFLINE',
  limite_atual_a     numeric(5,1) not null default 0,
  energia_total_kwh  numeric(12,3) not null default 0,        -- odômetro
  sessao_atual_id    uuid,                                    -- FK adicionada depois de sessoes
  reservado_para     uuid references auth.users(id),
  reservado_ate      timestamptz,
  qr_token           text not null unique default encode(extensions.gen_random_bytes(9), 'hex'),
  atualizado_em      timestamptz not null default now(),
  unique (ponto_id, numero)
);
create index idx_carregadores_ponto on carregadores (ponto_id);

-- ============================================================ 6. APARELHOS
create table dispositivos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  ponto_id       uuid not null references pontos(id) on delete cascade,
  tipo           tipo_dispositivo not null,
  nome           text not null,                 -- 'Totem da entrada'
  versao         text,
  ultimo_sinal   timestamptz,
  pareado_em     timestamptz not null default now(),
  revogado_em    timestamptz,
  unique (user_id, ponto_id)                    -- o agente simulador atende vários pontos
);
create index idx_dispositivos_ponto on dispositivos (ponto_id);

-- Códigos usados ou vencidos são apagados por tarefa diária; o pareamento em si fica em `eventos`.
create table codigos_pareamento (
  codigo          char(6) primary key,
  ponto_id        uuid not null references pontos(id) on delete cascade,
  tipo            tipo_dispositivo not null,
  criado_por      uuid not null references auth.users(id),
  criado_em       timestamptz not null default now(),
  expira_em       timestamptz not null,
  usado_em        timestamptz,
  dispositivo_id  uuid references dispositivos(id)
);

-- ============================================================ 7. LIVRO-CAIXA (contas antes das sessões)
create table contas (
  id           uuid primary key default gen_random_uuid(),
  tipo         tipo_conta not null,
  motorista_id uuid references motoristas(user_id),   -- CARTEIRA de motorista
  ponto_id     uuid references pontos(id),            -- RECEBIVEL_PONTO
  sessao_id    uuid,                                   -- CARTEIRA de visitante (por sessão)
  criado_em    timestamptz not null default now(),
  check (
    (tipo = 'CARTEIRA' and (motorista_id is not null) <> (sessao_id is not null) and ponto_id is null) or
    (tipo = 'RECEBIVEL_PONTO' and ponto_id is not null and motorista_id is null and sessao_id is null) or
    (tipo in ('ROYALTIES','FUNDO_MARKETING','TARIFAS','RECEITA_PLATAFORMA','EXTERNO')
       and motorista_id is null and ponto_id is null and sessao_id is null)
  )
);
create unique index uq_conta_motorista on contas (motorista_id) where tipo = 'CARTEIRA' and motorista_id is not null;
create unique index uq_conta_visitante on contas (sessao_id)   where tipo = 'CARTEIRA' and sessao_id is not null;
create unique index uq_conta_ponto     on contas (ponto_id)    where tipo = 'RECEBIVEL_PONTO';
create unique index uq_conta_global    on contas (tipo)        where tipo in ('ROYALTIES','FUNDO_MARKETING','TARIFAS','RECEITA_PLATAFORMA','EXTERNO');

-- ============================================================ 8. OPERAÇÃO
create sequence seq_sessao;
create table sessoes (
  id                     uuid primary key default gen_random_uuid(),
  codigo                 text not null unique default private.codigo('S-', nextval('public.seq_sessao'), 6),
  ponto_id               uuid not null references pontos(id),
  carregador_id          uuid not null references carregadores(id),
  motorista_id           uuid references motoristas(user_id),        -- null = visitante
  veiculo_id             text references veiculos(id),
  conta_id               uuid references contas(id),                 -- carteira que paga
  origem                 origem_sessao not null,
  estado                 estado_sessao not null default 'ABERTA',
  conexao_id             uuid not null unique,                       -- idempotência do agente
  codigo_vinculo         char(4),
  reservada_para         uuid references auth.users(id),             -- só essa pessoa pode autorizar
  aberta_em              timestamptz not null default now(),
  expira_em              timestamptz,
  autorizada_em          timestamptz,
  inicio_carga           timestamptz,
  fim_carga              timestamptz,
  encerrada_em           timestamptz,
  motivo_encerramento    motivo_encerramento,
  soc_inicial_informado  smallint check (soc_inicial_informado between 0 and 100),
  limite_valor           numeric(12,2),
  -- preço (travado na autorização; imutável depois)
  regra_tarifa_id        uuid references regras_tarifa(id),
  parametros_id          uuid references parametros_rede(id),
  tarifa_cotada_kwh      numeric(6,2),
  tarifa_kwh             numeric(6,2),
  -- medição (atualizada pelo agente a cada 30 s)
  energia_kwh            numeric(10,3) not null default 0,
  potencia_atual_kw      numeric(6,2)  not null default 0,
  custo_estimado         numeric(12,2) not null default 0,
  minutos_ociosos        integer       not null default 0,
  motivo_pausa           text,
  demo                   boolean not null default false,
  atualizado_em          timestamptz not null default now()
);
-- no máximo uma sessão em aberto por vaga (invariante 1)
create unique index uq_sessao_aberta_por_vaga on sessoes (carregador_id)
  where estado in ('ABERTA', 'AUTORIZADA', 'CARREGANDO', 'PAUSADA');
-- código de vínculo único entre sessões abertas (invariante 2)
create unique index uq_codigo_vinculo on sessoes (codigo_vinculo) where estado = 'ABERTA';
create index idx_sessoes_ponto on sessoes (ponto_id, aberta_em desc);
create index idx_sessoes_motorista on sessoes (motorista_id, aberta_em desc);
create index idx_sessoes_estado on sessoes (estado) where estado in ('ABERTA','AUTORIZADA','CARREGANDO','PAUSADA','PENDENTE');

alter table carregadores add constraint fk_vaga_sessao foreign key (sessao_atual_id) references sessoes(id);
alter table contas add constraint fk_conta_sessao foreign key (sessao_id) references sessoes(id);

create table telemetria (
  sessao_id      uuid not null references sessoes(id) on delete cascade,
  ts             timestamptz not null,
  ponto_id       uuid not null,
  carregador_id  uuid not null,
  tensao_v       numeric(6,1) not null,
  corrente_a     numeric(5,1) not null,
  potencia_kw    numeric(6,2) not null,
  energia_kwh    numeric(10,3) not null,
  primary key (sessao_id, ts)
);
create index idx_telemetria_ponto_ts on telemetria (ponto_id, ts);

-- Uma linha a cada 5 min por ponto (o painel ao vivo usa a telemetria, não esta tabela).
create table leituras_entrada (
  ponto_id            uuid not null references pontos(id) on delete cascade,
  ts                  timestamptz not null,
  carga_comercio_kw   numeric(7,2) not null,
  solar_kw            numeric(7,2) not null default 0,
  bateria_kw          numeric(7,2) not null default 0,     -- + descarregando, − carregando
  recarga_kw          numeric(7,2) not null default 0,
  importacao_kw       numeric(7,2) not null,               -- o que passa pelo disjuntor
  corrente_max_fase_a numeric(6,1) not null,
  primary key (ponto_id, ts)
);

create table comandos (
  id             uuid primary key default gen_random_uuid(),
  ponto_id       uuid not null references pontos(id),
  carregador_id  uuid references carregadores(id),
  sessao_id      uuid references sessoes(id),
  tipo           tipo_comando not null,
  parametros     jsonb not null default '{}',
  status         status_comando not null default 'PENDENTE',
  criado_por     uuid references auth.users(id),
  criado_em      timestamptz not null default now(),
  expira_em      timestamptz not null,
  entregue_em    timestamptz,
  concluido_em   timestamptz,
  erro           text
);
create index idx_comandos_pendentes on comandos (ponto_id, criado_em) where status in ('PENDENTE', 'ENTREGUE');

-- ============================================================ 9. FINANCEIRO
create table transacoes (
  id               uuid primary key default gen_random_uuid(),
  tipo             tipo_transacao not null,
  referencia_tipo  text not null,          -- 'sessao' | 'pagamento' | 'fechamento' | 'ajuste'
  referencia_id    uuid not null,
  descricao        text not null,
  estorno_de       uuid references transacoes(id),
  criada_por       uuid references auth.users(id),
  criada_em        timestamptz not null default now()
);
create index idx_transacoes_ref on transacoes (referencia_tipo, referencia_id);

create table lancamentos (
  id            bigint generated always as identity primary key,
  transacao_id  uuid not null references transacoes(id),
  conta_id      uuid not null references contas(id),
  valor         numeric(12,2) not null check (valor <> 0),   -- + entra na conta, − sai
  criado_em     timestamptz not null default now()
);
create index idx_lancamentos_conta on lancamentos (conta_id, criado_em);
create index idx_lancamentos_transacao on lancamentos (transacao_id);

-- soma zero por transação, conferida no commit (ADR-0005). SECURITY DEFINER é obrigatório: até o
-- Postgres 17 (o do Supabase) o gatilho adiado roda com o papel de quem está ativo no commit, e a
-- RLS de lancamentos esconderia as linhas, fazendo a soma "dar zero" sempre.
create or replace function private.conferir_soma_zero() returns trigger
language plpgsql security definer set search_path = '' as $$
declare soma numeric;
begin
  select coalesce(sum(valor), 0) into soma from public.lancamentos where transacao_id = new.transacao_id;
  if soma <> 0 then
    raise exception 'PW901: transação % não fecha (soma %)', new.transacao_id, soma using errcode = 'PW901';
  end if;
  return null;
end $$;
create constraint trigger tg_soma_zero after insert on lancamentos
  deferrable initially deferred for each row execute function private.conferir_soma_zero();
create trigger tg_lancamentos_imutaveis before update or delete on lancamentos
  for each row execute function private.bloquear_alteracao();
create trigger tg_transacoes_imutaveis before update or delete on transacoes
  for each row execute function private.bloquear_alteracao();

create view v_saldos as
  select c.id as conta_id, c.tipo, c.motorista_id, c.ponto_id, c.sessao_id,
         coalesce(sum(l.valor), 0)::numeric(12,2) as saldo
  from contas c left join lancamentos l on l.conta_id = c.id
  group by c.id;

create sequence seq_cobranca;
create table cobrancas (
  id                      uuid primary key default gen_random_uuid(),
  codigo                  text not null unique default private.codigo('C-', nextval('public.seq_cobranca'), 6),
  sessao_id               uuid not null unique references sessoes(id),
  ponto_id                uuid not null references pontos(id),
  motorista_id            uuid references motoristas(user_id),
  energia_kwh             numeric(10,3) not null,
  tarifa_kwh              numeric(6,2)  not null,
  valor_energia           numeric(12,2) not null,
  valor_sessao            numeric(12,2) not null default 0,
  valor_tempo             numeric(12,2) not null default 0,
  valor_ocioso            numeric(12,2) not null default 0,
  valor_bruto             numeric(12,2) not null,
  royalty                 numeric(12,2) not null,
  fundo                   numeric(12,2) not null,
  processamento           numeric(12,2) not null,
  liquido_comercio        numeric(12,2) not null,
  custo_energia_estimado  numeric(12,2) not null,      -- informativo: o comércio paga na conta de luz
  regra_tarifa_id         uuid not null references regras_tarifa(id),
  parametros_id           uuid not null references parametros_rede(id),
  status                  status_cobranca not null,
  transacao_id            uuid references transacoes(id),
  demo                    boolean not null default false,
  criada_em               timestamptz not null default now(),
  check (valor_bruto = valor_energia + valor_sessao + valor_tempo + valor_ocioso),
  check (valor_bruto = royalty + fundo + processamento + liquido_comercio)
);
create index idx_cobrancas_ponto on cobrancas (ponto_id, criada_em desc);

create table pagamentos (
  id             uuid primary key default gen_random_uuid(),
  finalidade     finalidade_pagamento not null,
  provedor       text not null,                 -- 'simulado' | 'asaas'
  metodo         text not null default 'PIX',
  conta_id       uuid not null references contas(id),   -- carteira que recebe o crédito
  sessao_id      uuid references sessoes(id),           -- visitante
  pagador_id     uuid references auth.users(id),
  valor          numeric(12,2) not null check (valor > 0),
  valor_estornado numeric(12,2) not null default 0,
  status         status_pagamento not null default 'CRIADO',
  id_externo     text,
  qr_payload     text,
  copia_e_cola   text,
  expira_em      timestamptz,
  pago_em        timestamptz,
  ultima_resposta jsonb,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (provedor, id_externo)
);

create table fechamentos (
  id                      uuid primary key default gen_random_uuid(),
  ponto_id                uuid not null references pontos(id),
  organizacao_id          uuid not null references organizacoes(id),
  competencia             date not null,                 -- primeiro dia do mês
  status                  status_fechamento not null default 'ABERTO',
  recargas                integer not null default 0,
  energia_kwh             numeric(12,3) not null default 0,
  bruto                   numeric(12,2) not null default 0,
  royalty                 numeric(12,2) not null default 0,
  fundo                   numeric(12,2) not null default 0,
  processamento           numeric(12,2) not null default 0,
  mensalidade             numeric(12,2) not null default 0,
  liquido                 numeric(12,2) not null default 0,
  custo_energia_estimado  numeric(12,2) not null default 0,
  fechado_em              timestamptz,
  quitado_em              timestamptz,
  unique (ponto_id, competencia)
);

-- ============================================================ 10. RASTREIO E OPERAÇÃO
create table eventos (
  id             bigint generated always as identity primary key,
  ocorrido_em    timestamptz not null default now(),
  ator_tipo      ator_evento not null,
  ator_id        uuid,
  ator_nome      text,
  origem         text not null,          -- 'app' | 'totem' | 'painel' | 'agente' | 'webhook' | 'cron' | 'seed'
  entidade       text not null,          -- 'sessao' | 'vaga' | 'ponto' | 'cobranca' | ...
  entidade_id    uuid not null,
  ponto_id       uuid,
  tipo           text not null,          -- catálogo em 07-rastreio-e-gestao.md
  antes          jsonb,
  depois         jsonb,
  motivo         text,
  correlacao_id  uuid
);
create index idx_eventos_entidade on eventos (entidade, entidade_id, ocorrido_em);
create index idx_eventos_ponto on eventos (ponto_id, ocorrido_em desc);
create index idx_eventos_correlacao on eventos (correlacao_id);
create trigger tg_eventos_imutaveis before update or delete on eventos
  for each row execute function private.bloquear_alteracao();

create table alertas (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null,              -- catálogo em 07-rastreio-e-gestao.md
  chave           text not null,              -- deduplicação: 'OFFLINE:<dispositivo>'
  severidade      severidade_alerta not null,
  status          status_alerta not null default 'ABERTO',
  ponto_id        uuid references pontos(id),
  carregador_id   uuid references carregadores(id),
  sessao_id       uuid references sessoes(id),
  mensagem        text not null,
  responsavel_id  uuid references auth.users(id),
  aberto_em       timestamptz not null default now(),
  resolvido_em    timestamptz,
  resolucao       text
);
create unique index uq_alerta_aberto on alertas (chave) where status <> 'RESOLVIDO';
create index idx_alertas_ponto on alertas (ponto_id, status);

-- ---------------------------------------------------------------- atualizado_em
create trigger tg_tocar_org        before update on organizacoes  for each row execute function private.tocar_atualizado_em();
create trigger tg_tocar_motorista  before update on motoristas    for each row execute function private.tocar_atualizado_em();
create trigger tg_tocar_solic      before update on solicitacoes  for each row execute function private.tocar_atualizado_em();
create trigger tg_tocar_ponto      before update on pontos        for each row execute function private.tocar_atualizado_em();
create trigger tg_tocar_vaga       before update on carregadores  for each row execute function private.tocar_atualizado_em();
create trigger tg_tocar_sessao     before update on sessoes       for each row execute function private.tocar_atualizado_em();
create trigger tg_tocar_pagamento  before update on pagamentos    for each row execute function private.tocar_atualizado_em();

-- ---------------------------------------------------------------- tempo real
-- Mudanças de tabela (baixa frequência). A telemetria vai por Broadcast (ADR-0009). `dispositivos`
-- fica de fora: o sinal de vida muda a cada 30 s e a tela de aparelhos consulta periodicamente.
alter publication supabase_realtime add table pontos, carregadores, sessoes, comandos, pagamentos, alertas;
