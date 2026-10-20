-- o app assina todas as tabelas da base; uma tabela fora da publicação derruba o canal inteiro
do $$
declare t text;
begin
  foreach t in array array['franqueados','motoristas'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
