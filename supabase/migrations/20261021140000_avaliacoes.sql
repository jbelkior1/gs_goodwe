-- =============================================================================
-- Ponto W · MVP · avaliação do local em 3D (gs_vr)
--
-- Antes do pedido de franquia, o comerciante pode avaliar o local no gs_vr (foto, marcação da área,
-- Ponto W projetado, se cada formato cabe). O gs_vr envia as duas imagens para o Storage (bucket
-- público "avaliacoes") e grava uma linha aqui com as medidas e o resultado. O formulário Seja GoodWe
-- lê a linha pelo id (?avaliacao=<id>), mostra as fotos e, ao enviar o pedido, amarra os dois:
-- homologacoes."avaliacaoId" aponta para a avaliação e avaliacoes_local."homologacaoId" para o pedido.
-- A Homologação da GoodWe mostra as fotos e as medidas na análise.
--
-- Pode rodar de novo: usa "if not exists" e recria política.
-- Mesmo acesso aberto do MVP (veja 20261019120000_mvp.sql): o gs_vr é uma página estática, sem login,
-- e grava com a chave publicável. A versão de mercado amarra a avaliação ao comerciante autenticado.
-- =============================================================================

create table if not exists avaliacoes_local (
  "id" text primary key,                                    -- 'av-' + 8 caracteres, gerado no gs_vr
  "criadoEm" timestamptz not null default now(),
  "dados" jsonb not null,                                   -- medidas, cabimento por formato, viabilidade, conta, entrada elétrica
  "fotoUrl" text,                                           -- foto do local (Storage, bucket 'avaliacoes')
  "renderUrl" text,                                         -- foto com o Ponto W projetado
  "solicitanteId" uuid,                                     -- preenchido quando o pedido é enviado
  "homologacaoId" text                                      -- idem: o pedido (homologacoes."id") que usou esta avaliação
);

alter table avaliacoes_local enable row level security;
drop policy if exists mvp_aberto on avaliacoes_local;
create policy mvp_aberto on avaliacoes_local for all to anon, authenticated using (true) with check (true);

-- tempo real: o app assina as tabelas da base; fica na publicação como as demais
do $$
begin
  alter publication supabase_realtime add table avaliacoes_local;
exception when duplicate_object then null;
end $$;

-- o pedido de franquia aponta para a avaliação do local (opcional)
alter table homologacoes add column if not exists "avaliacaoId" text;

-- ------------------------------------------------------------ Storage: fotos da avaliação
-- Bucket público: o endereço da foto (/storage/v1/object/public/avaliacoes/<id>/foto.jpg) abre direto
-- no app e na Homologação. Só JPEG, até 5 MB por arquivo (o gs_vr envia ~200 KB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avaliacoes', 'avaliacoes', true, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

-- ler e enviar sem login (a página do gs_vr usa a chave publicável). O gs_vr envia com "x-upsert: true"
-- e a documentação do Storage pede SELECT e UPDATE além do INSERT para o upsert funcionar; por isso a
-- política de atualização. Cada envio usa um id novo, então na prática nenhum arquivo é sobrescrito.
-- Não há política de delete.
drop policy if exists avaliacoes_ler on storage.objects;
create policy avaliacoes_ler on storage.objects for select to anon, authenticated
  using (bucket_id = 'avaliacoes');

drop policy if exists avaliacoes_enviar on storage.objects;
create policy avaliacoes_enviar on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'avaliacoes');

drop policy if exists avaliacoes_atualizar on storage.objects;
create policy avaliacoes_atualizar on storage.objects for update to anon, authenticated
  using (bucket_id = 'avaliacoes') with check (bucket_id = 'avaliacoes');
