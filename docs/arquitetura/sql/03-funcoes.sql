-- =============================================================================
-- Ponto W · funções, gatilhos, views e tarefas · RASCUNHO DE DESENHO (v2, revisado)
--
-- As funções que mexem em dinheiro, estado de sessão ou concorrência estão
-- escritas por inteiro (são o coração do sistema e definem o contrato). As
-- demais estão com assinatura e comportamento em comentário; viram código na
-- fase indicada no plano. Contratos legíveis em ../03-contratos.md.
--
-- Funções públicas (chamadas por supabase.rpc) são SECURITY DEFINER com
-- search_path vazio e conferem a permissão no corpo. As permissões ficam no fim
-- do arquivo (anon não executa nada; algumas só service_role). Funções em
-- `private` não são expostas pela API; só as funções de papel usadas nas
-- políticas têm EXECUTE para authenticated. Erros usam SQLSTATE próprio 'PWnnn'.
--
-- Revisão de 19/10/2026: ver "Histórico da revisão" no fim do arquivo.
-- =============================================================================

-- ================================================================ CONTEXTO E EVENTOS
-- O contexto vale só dentro da transação (set_config(..., true)).
create or replace function private.definir_contexto(p_origem text, p_motivo text default null,
  p_correlacao uuid default null, p_ator_tipo text default null)
returns void language sql set search_path = '' as $$
  select set_config('pontow.origem', coalesce(p_origem, ''), true),
         set_config('pontow.motivo', coalesce(p_motivo, ''), true),
         set_config('pontow.correlacao', coalesce(p_correlacao::text, ''), true),
         set_config('pontow.ator_tipo', coalesce(p_ator_tipo, ''), true);
$$;

create or replace function private.registrar_evento(
  p_entidade text, p_entidade_id uuid, p_ponto uuid, p_tipo text, p_antes jsonb, p_depois jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_ator public.ator_evento;
  v_nome text;
begin
  if nullif(current_setting('pontow.ator_tipo', true), '') = 'GATEWAY' then
    v_ator := 'GATEWAY';
  elsif v_uid is null then
    v_ator := 'SISTEMA';
  elsif exists (select 1 from public.dispositivos d where d.user_id = v_uid) then
    v_ator := 'DISPOSITIVO';
    -- o agente simulador atende vários pontos: o nome é o do aparelho daquele ponto
    select d.nome into v_nome from public.dispositivos d
    where d.user_id = v_uid order by (d.ponto_id = p_ponto) desc nulls last limit 1;
  else
    v_ator := 'USUARIO';
    select coalesce(m.nome, u.email) into v_nome
      from auth.users u left join public.motoristas m on m.user_id = u.id where u.id = v_uid;
  end if;

  insert into public.eventos (ator_tipo, ator_id, ator_nome, origem, entidade, entidade_id, ponto_id,
                              tipo, antes, depois, motivo, correlacao_id)
  values (v_ator, v_uid, v_nome,
          coalesce(nullif(current_setting('pontow.origem', true), ''), 'desconhecida'),
          p_entidade, p_entidade_id, p_ponto, p_tipo, p_antes, p_depois,
          nullif(current_setting('pontow.motivo', true), ''),
          nullif(current_setting('pontow.correlacao', true), '')::uuid);
end $$;

-- Gatilho de sessões: só transições de estado viram evento (telemetria não).
create or replace function private.tg_evento_sessao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.registrar_evento('sessao', new.id, new.ponto_id, 'SESSAO_ABERTA', null,
      jsonb_build_object('vaga', new.carregador_id, 'origem', new.origem, 'tarifa_cotada', new.tarifa_cotada_kwh,
                         'reservada_para', new.reservada_para));
  elsif new.estado is distinct from old.estado then
    perform private.registrar_evento('sessao', new.id, new.ponto_id, 'SESSAO_' || new.estado,
      jsonb_build_object('estado', old.estado),
      jsonb_build_object('estado', new.estado, 'motorista', new.motorista_id, 'tarifa_kwh', new.tarifa_kwh,
                         'limite_valor', new.limite_valor, 'energia_kwh', new.energia_kwh,
                         'motivo_encerramento', new.motivo_encerramento, 'motivo_pausa', new.motivo_pausa));
  end if;
  return null;
end $$;
create trigger tg_evento_sessao after insert or update on sessoes for each row execute function private.tg_evento_sessao();

-- Os demais gatilhos seguem o mesmo molde (catálogo em 07-rastreio-e-gestao.md):
--   carregadores : estado → VAGA_<ESTADO>; limite_atual_a variou >= 2 A e não houve LIMITE_ALTERADO
--                  dessa vaga nos últimos 30 s → LIMITE_ALTERADO
--   pontos       : insert → PONTO_CRIADO; status → PONTO_<STATUS>; colunas de config → PONTO_CONFIG_ALTERADA (só o diff)
--   solicitacoes : insert → SOLICITACAO_ENVIADA; status → SOLICITACAO_<STATUS>
--   pagamentos   : status → PAGAMENTO_<STATUS>
--   cobrancas    : insert → COBRANCA_GERADA; status → COBRANCA_<STATUS>
--   regras_tarifa, parametros_rede : insert → TARIFA_NOVA_VERSAO / PARAMETROS_NOVA_VERSAO
--   dispositivos : insert → APARELHO_PAREADO; revogado_em preenchido → APARELHO_REVOGADO
--                  (ultimo_sinal NÃO gera evento)
--   membros      : insert → MEMBRO_ADICIONADO; papel/ativo → MEMBRO_ALTERADO
--   comandos     : insert → COMANDO_EMITIDO; status → COMANDO_<STATUS>
--   alertas      : insert → ALERTA_ABERTO; status → ALERTA_<STATUS>

-- ================================================================ REGRAS VIGENTES
create or replace function private.parametros_vigentes(p_ts timestamptz default now())
returns public.parametros_rede language sql stable security definer set search_path = '' as $$
  select * from public.parametros_rede where vigente_desde <= p_ts order by vigente_desde desc limit 1;
$$;

create or replace function private.regra_tarifa_vigente(p_ponto uuid, p_ts timestamptz default now())
returns public.regras_tarifa language sql stable security definer set search_path = '' as $$
  select * from public.regras_tarifa where ponto_id = p_ponto and vigente_desde <= p_ts
  order by vigente_desde desc limit 1;
$$;

create or replace function private.ocupacao_ponto(p_ponto uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select case when count(c.*) = 0 then 0
         else count(s.id)::numeric / count(c.*) end
  from public.carregadores c
  left join public.sessoes s on s.carregador_id = c.id and s.estado in ('AUTORIZADA','CARREGANDO','PAUSADA')
  where c.ponto_id = p_ponto and c.estado <> 'MANUTENCAO';
$$;

-- ================================================================ TARIFA (porte de engine/tarifa.ts)
-- Arredondamento: round() do Postgres (meio para longe do zero). A versão TS das prévias
-- calcula em centavos inteiros com a mesma regra (não usa toFixed), e um teste de
-- contrato compara as duas com docs/arquitetura/fixtures/tarifa.json.
create or replace function private.calcular_tarifa(p_ponto uuid, p_ts timestamptz default now(), p_ocupacao numeric default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_ponto public.pontos;
  v_regra public.regras_tarifa;
  v_par   public.parametros_rede;
  v_reg   public.regioes;
  v_hora  int;
  v_ocup  numeric;
  v_fh    numeric;
  v_fo    numeric := 1;
  v_fe    numeric := 1;
  v_faixa jsonb;
begin
  select * into v_ponto from public.pontos where id = p_ponto;
  v_regra := private.regra_tarifa_vigente(p_ponto, p_ts);
  v_par   := private.parametros_vigentes(p_ts);
  select * into v_reg from public.regioes where id = v_ponto.regiao_id;
  if v_regra.id is null then
    raise exception 'PW020: ponto sem tarifa vigente' using errcode = 'PW020';
  end if;

  v_hora := extract(hour from p_ts at time zone 'America/Sao_Paulo')::int;
  v_fh   := v_regra.fatores_hora[v_hora + 1];
  v_ocup := coalesce(p_ocupacao, private.ocupacao_ponto(p_ponto));

  -- primeira faixa que casa, na ordem gravada (igual a fatorOcupacao)
  for v_faixa in select value from jsonb_array_elements(v_regra.fatores_ocupacao) loop
    if (v_faixa ? 'min' and v_ocup >= (v_faixa->>'min')::numeric)
       or (v_faixa ? 'max' and v_ocup <= (v_faixa->>'max')::numeric) then
      v_fo := (v_faixa->>'fator')::numeric;
      exit;
    end if;
  end loop;

  if v_regra.usar_fator_energia then
    v_fe := round(1 + (v_reg.custo_energia_kwh / v_par.custo_energia_referencia - 1) * v_par.amortecimento_energia, 3);
  end if;

  return jsonb_build_object(
    'tarifa_kwh',        round(v_regra.preco_base_kwh * v_fh * v_fo * v_fe, 2),
    'preco_base_kwh',    v_regra.preco_base_kwh,
    'fator_hora',        v_fh,
    'fator_ocupacao',    v_fo,
    'fator_energia',     v_fe,
    'custo_energia_kwh', v_reg.custo_energia_kwh,
    'regra_tarifa_id',   v_regra.id,
    'parametros_id',     v_par.id,
    'calculado_em',      p_ts);
end $$;

-- Repartição sobre o BRUTO (06-pagamento-e-livro-caixa.md). O resto vai para o comércio.
create or replace function private.repartir(p_bruto numeric, p_par public.parametros_rede,
  out royalty numeric, out fundo numeric, out processamento numeric, out liquido numeric)
language plpgsql immutable set search_path = '' as $$
begin
  royalty       := round(p_bruto * p_par.royalty_pct, 2);
  fundo         := round(p_bruto * p_par.fundo_pct, 2);
  processamento := round(p_bruto * p_par.processamento_pct, 2);
  liquido       := p_bruto - royalty - fundo - processamento;
end $$;

-- ================================================================ LIVRO-CAIXA: utilitários
create or replace function private.conta_global(p_tipo public.tipo_conta)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.contas where tipo = p_tipo and motorista_id is null and ponto_id is null and sessao_id is null;
$$;

create or replace function private.conta_recebivel(p_ponto uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v uuid;
begin
  select id into v from public.contas where tipo = 'RECEBIVEL_PONTO' and ponto_id = p_ponto;
  if v is null then
    raise exception 'PW902: ponto sem conta de recebível' using errcode = 'PW902';
  end if;
  return v;
end $$;

-- A carteira nasce com o motorista (gatilho abaixo); esta função é só a busca.
create or replace function private.conta_carteira(p_motorista uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.contas where tipo = 'CARTEIRA' and motorista_id = p_motorista;
$$;

create or replace function private.tg_criar_carteira() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.contas (tipo, motorista_id) values ('CARTEIRA', new.user_id) on conflict do nothing;
  return null;
end $$;
create trigger tg_criar_carteira after insert on motoristas for each row execute function private.tg_criar_carteira();

create or replace function private.saldo(p_conta uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(valor), 0) from public.lancamentos where conta_id = p_conta;
$$;

-- saldo − limites das sessões em aberto pagas por essa conta (invariante 6)
create or replace function private.saldo_disponivel(p_conta uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select private.saldo(p_conta) - coalesce((
    select sum(limite_valor) from public.sessoes
    where conta_id = p_conta and estado in ('AUTORIZADA','CARREGANDO','PAUSADA')), 0);
$$;

-- lançamento de uma transação inteira; ignora itens de valor zero
create or replace function private.lancar(p_tipo public.tipo_transacao, p_ref_tipo text, p_ref uuid,
  p_descricao text, p_itens jsonb, p_estorno_de uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_tx uuid; v_item jsonb;
begin
  insert into public.transacoes (tipo, referencia_tipo, referencia_id, descricao, estorno_de, criada_por)
  values (p_tipo, p_ref_tipo, p_ref, p_descricao, p_estorno_de, auth.uid()) returning id into v_tx;
  for v_item in select value from jsonb_array_elements(p_itens) loop
    if (v_item->>'conta') is null then
      raise exception 'PW903: lançamento sem conta' using errcode = 'PW903';
    end if;
    if (v_item->>'valor')::numeric <> 0 then
      insert into public.lancamentos (transacao_id, conta_id, valor)
      values (v_tx, (v_item->>'conta')::uuid, (v_item->>'valor')::numeric);
    end if;
  end loop;
  return v_tx;   -- a soma zero é conferida no commit (gatilho adiado, SECURITY DEFINER)
end $$;

-- ================================================================ COMANDOS
create or replace function private.emitir_comando(p_ponto uuid, p_vaga uuid, p_sessao uuid,
  p_tipo public.tipo_comando, p_param jsonb default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid; v_seg int := (private.parametros_vigentes()).segundos_comando;
begin
  insert into public.comandos (ponto_id, carregador_id, sessao_id, tipo, parametros, criado_por, expira_em)
  values (p_ponto, p_vaga, p_sessao, p_tipo, p_param, auth.uid(), now() + make_interval(secs => v_seg))
  returning id into v;
  return v;
end $$;

-- O agente busca e marca ENTREGUE. O Realtime só avisa que há algo novo; esta função
-- também serve de varredura periódica se o aviso se perder.
create or replace function public.receber_comandos()
returns setof public.comandos language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.comandos c set status = 'ENTREGUE', entregue_em = now()
  where c.status = 'PENDENTE' and c.expira_em > now()
    and c.ponto_id in (select private.pontos_do_agente())
  returning c.*;
end $$;

create or replace function public.confirmar_comando(p_comando uuid, p_sucesso boolean, p_erro text default null)
returns public.comandos language plpgsql security definer set search_path = '' as $$
declare v_c public.comandos;
begin
  select * into v_c from public.comandos where id = p_comando for update;
  if not found or v_c.ponto_id not in (select private.pontos_do_agente()) then
    raise exception 'PW007: sem permissão' using errcode = 'PW007';
  end if;
  -- idempotente; um comando vencido não muda nada (o agente desfaz a ação se tiver executado)
  if v_c.status in ('EXECUTADO', 'FALHOU', 'EXPIRADO') then return v_c; end if;

  perform private.definir_contexto('agente', p_erro, v_c.sessao_id);
  update public.comandos
     set status = (case when p_sucesso then 'EXECUTADO' else 'FALHOU' end)::public.status_comando,
         concluido_em = now(), erro = p_erro
   where id = p_comando returning * into v_c;

  if v_c.tipo = 'INICIAR' and p_sucesso then
    -- sessão CARREGANDO = vaga liberada; se o carro puxa corrente, a vaga diz (CARREGANDO ou SUSPENSO_EV)
    update public.sessoes set estado = 'CARREGANDO', inicio_carga = now()
     where id = v_c.sessao_id and estado = 'AUTORIZADA';
  elsif v_c.tipo = 'INICIAR' then
    update public.sessoes set estado = 'CANCELADA', motivo_encerramento = 'FALHA', encerrada_em = now()
     where id = v_c.sessao_id and estado = 'AUTORIZADA';
    update public.carregadores set sessao_atual_id = null
     where id = v_c.carregador_id and sessao_atual_id = v_c.sessao_id;
    -- visitante já pagou: devolução integral (private.devolver_sobra_visitante)                [F3]
  end if;

  if not p_sucesso then
    insert into public.alertas (tipo, chave, severidade, ponto_id, carregador_id, sessao_id, mensagem)
    values ('COMANDO_FALHOU', 'COMANDO_FALHOU:' || v_c.id, 'ATENCAO', v_c.ponto_id, v_c.carregador_id, v_c.sessao_id,
            coalesce(p_erro, 'o agente não executou o comando ' || v_c.tipo))
    on conflict do nothing;
  end if;
  return v_c;
end $$;

-- ================================================================ SESSÃO: abrir (agente)
create or replace function private.gerar_codigo_vinculo()
returns char(4) language plpgsql volatile set search_path = '' as $$
declare
  v_alfabeto constant text := 'ACDEFHJKMNPRTUVWXY3479';
  v_cod text := '';
begin
  for i in 1..4 loop
    v_cod := v_cod || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
  end loop;
  return v_cod;   -- a unicidade é garantida pelo índice; abrir_sessao tenta de novo se colidir
end $$;

create or replace function public.abrir_sessao(p_carregador uuid, p_conexao uuid)
returns public.sessoes language plpgsql security definer set search_path = '' as $$
declare
  v_vaga     public.carregadores;
  v_sessao   public.sessoes;
  v_cot      jsonb;
  v_id       uuid := gen_random_uuid();
  v_min      int := (private.parametros_vigentes()).minutos_expira_sessao;
  v_demo     boolean;
  v_reserva  uuid;
  v_restricao text;
begin
  -- idempotente: o agente pode repetir a chamada depois de cair a conexão
  select * into v_sessao from public.sessoes where conexao_id = p_conexao;
  if found then return v_sessao; end if;

  select * into v_vaga from public.carregadores where id = p_carregador for update;
  if not found or v_vaga.ponto_id not in (select private.pontos_do_agente()) then
    raise exception 'PW007: sem permissão' using errcode = 'PW007';
  end if;
  if v_vaga.estado in ('MANUTENCAO', 'FALHA') then
    raise exception 'PW005: vaga indisponível (%)', v_vaga.estado using errcode = 'PW005';
  end if;
  select p.demo into v_demo from public.pontos p where p.id = v_vaga.ponto_id and p.status = 'ATIVO';
  if not found then
    raise exception 'PW005: ponto indisponível' using errcode = 'PW005';
  end if;

  v_cot := private.calcular_tarifa(v_vaga.ponto_id);
  -- reserva vale pela pessoa e pelo prazo, não pelo estado da vaga (que o agente reescreve)
  if v_vaga.reservado_para is not null and v_vaga.reservado_ate > now() then
    v_reserva := v_vaga.reservado_para;
  end if;
  perform private.definir_contexto('agente', 'cabo conectado', v_id);   -- correlação = id da sessão

  for tentativa in 1..5 loop
    begin
      insert into public.sessoes (id, ponto_id, carregador_id, origem, estado, conexao_id, codigo_vinculo,
                                  expira_em, tarifa_cotada_kwh, reservada_para, demo)
      values (v_id, v_vaga.ponto_id, v_vaga.id,
              (case when v_reserva is null then 'TOTEM' else 'APP' end)::public.origem_sessao,
              'ABERTA', p_conexao, private.gerar_codigo_vinculo(),
              now() + make_interval(mins => v_min), (v_cot->>'tarifa_kwh')::numeric, v_reserva, v_demo)
      returning * into v_sessao;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_restricao = constraint_name;
      if v_restricao = 'uq_codigo_vinculo' then
        continue;                                       -- código colidiu: sorteia outro
      elsif v_restricao = 'sessoes_conexao_id_key' then
        select * into v_sessao from public.sessoes where conexao_id = p_conexao;   -- chamada concorrente
        return v_sessao;
      else
        raise exception 'PW001: vaga já tem sessão em aberto' using errcode = 'PW001';
      end if;
    end;
  end loop;
  if v_sessao.id is null then
    raise exception 'PW006: não foi possível gerar o código de vínculo' using errcode = 'PW006';
  end if;

  update public.carregadores set estado = 'CONECTADO', sessao_atual_id = v_sessao.id where id = v_vaga.id;
  -- vaga reservada: o app de quem reservou recebe a sessão (Realtime) e confirma com confirmar_reserva.
  -- Nunca autoriza sozinha: quem conectou pode não ser quem reservou.
  return v_sessao;
end $$;

-- ================================================================ SESSÃO: prévia e vínculo (motorista)
-- Fonte da tela /motorista/vincular?c=XXXX e do p_tarifa_vista.
create or replace function public.previa_vinculo(p_codigo text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_s public.sessoes; v_cot jsonb; v_conta uuid;
  v_par public.parametros_rede := private.parametros_vigentes();
begin
  select * into v_s from public.sessoes where codigo_vinculo = upper(trim(p_codigo)) and estado = 'ABERTA';
  if not found then
    raise exception 'PW002: código inválido ou já usado' using errcode = 'PW002';
  end if;
  if v_s.expira_em < now() then
    raise exception 'PW003: código expirado; desconecte e conecte o cabo de novo' using errcode = 'PW003';
  end if;
  if v_s.reservada_para is not null and v_s.reservada_para is distinct from auth.uid() then
    raise exception 'PW001: vaga reservada por outra pessoa' using errcode = 'PW001';
  end if;
  v_cot := private.calcular_tarifa(v_s.ponto_id);
  v_conta := private.conta_carteira(auth.uid());
  return jsonb_build_object(
    'sessao',           v_s.codigo,
    'ponto',            (select jsonb_build_object('id', p.id, 'nome', p.nome, 'endereco', p.endereco)
                           from public.pontos p where p.id = v_s.ponto_id),
    'vaga',             (select jsonb_build_object('numero', c.numero, 'apelido', c.apelido, 'modelo', c.modelo_id)
                           from public.carregadores c where c.id = v_s.carregador_id),
    'tarifa_kwh',       (v_cot->>'tarifa_kwh')::numeric,
    'composicao',       v_cot,
    'expira_em',        v_s.expira_em,
    'saldo_disponivel', case when v_conta is null then 0 else private.saldo_disponivel(v_conta) end,
    'saldo_minimo',     v_par.saldo_minimo);
end $$;

-- Núcleo de vincular_sessao e confirmar_reserva (motorista com app). O visitante tem caminho
-- próprio (autorizar_visitante), porque não tem cadastro, carteira própria nem saldo mínimo.
create or replace function private.autorizar_sessao(p_sessao uuid, p_motorista uuid, p_veiculo text,
  p_soc smallint, p_limite numeric, p_canal text)
returns public.sessoes language plpgsql security definer set search_path = '' as $$
declare
  v_s public.sessoes; v_m public.motoristas; v_r public.regras_tarifa; v_conta uuid;
  v_disp numeric; v_cot jsonb;
  v_par public.parametros_rede := private.parametros_vigentes();
begin
  if p_limite is not null and p_limite <= 0 then
    raise exception 'PW015: o limite de valor precisa ser maior que zero' using errcode = 'PW015';
  end if;
  select * into v_m from public.motoristas where user_id = p_motorista;
  if not found then raise exception 'PW010: cadastro de motorista necessário' using errcode = 'PW010'; end if;

  v_conta := private.conta_carteira(p_motorista);
  -- trava a carteira: duas autorizações simultâneas não reservam o mesmo saldo (invariante 6)
  perform 1 from public.contas where id = v_conta for update;
  if private.saldo(v_conta) < 0 then
    raise exception 'PW011: há uma recarga pendente de pagamento' using errcode = 'PW011';
  end if;
  v_disp := private.saldo_disponivel(v_conta);
  if v_disp < v_par.saldo_minimo then
    raise exception 'PW004: saldo insuficiente; mínimo de R$ %', v_par.saldo_minimo using errcode = 'PW004';
  end if;

  select * into v_s from public.sessoes where id = p_sessao for update;
  v_cot := private.calcular_tarifa(v_s.ponto_id);
  select * into v_r from public.regras_tarifa where id = (v_cot->>'regra_tarifa_id')::uuid;
  perform private.definir_contexto(p_canal, null, v_s.id);

  update public.sessoes set
    estado = 'AUTORIZADA', motorista_id = p_motorista, conta_id = v_conta,
    veiculo_id = coalesce(p_veiculo, v_m.veiculo_id), soc_inicial_informado = p_soc,
    limite_valor = least(v_disp, coalesce(p_limite, v_disp)),        -- sempre > 0 e <= disponível
    tarifa_kwh = (v_cot->>'tarifa_kwh')::numeric,
    regra_tarifa_id = v_r.id, parametros_id = (v_cot->>'parametros_id')::uuid,
    autorizada_em = now(), codigo_vinculo = null, expira_em = null, reservada_para = null
  where id = p_sessao returning * into v_s;

  update public.carregadores set reservado_para = null, reservado_ate = null where id = v_s.carregador_id;
  -- o agente recebe tudo o que precisa para estimar o custo e parar no limite
  perform private.emitir_comando(v_s.ponto_id, v_s.carregador_id, v_s.id, 'INICIAR', jsonb_build_object(
    'limite_valor', v_s.limite_valor, 'tarifa_kwh', v_s.tarifa_kwh,
    'taxa_sessao', v_r.taxa_sessao, 'preco_minuto', v_r.preco_minuto,
    'tolerancia_ocioso_min', v_r.tolerancia_ocioso_min, 'preco_minuto_ocioso', v_r.preco_minuto_ocioso,
    'valor_minimo', v_r.valor_minimo));
  return v_s;
end $$;

-- p_tarifa_vista: o preço que a tela de confirmação mostrou (previa_vinculo). Se mudou, a tela recota.
create or replace function public.vincular_sessao(p_codigo text, p_tarifa_vista numeric,
  p_veiculo text default null, p_soc smallint default null, p_limite numeric default null)
returns public.sessoes language plpgsql security definer set search_path = '' as $$
declare v_s public.sessoes; v_atual numeric;
begin
  select * into v_s from public.sessoes
  where codigo_vinculo = upper(trim(p_codigo)) and estado = 'ABERTA'
  for update skip locked;                         -- dois celulares no mesmo QR: o segundo recebe PW002
  if not found then
    raise exception 'PW002: código inválido ou já usado' using errcode = 'PW002';
  end if;
  if v_s.expira_em < now() then
    raise exception 'PW003: código expirado; desconecte e conecte o cabo de novo' using errcode = 'PW003';
  end if;
  if not exists (select 1 from public.pontos where id = v_s.ponto_id and status = 'ATIVO') then
    raise exception 'PW005: ponto indisponível' using errcode = 'PW005';
  end if;
  if v_s.reservada_para is not null and v_s.reservada_para is distinct from auth.uid() then
    raise exception 'PW001: vaga reservada por outra pessoa' using errcode = 'PW001';
  end if;
  v_atual := (private.calcular_tarifa(v_s.ponto_id)->>'tarifa_kwh')::numeric;
  if v_atual is distinct from p_tarifa_vista then                -- inclui p_tarifa_vista nulo
    raise exception 'PW012: o preço mudou para R$ %; confirme de novo', v_atual using errcode = 'PW012';
  end if;
  return private.autorizar_sessao(v_s.id, auth.uid(), p_veiculo, p_soc, p_limite, 'app');
end $$;

-- Quem reservou confirma pelo app quando o cabo for conectado na vaga reservada.
create or replace function public.confirmar_reserva(p_sessao uuid, p_tarifa_vista numeric,
  p_soc smallint default null, p_limite numeric default null)
returns public.sessoes language plpgsql security definer set search_path = '' as $$
declare v_s public.sessoes; v_atual numeric;
begin
  select * into v_s from public.sessoes
  where id = p_sessao and estado = 'ABERTA' and reservada_para = auth.uid() for update;
  if not found then raise exception 'PW002: reserva não encontrada' using errcode = 'PW002'; end if;
  v_atual := (private.calcular_tarifa(v_s.ponto_id)->>'tarifa_kwh')::numeric;
  if v_atual is distinct from p_tarifa_vista then
    raise exception 'PW012: o preço mudou para R$ %; confirme de novo', v_atual using errcode = 'PW012';
  end if;
  return private.autorizar_sessao(v_s.id, auth.uid(), null, p_soc, p_limite, 'app');
end $$;

-- ================================================================ SESSÃO: encerrar
-- Núcleo único: usado pelo agente (registrar_fim_carga) e pelo suporte (suporte_encerrar_sessao).
-- p_minutos_ociosos chega BRUTO (desde que o carro parou de puxar); só aqui se desconta a tolerância.
create or replace function private.encerrar_sessao(p_sessao uuid, p_energia_kwh numeric,
  p_minutos_carga integer, p_minutos_ociosos integer, p_motivo public.motivo_encerramento,
  p_fim timestamptz, p_canal text, p_observacao text default null)
returns public.cobrancas language plpgsql security definer set search_path = '' as $$
declare
  v_s public.sessoes; v_c public.cobrancas; v_r public.regras_tarifa; v_par public.parametros_rede;
  v_reg public.regioes; v_rep record; v_tx uuid;
  v_energia numeric; v_taxa numeric; v_tempo numeric; v_ocioso numeric; v_bruto numeric;
  v_excesso numeric; v_corte numeric;
begin
  select * into v_s from public.sessoes where id = p_sessao for update;
  if not found then raise exception 'PW006: sessão não encontrada' using errcode = 'PW006'; end if;
  -- idempotente: repetir devolve a mesma cobrança
  if v_s.estado in ('ENCERRADA', 'PAGA', 'PENDENTE') then
    select * into v_c from public.cobrancas where sessao_id = v_s.id;
    return v_c;
  end if;
  if v_s.estado not in ('AUTORIZADA', 'CARREGANDO', 'PAUSADA') then
    raise exception 'PW006: transição inválida (%)', v_s.estado using errcode = 'PW006';
  end if;
  if p_energia_kwh < 0 or p_minutos_carga < 0 or p_minutos_ociosos < 0 then
    raise exception 'PW006: medição inválida' using errcode = 'PW006';
  end if;

  perform private.definir_contexto(p_canal, coalesce(p_observacao, p_motivo::text), v_s.id);
  select * into v_r from public.regras_tarifa where id = v_s.regra_tarifa_id;
  select * into v_par from public.parametros_rede where id = v_s.parametros_id;
  select r.* into v_reg from public.regioes r join public.pontos p on p.regiao_id = r.id where p.id = v_s.ponto_id;

  v_energia := round(p_energia_kwh * v_s.tarifa_kwh, 2);
  v_taxa    := case when p_energia_kwh > 0 then v_r.taxa_sessao else 0 end;
  v_tempo   := round(p_minutos_carga * v_r.preco_minuto, 2);
  v_ocioso  := round(greatest(0, p_minutos_ociosos - v_r.tolerancia_ocioso_min) * v_r.preco_minuto_ocioso, 2);
  if p_energia_kwh > 0 and v_energia + v_taxa + v_tempo + v_ocioso < v_r.valor_minimo then
    v_taxa := v_taxa + (v_r.valor_minimo - (v_energia + v_taxa + v_tempo + v_ocioso));   -- mínimo vira taxa
  end if;

  -- Teto: energia, taxa e tempo nunca passam do limite autorizado. O agente para no limite; o atraso
  -- de um ciclo fica por conta da rede. Corta-se primeiro a energia, depois o tempo, depois a taxa.
  v_excesso := (v_energia + v_taxa + v_tempo) - v_s.limite_valor;
  if v_excesso > 0 then
    v_corte := least(v_excesso, v_energia); v_energia := v_energia - v_corte; v_excesso := v_excesso - v_corte;
    v_corte := least(v_excesso, v_tempo);   v_tempo   := v_tempo - v_corte;   v_excesso := v_excesso - v_corte;
    v_taxa  := v_taxa - least(v_excesso, v_taxa);
  end if;
  -- A ociosidade pode passar do limite no app (a carteira fica negativa = PENDENTE); no visitante, não.
  if v_s.origem = 'VISITANTE' then
    v_ocioso := least(v_ocioso, greatest(0, v_s.limite_valor - (v_energia + v_taxa + v_tempo)));
  end if;
  v_bruto := v_energia + v_taxa + v_tempo + v_ocioso;

  update public.sessoes set estado = 'ENCERRADA', energia_kwh = p_energia_kwh, minutos_ociosos = p_minutos_ociosos,
         fim_carga = coalesce(p_fim, now()), encerrada_em = now(), motivo_encerramento = p_motivo,
         potencia_atual_kw = 0, custo_estimado = v_bruto
  where id = v_s.id;
  update public.carregadores set sessao_atual_id = null, energia_total_kwh = energia_total_kwh + p_energia_kwh
  where id = v_s.carregador_id and sessao_atual_id = v_s.id;

  if v_bruto = 0 then                                   -- não carregou nada: sem cobrança
    -- visitante: devolução integral (private.devolver_sobra_visitante)                          [F3]
    update public.sessoes set estado = 'PAGA' where id = v_s.id;
    return null;
  end if;

  select * into v_rep from private.repartir(v_bruto, v_par);
  v_tx := private.lancar('RECARGA_VEICULO', 'sessao', v_s.id, 'Recarga ' || v_s.codigo, jsonb_build_array(
    jsonb_build_object('conta', v_s.conta_id,                             'valor', -v_bruto),
    jsonb_build_object('conta', private.conta_recebivel(v_s.ponto_id),    'valor', v_rep.liquido),
    jsonb_build_object('conta', private.conta_global('ROYALTIES'),        'valor', v_rep.royalty),
    jsonb_build_object('conta', private.conta_global('FUNDO_MARKETING'),  'valor', v_rep.fundo),
    jsonb_build_object('conta', private.conta_global('TARIFAS'),          'valor', v_rep.processamento)));

  insert into public.cobrancas (sessao_id, ponto_id, motorista_id, energia_kwh, tarifa_kwh,
    valor_energia, valor_sessao, valor_tempo, valor_ocioso, valor_bruto,
    royalty, fundo, processamento, liquido_comercio, custo_energia_estimado,
    regra_tarifa_id, parametros_id, status, transacao_id, demo)
  values (v_s.id, v_s.ponto_id, v_s.motorista_id, p_energia_kwh, v_s.tarifa_kwh,
    v_energia, v_taxa, v_tempo, v_ocioso, v_bruto,
    v_rep.royalty, v_rep.fundo, v_rep.processamento, v_rep.liquido,
    round(p_energia_kwh * v_reg.custo_energia_kwh, 2),
    v_r.id, v_par.id,
    (case when private.saldo(v_s.conta_id) >= 0 then 'PAGA' else 'PENDENTE' end)::public.status_cobranca,
    v_tx, v_s.demo)
  returning * into v_c;

  -- visitante: devolve o que sobrou do Pix (private.devolver_sobra_visitante)                    [F3]
  update public.sessoes set estado = (case when v_c.status = 'PAGA' then 'PAGA' else 'PENDENTE' end)::public.estado_sessao
  where id = v_s.id;
  return v_c;
end $$;

-- Agente: fim da carga. p_fim = hora real do fim (importa quando o aviso sai da fila offline).
create or replace function public.registrar_fim_carga(p_sessao uuid, p_energia_kwh numeric,
  p_minutos_carga integer, p_minutos_ociosos integer, p_motivo public.motivo_encerramento,
  p_fim timestamptz default null)
returns public.cobrancas language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.sessoes s
                 where s.id = p_sessao and s.ponto_id in (select private.pontos_do_agente())) then
    raise exception 'PW007: sem permissão' using errcode = 'PW007';
  end if;
  return private.encerrar_sessao(p_sessao, p_energia_kwh, p_minutos_carga, p_minutos_ociosos, p_motivo, p_fim, 'agente');
end $$;

-- Suporte (GoodWe): encerra pelo banco com a última medição gravada, quando o agente não responde
-- a um PARAR. O ideal é sempre tentar solicitar_encerramento antes.
create or replace function public.suporte_encerrar_sessao(p_sessao uuid, p_observacao text)
returns public.cobrancas language plpgsql security definer set search_path = '' as $$
declare v_s public.sessoes;
begin
  if not (select private.eh_goodwe()) then
    raise exception 'PW007: sem permissão' using errcode = 'PW007';
  end if;
  if coalesce(trim(p_observacao), '') = '' then
    raise exception 'PW016: informe o motivo' using errcode = 'PW016';
  end if;
  select * into v_s from public.sessoes where id = p_sessao;
  if not found then raise exception 'PW006: sessão não encontrada' using errcode = 'PW006'; end if;
  return private.encerrar_sessao(p_sessao, v_s.energia_kwh,
    coalesce(extract(epoch from now() - v_s.inicio_carga)::int / 60, 0), v_s.minutos_ociosos,
    'SUPORTE', now(), 'painel', p_observacao);
end $$;

-- ================================================================ DEMAIS FUNÇÕES (assinatura + comportamento)
-- meu_perfil() returns jsonb                                                          [F0]
--   {user_id, papeis[], organizacoes[{id,nome,tipo,papel}], pontos[{id,codigo,nome}],
--    motorista{...}|null, dispositivo{tipo, pontos[]}|null}
--
-- enviar_solicitacao(dados jsonb) returns solicitacoes                               [F1]
--   valida; score := private.score_viabilidade(dados): porte de analisarViabilidade com a
--   potência EFETIVA do modelo do formato na rede da região (127/220 V × 220/380 V, ver 04-agente),
--   carregadores × potência efetiva + 8 kW; versao_modelo = 'viabilidade-v2'.
-- reenviar_solicitacao(id, dados jsonb)                                               [F1]
-- decidir_solicitacao(id uuid, decisao status_solicitacao, motivo text) returns jsonb [F1]
--   GoodWe admin. APROVADO: cria/usa organização FRANQUEADO, membro ADMIN = solicitante,
--   ponto PLANEJADO, vagas do formato (estado OFFLINE), regra de tarifa padrão e a conta
--   RECEBIVEL_PONTO (obrigatória: encerrar_sessao falha com PW902 sem ela).
-- mudar_status_ponto(ponto uuid, novo status_ponto, motivo text)                     [F1]
-- checklist_ativacao(ponto uuid) returns jsonb [{item, ok, detalhe}]                  [F1]
-- gerar_codigo_pareamento(ponto uuid, tipo tipo_dispositivo) returns jsonb            [F1]
-- public.consumir_codigo_pareamento(codigo, user_id, nome) returns dispositivos       [F1]
--   SÓ service_role (Edge Function parear-dispositivo). Fica em public porque o PostgREST
--   só expõe public; o grant restrito é o que protege.
-- dispositivo_sinal(versao text) returns jsonb                                        [F1]
--   QUALQUER aparelho (totem e agente): atualiza dispositivos.ultimo_sinal (tabela fora da
--   publicação de tempo real); resolve alerta APARELHO_OFFLINE. Agente: devolve a config das
--   vagas (modelo, ligação, limites, driver); vaga OFFLINE volta a DISPONIVEL.
-- definir_manutencao(vaga uuid, ligar boolean, motivo text)                           [F1]
-- listar_pontos_mapa() returns table(...)  -- só ATIVO, só campos públicos            [F1]
-- cotar_preco(vaga uuid) returns jsonb  (calcular_tarifa + vagas livres)              [F1]
-- atualizar_regra_tarifa(ponto uuid, regra jsonb, vigente_desde timestamptz)          [F1]
-- atualizar_parametros(dados jsonb, vigente_desde timestamptz)                        [F4]
--
-- agente_atualizar_vagas(estados jsonb)                                               [F2]
--   lote [{vaga, estado, limite_atual_a, motivo_pausa}], só o que mudou (nunca potência a cada
--   ciclo: carregadores está na publicação de tempo real); PAUSADA/CARREGANDO refletidas na sessão.
-- registrar_medicao(amostras jsonb, entrada jsonb)                                    [F2]
--   a cada 30 s: telemetria + sessão (energia, potência, custo_estimado, minutos_ociosos brutos);
--   a cada 5 min: leituras_entrada. Não gera evento.
-- registrar_desconexao(vaga uuid, conexao uuid)                                       [F2]
--   ABERTA → EXPIRADA; AUTORIZADA → CANCELADA (visitante: devolução integral); FINALIZADO → DISPONIVEL.
-- sim_comando(ponto uuid, tipo tipo_comando, parametros jsonb) returns uuid           [F2]
-- sim_autorizar_demo(sessao uuid) returns sessoes                                     [F2]
--   agente simulador, só ponto demo: sorteia um motorista de um conjunto de demonstração e autoriza
--   com limite fixo (parâmetro, ex.: R$ 60); uma tarefa diária repõe o saldo dessas carteiras.
--
-- reservar_vaga(qr_token text) returns jsonb                                          [F3]
--   confere saldo (PW004/PW011) já aqui; grava reservado_para/reservado_ate (5 min).
-- iniciar_visitante(vaga uuid, valor numeric) returns jsonb {sessao_id, conta_id}     [F3]
--   totem; sessão ABERTA na vaga: origem VISITANTE, codigo_vinculo = null (ninguém mais vincula),
--   expira_em = validade do Pix; cria a conta CARTEIRA da sessão. NÃO cria pagamento: quem cria
--   é a Edge Function pagamento-criar (lugar único).
-- private.autorizar_visitante(sessao, conta, valor)                                   [F3]
--   chamada por confirmar_pagamento: limite = valor; trava tarifa; INICIAR com os parâmetros da regra.
-- private.devolver_sobra_visitante(sessao)                                            [F3]
--   saldo da carteira do visitante > 0 → lancar('DEVOLUCAO_SOBRA', CARTEIRA −sobra, EXTERNO +sobra);
--   pagamentos.valor_estornado += sobra (simulado: na hora; gateway real: tarefa de estornos).
-- solicitar_encerramento(sessao uuid, origem text) returns uuid (comando PARAR)      [F3]
--   motorista dono, totem do ponto, franqueado (admin/operador) ou GoodWe suporte.
-- sessao_totem(vaga uuid) returns jsonb                                               [F3]
--   totem: primeiro nome do motorista, números da sessão e resumo da cobrança (recibo), sem
--   abrir as tabelas motoristas e cobrancas para o aparelho.
-- public.confirmar_pagamento(provedor text, id_externo text, status text, payload jsonb) [F3]
--   SÓ service_role (Edge Function pagamento-webhook). Idempotente. PAGO:
--     RECARGA_CARTEIRA → lancar(EXTERNO −v, CARTEIRA +v); se o saldo ficou >= 0, sessões e
--       cobranças PENDENTE dessa carteira viram PAGA e o alerta SESSAO_PENDENTE é resolvido;
--     VISITANTE → lancar(EXTERNO −v, CARTEIRA(visitante) +v); se a sessão ainda está ABERTA,
--       autorizar_visitante; se não (expirou, cabo saiu), devolução integral.
--   Taxa do gateway informada → lancar TARIFA_GATEWAY (TARIFAS −taxa, EXTERNO +taxa).
--   Grava pontow.ator_tipo = 'GATEWAY' no contexto.
--
-- estornar_cobranca(cobranca uuid, valor numeric, motivo text) returns uuid           [F4]
-- assumir_alerta(id uuid) / resolver_alerta(id uuid, resolucao text)                  [F2]
-- fechar_mes(competencia date)                                                        [F4]
--   idempotente: ponto com fechamento da competência já FECHADO/QUITADO é pulado. Soma as
--   cobranças da competência (fuso America/Sao_Paulo), grava FECHADO e lança MENSALIDADE.
-- quitar_fechamento(id uuid)                                                          [F4]
--   REPASSE de (fechamento.liquido − fechamento.mensalidade), o valor DAQUELE mês, nunca o saldo
--   atual do recebível. Se der negativo, não repassa: o saldo negativo abate no próximo mês.
-- linha_do_tempo(entidade text, id uuid) returns setof eventos (security invoker)    [F1]
-- buscar_suporte(termo text) returns jsonb                                            [F4]

-- ================================================================ VIEWS DOS PAINÉIS (security_invoker)
-- Mês e dia no fuso America/Sao_Paulo.
create view v_kpis_ponto_mes with (security_invoker = true) as
select c.ponto_id,
       date_trunc('month', c.criada_em at time zone 'America/Sao_Paulo')::date as competencia,
       count(*)                                  as recargas,
       sum(c.energia_kwh)                        as energia_kwh,
       sum(c.valor_bruto)                        as faturamento,
       sum(c.royalty + c.fundo)                  as royalties,
       sum(c.liquido_comercio)                   as liquido_comercio,
       sum(c.custo_energia_estimado)             as custo_energia_estimado,
       round(avg(c.valor_bruto), 2)              as ticket_medio
from cobrancas c
where c.status in ('PAGA', 'PENDENTE')
group by 1, 2;

-- uso sem valores (o operador lê sessões, não cobranças)
create view v_uso_ponto_mes with (security_invoker = true) as
select s.ponto_id,
       date_trunc('month', s.encerrada_em at time zone 'America/Sao_Paulo')::date as competencia,
       count(*)                                                        as recargas,
       sum(s.energia_kwh)                                              as energia_kwh,
       round(sum(extract(epoch from s.fim_carga - s.inicio_carga)) / 3600.0, 2) as horas_carregando
from sessoes s
where s.estado in ('PAGA', 'PENDENTE') and s.inicio_carga is not null
group by 1, 2;
-- horas de uso por dia por vaga = horas_carregando / dias do mês / vagas (feito na tela)            [F0]
-- v_serie_diaria(ponto_id, dia, energia_kwh, faturamento, recargas)                                [F0]
-- v_perfil_horario(ponto_id, hora, recargas, energia_kwh)  (alimenta preverDemanda)                [F0]
-- v_kpis_rede (agregado da rede; a RLS limita à GoodWe)                                             [F0]
-- v_royalties_mes(competencia, organizacao_id, ponto_id, royalty, fundo)                           [F4]
-- v_extrato(conta_id, criado_em, tipo, descricao, valor, saldo_acumulado)  (soma acumulada)        [F3]

-- ================================================================ TAREFAS AGENDADAS (pg_cron, UTC)
-- a cada 30 s : expirar sessões ABERTA vencidas; expirar reservas; expirar comandos
--               (INICIAR vencido → sessão CANCELADA + alerta; PARAR vencido → alerta COMANDO_SEM_RESPOSTA)
-- a cada 1 min: aparelho sem sinal há > minutos_offline → alerta (agente: vagas do ponto OFFLINE);
--               sessão CARREGANDO sem medição há > 5 min → alerta; pagamento AGUARDANDO há > 30 min →
--               consultar gateway / EXPIRADO; processar estornos pendentes (gateway real)
-- a cada 1 h  : sessão PENDENTE há > 24 h → alerta SESSAO_PENDENTE
-- diária 06:00 UTC (03:00 BRT): apagar telemetria E leituras_entrada > dias_retencao_telemetria;
--               apagar códigos de pareamento usados ou vencidos; apagar cron.job_run_details > 7 dias;
--               conciliação (cobranças × transações × pagamentos → alerta se divergir);
--               repor saldo das carteiras de demonstração (só demo)
-- mensal, dia 1 03:10 UTC: fechar_mes(mês anterior)
--
-- Exemplo:
-- select cron.schedule('expirar-pendencias', '30 seconds', $$ select private.expirar_pendencias() $$);
-- select cron.schedule('fechar-mes', '10 3 1 * *', $$ select public.fechar_mes(
--   (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month')::date) $$);

-- ================================================================ PERMISSÕES DAS FUNÇÕES
-- public: ninguém anônimo; authenticated executa e a função confere o papel por dentro.
revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated;
-- (F1/F3) consumir_codigo_pareamento e confirmar_pagamento: revoke de authenticated, grant só a service_role.

-- private: fora da API. Só as funções de papel usadas nas políticas ficam com authenticated.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.eh_goodwe(), private.eh_goodwe_admin(), private.minhas_orgs(boolean),
  private.pontos_da_minha_org(boolean), private.pontos_do_dispositivo(), private.pontos_do_agente(),
  private.pontos_do_totem(), private.pontos_ativos(), private.minhas_contas() to authenticated;

-- ================================================================ SEED INICIAL (valores atuais de catalogo.ts)
-- parametros_rede v1: royalty 0.06, fundo 0.02, processamento 0.015, mensalidade 180,
--   limiar 2.3, saldo_minimo 20, custo_energia_referencia 0.85, amortecimento 0.6.
-- fatores_hora padrão (CURVA_DEMANDA_HORA aplicada a fatorHorario):
--   {0.85,0.85,0.85,0.85,0.85,0.85,0.85,0.92,0.92,1.00,1.00,1.08,1.08,1.08,1.08,1.00,1.08,1.20,1.20,1.20,1.08,1.00,0.92,0.85}
-- fatores_ocupacao padrão: [{"min":0.9,"fator":1.15},{"min":0.7,"fator":1.07},{"max":0.2,"fator":0.95}]
-- contas globais: ROYALTIES, FUNDO_MARKETING, TARIFAS, RECEITA_PLATAFORMA, EXTERNO (uma de cada);
-- RECEBIVEL_PONTO para CADA ponto (inclusive os 16 de demonstração).

-- ================================================================ HISTÓRICO DA REVISÃO (19/10/2026)
-- Revisão independente + validação no PGlite. Corrigido neste arquivo:
--   * vincular aceitava limite <= 0 (inflava o saldo) e preço nulo → PW015 e "is distinct from";
--   * totem tinha poderes de agente → funções do agente usam pontos_do_agente();
--   * débito do app sem teto → energia/taxa/tempo limitados ao limite autorizado;
--   * duas autorizações simultâneas da mesma carteira → trava da conta (for update);
--   * reserva autorizava sozinha (e qualquer um carregava na conta de quem reservou) → confirmar_reserva;
--   * abrir_sessao aceitava vaga em MANUTENCAO/FALHA; tratava toda violação de unicidade como PW001;
--     SESSAO_ABERTA ficava sem correlação;
--   * INICIAR que falhava deixava sessão presa → CANCELADA + alerta;
--   * tolerância de ociosidade descontada duas vezes → agente manda minutos brutos;
--   * suporte não tinha como encerrar → encerrar_sessao comum + suporte_encerrar_sessao;
--   * fim de carga usava now() mesmo vindo da fila offline → p_fim;
--   * private.* executável por authenticated e funções public executáveis por anon → grants acima;
--   * tela de vínculo não tinha como ler a sessão pelo código → previa_vinculo;
--   * cast de enum em encerrar_sessao; a política das vagas escondia o mapa (em 02-rls.sql).
