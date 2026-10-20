-- =============================================================================
-- Ponto W · acesso por papel (RLS) · RASCUNHO DE DESENHO
--
-- Princípios (ADR-0001, 0010, segurança mínima):
--   * o papel vem das tabelas membros / motoristas / dispositivos, lidas por
--     funções em `private` (esquema NÃO exposto pela API);
--   * leitura por política; escrita de estado e de dinheiro SÓ por função
--     (sem política de insert/update/delete nessas tabelas = negado);
--   * algumas edições simples de cadastro são diretas, com colunas liberadas
--     uma a uma (grant de coluna) + política de update;
--   * anon não acessa nada; tudo exige login.
-- Recomendações da doc do Supabase seguidas: `to authenticated`, funções em
-- `(select ...)` para virar initPlan, índice nas colunas filtradas,
-- security definer com search_path vazio.
-- =============================================================================

-- ---------------------------------------------------------------- funções de papel
create or replace function private.eh_goodwe() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membros m join public.organizacoes o on o.id = m.organizacao_id
    where m.user_id = (select auth.uid()) and m.ativo and o.tipo = 'GOODWE');
$$;

create or replace function private.eh_goodwe_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membros m join public.organizacoes o on o.id = m.organizacao_id
    where m.user_id = (select auth.uid()) and m.ativo and o.tipo = 'GOODWE' and m.papel = 'ADMIN');
$$;

create or replace function private.minhas_orgs(somente_admin boolean default false) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.organizacao_id from public.membros m
  where m.user_id = (select auth.uid()) and m.ativo and (not somente_admin or m.papel = 'ADMIN');
$$;

create or replace function private.pontos_da_minha_org(somente_admin boolean default false) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.pontos p
  join public.membros m on m.organizacao_id = p.organizacao_id
  where m.user_id = (select auth.uid()) and m.ativo and (not somente_admin or m.papel = 'ADMIN');
$$;

-- qualquer aparelho (leitura); as FUNÇÕES do agente usam pontos_do_agente, as do totem pontos_do_totem:
-- o totem fica num lugar público e não pode, por exemplo, encerrar a carga com a energia que quiser.
create or replace function private.pontos_do_dispositivo() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select d.ponto_id from public.dispositivos d
  where d.user_id = (select auth.uid()) and d.revogado_em is null;
$$;

create or replace function private.pontos_do_agente() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select d.ponto_id from public.dispositivos d
  where d.user_id = (select auth.uid()) and d.revogado_em is null and d.tipo = 'AGENTE';
$$;

create or replace function private.pontos_do_totem() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select d.ponto_id from public.dispositivos d
  where d.user_id = (select auth.uid()) and d.revogado_em is null and d.tipo = 'TOTEM';
$$;

-- pontos no mapa: precisa ser security definer, porque o motorista não lê a tabela pontos
-- (uma subconsulta direta em `pontos` dentro da política voltaria vazia para ele)
create or replace function private.pontos_ativos() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.pontos p where p.status = 'ATIVO';
$$;

create or replace function private.minhas_contas() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.contas c where c.tipo = 'CARTEIRA' and c.motorista_id = (select auth.uid())
  union all
  select c.id from public.contas c
  where c.tipo = 'RECEBIVEL_PONTO' and c.ponto_id in (select private.pontos_da_minha_org(true));
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
-- EXECUTE só nas funções de papel (as políticas abaixo as chamam como authenticated). O 03 refaz
-- esta lista no fim, depois de criar as demais funções de private sem acesso.
grant execute on function private.eh_goodwe(), private.eh_goodwe_admin(), private.minhas_orgs(boolean),
  private.pontos_da_minha_org(boolean), private.pontos_do_dispositivo(), private.pontos_do_agente(),
  private.pontos_do_totem(), private.pontos_ativos(), private.minhas_contas() to authenticated;

-- ---------------------------------------------------------------- base: nada para anon
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ---------------------------------------------------------------- catálogos
alter table regioes            enable row level security;
alter table modelos_carregador enable row level security;
alter table veiculos           enable row level security;
alter table formatos_franquia  enable row level security;

create policy cat_regioes_leitura   on regioes            for select to authenticated using (true);
create policy cat_modelos_leitura   on modelos_carregador for select to authenticated using (true);
create policy cat_veiculos_leitura  on veiculos           for select to authenticated using (true);
create policy cat_formatos_leitura  on formatos_franquia  for select to authenticated using (true);

create policy cat_regioes_escrita   on regioes            for all to authenticated
  using ((select private.eh_goodwe_admin())) with check ((select private.eh_goodwe_admin()));
create policy cat_modelos_escrita   on modelos_carregador for all to authenticated
  using ((select private.eh_goodwe_admin())) with check ((select private.eh_goodwe_admin()));
create policy cat_veiculos_escrita  on veiculos           for all to authenticated
  using ((select private.eh_goodwe_admin())) with check ((select private.eh_goodwe_admin()));
create policy cat_formatos_escrita  on formatos_franquia  for all to authenticated
  using ((select private.eh_goodwe_admin())) with check ((select private.eh_goodwe_admin()));
-- catálogos: desativar em vez de apagar
revoke delete on regioes, modelos_carregador, veiculos, formatos_franquia from authenticated;

-- ---------------------------------------------------------------- organizações e pessoas
alter table organizacoes enable row level security;
create policy org_leitura on organizacoes for select to authenticated using (
  (select private.eh_goodwe()) or id in (select private.minhas_orgs()));
create policy org_edicao on organizacoes for update to authenticated using (
  (select private.eh_goodwe_admin()) or id in (select private.minhas_orgs(true)));
revoke update on organizacoes from authenticated;
grant update (nome, razao_social) on organizacoes to authenticated;

alter table membros enable row level security;
create policy membros_leitura on membros for select to authenticated using (
  user_id = (select auth.uid()) or (select private.eh_goodwe())
  or organizacao_id in (select private.minhas_orgs(true)));
-- convites e mudança de papel: só por função (F4)

alter table motoristas enable row level security;
create policy motorista_leitura on motoristas for select to authenticated using (
  user_id = (select auth.uid()) or (select private.eh_goodwe()));
create policy motorista_cadastro on motoristas for insert to authenticated with check (user_id = (select auth.uid()));
create policy motorista_edicao on motoristas for update to authenticated using (user_id = (select auth.uid()));
revoke insert, update on motoristas from authenticated;
grant insert (user_id, nome, telefone, veiculo_id) on motoristas to authenticated;   -- rfid_uid e demo, não
grant update (nome, telefone, veiculo_id) on motoristas to authenticated;

-- ---------------------------------------------------------------- parâmetros e expansão
alter table parametros_rede enable row level security;
create policy parametros_leitura on parametros_rede for select to authenticated using (true);
-- nova versão: função atualizar_parametros (GoodWe admin)

alter table solicitacoes enable row level security;
create policy solicitacao_leitura on solicitacoes for select to authenticated using (
  solicitante_id = (select auth.uid()) or (select private.eh_goodwe()));
-- envio, reenvio e decisão: funções

-- ---------------------------------------------------------------- rede
alter table pontos enable row level security;
create policy ponto_leitura on pontos for select to authenticated using (
  (select private.eh_goodwe())
  or id in (select private.pontos_da_minha_org())
  or id in (select private.pontos_do_dispositivo()));
-- o mapa do motorista usa a função listar_pontos_mapa (só campos públicos)
create policy ponto_config on pontos for update to authenticated using (
  id in (select private.pontos_da_minha_org(true)) and status in ('PLANEJADO', 'INSTALACAO', 'ATIVO'));
revoke update on pontos from authenticated;
grant update (nome, endereco, lat, lng, tensao_fn_v, tensao_ff_v, fases, limite_corrente_a, carga_base_kw,
              tem_solar, potencia_fv_kwp, tem_bateria, capacidade_bateria_kwh, horario) on pontos to authenticated;
-- status: função mudar_status_ponto

alter table regras_tarifa enable row level security;
create policy tarifa_leitura on regras_tarifa for select to authenticated using (
  (select private.eh_goodwe())
  or ponto_id in (select private.pontos_da_minha_org())
  or ponto_id in (select private.pontos_do_dispositivo()));
-- nova versão: função atualizar_regra_tarifa

alter table carregadores enable row level security;
-- segurança mínima: estado das vagas de pontos ATIVOS é visível a qualquer logado (mapa e detalhe
-- do ponto escutam mudanças). Risco aceito e registrado: qr_token visível (ver 08-qualidade).
create policy vaga_leitura on carregadores for select to authenticated using (
  (select private.eh_goodwe())
  or ponto_id in (select private.pontos_da_minha_org())
  or ponto_id in (select private.pontos_do_dispositivo())
  or ponto_id in (select private.pontos_ativos()));
create policy vaga_config on carregadores for update to authenticated using (
  ponto_id in (select private.pontos_da_minha_org(true)));
revoke update on carregadores from authenticated;
grant update (apelido, numero_serie, ligacao) on carregadores to authenticated;
-- estado, limite e medição: agente, por função; manutenção: função definir_manutencao

-- ---------------------------------------------------------------- aparelhos
alter table dispositivos enable row level security;
create policy dispositivo_leitura on dispositivos for select to authenticated using (
  user_id = (select auth.uid()) or (select private.eh_goodwe())
  or ponto_id in (select private.pontos_da_minha_org()));

alter table codigos_pareamento enable row level security;
create policy pareamento_leitura on codigos_pareamento for select to authenticated using (
  ponto_id in (select private.pontos_da_minha_org(true)) or (select private.eh_goodwe()));

-- ---------------------------------------------------------------- operação
alter table sessoes enable row level security;
create policy sessao_leitura on sessoes for select to authenticated using (
  motorista_id = (select auth.uid())
  or (select private.eh_goodwe())
  or ponto_id in (select private.pontos_da_minha_org())
  or ponto_id in (select private.pontos_do_dispositivo()));

alter table telemetria enable row level security;
create policy telemetria_leitura on telemetria for select to authenticated using (
  (select private.eh_goodwe())
  or ponto_id in (select private.pontos_da_minha_org())
  or ponto_id in (select private.pontos_do_dispositivo())
  or sessao_id in (select s.id from public.sessoes s where s.motorista_id = (select auth.uid())));

alter table leituras_entrada enable row level security;
create policy entrada_leitura on leituras_entrada for select to authenticated using (
  (select private.eh_goodwe())
  or ponto_id in (select private.pontos_da_minha_org())
  or ponto_id in (select private.pontos_do_dispositivo()));

alter table comandos enable row level security;
create policy comando_leitura on comandos for select to authenticated using (
  (select private.eh_goodwe())
  or ponto_id in (select private.pontos_da_minha_org())
  or ponto_id in (select private.pontos_do_dispositivo()));

-- ---------------------------------------------------------------- financeiro (operador não vê)
alter table contas enable row level security;
create policy conta_leitura on contas for select to authenticated using (
  (select private.eh_goodwe()) or id in (select private.minhas_contas()));

alter table transacoes enable row level security;
create policy transacao_leitura on transacoes for select to authenticated using (
  (select private.eh_goodwe())
  or exists (select 1 from public.lancamentos l where l.transacao_id = transacoes.id
             and l.conta_id in (select private.minhas_contas())));

alter table lancamentos enable row level security;
create policy lancamento_leitura on lancamentos for select to authenticated using (
  (select private.eh_goodwe()) or conta_id in (select private.minhas_contas()));

alter view v_saldos set (security_invoker = true);

alter table cobrancas enable row level security;
create policy cobranca_leitura on cobrancas for select to authenticated using (
  motorista_id = (select auth.uid())
  or (select private.eh_goodwe())
  or ponto_id in (select private.pontos_da_minha_org(true)));

alter table pagamentos enable row level security;
create policy pagamento_leitura on pagamentos for select to authenticated using (
  pagador_id = (select auth.uid())
  or (select private.eh_goodwe())
  or sessao_id in (select s.id from public.sessoes s where s.ponto_id in (select private.pontos_do_dispositivo())));

alter table fechamentos enable row level security;
create policy fechamento_leitura on fechamentos for select to authenticated using (
  (select private.eh_goodwe()) or organizacao_id in (select private.minhas_orgs(true)));

-- ---------------------------------------------------------------- rastreio
alter table eventos enable row level security;
create policy evento_leitura on eventos for select to authenticated using (
  (select private.eh_goodwe()) or ponto_id in (select private.pontos_da_minha_org()));

alter table alertas enable row level security;
create policy alerta_leitura on alertas for select to authenticated using (
  (select private.eh_goodwe()) or ponto_id in (select private.pontos_da_minha_org()));

-- ---------------------------------------------------------------- views dos painéis
-- toda view criada em 03-funcoes.sql recebe security_invoker = true, para respeitar as políticas acima.

-- =============================================================================
-- Matriz resumida (L = lê pela política, F = escreve só por função, D = edita direto colunas liberadas)
--
-- tabela            GoodWe  Fr.admin  Fr.oper  Motorista      Totem   Agente
-- catálogos         L+D     L         L        L              L       L
-- organizacoes      L+D     L+D(sua)  L(sua)   -              -       -
-- motoristas        L       -         -        L+D(próprio)   -       -
-- solicitacoes      L+F     -         -        L+F(próprias)  -       -
-- pontos            L+F     L+D+F     L        mapa (função)  L       L
-- regras_tarifa     L       L+F       L        cotação (fn)   L       L
-- carregadores      L       L+D+F     L+F      L (ATIVO)      L       L+F
-- dispositivos      L+F     L+F       L        -              L       L
-- sessoes           L+F     L+F       L+F      L+F(próprias)  L+F     L+F
-- telemetria        L       L         L        L(próprias)    L       F
-- comandos          L+F     L+F       L+F      F (via sessão) F       L+F
-- contas/lanç.      L       L(recebível)-      L(carteira)    -       -
-- cobrancas         L       L         -        L(próprias)    -       -
-- pagamentos        L+F     -         -        L+F(próprios)  L+F     -
-- fechamentos       L+F     L         -        -              -       -
-- eventos/alertas   L       L         L        -              -       -
-- =============================================================================
