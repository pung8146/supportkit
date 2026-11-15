-- Editing a question or answer makes its chunks stale until they are re-embedded.
create function private.bump_knowledge_version() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.title is distinct from old.title or new.body is distinct from old.body then
    new.version := old.version + 1;
    new.status := 'pending';
  end if;
  return new;
end;
$$;

create trigger knowledge_items_bump_version
before update on public.knowledge_items
for each row execute function private.bump_knowledge_version();

-- Owners edit content only; version and status belong to the embedding pipeline.
revoke insert, update on public.knowledge_items from authenticated;
grant insert (bot_id, kind, title, body) on public.knowledge_items to authenticated;
grant update (kind, title, body) on public.knowledge_items to authenticated;

-- Swaps an item's chunks atomically. Returns false when the item changed meanwhile,
-- so a slow embedding of old text can never overwrite a newer edit.
create function public.replace_item_chunks(
  p_item_id uuid,
  p_version integer,
  p_contents text[],
  p_embeddings text[]
) returns boolean
language plpgsql set search_path = public, extensions
as $$
declare
  v_bot uuid;
begin
  if coalesce(array_length(p_contents, 1), 0) = 0
     or array_length(p_contents, 1) <> array_length(p_embeddings, 1) then
    raise exception 'contents and embeddings must be non-empty and the same length';
  end if;

  select bot_id into v_bot from knowledge_items
  where id = p_item_id and version = p_version
  for update;
  if not found then
    return false;
  end if;

  delete from chunks where item_id = p_item_id;
  insert into chunks (item_id, bot_id, version, content, embedding)
  select p_item_id, v_bot, p_version, content, embedding::vector
  from unnest(p_contents, p_embeddings) as t(content, embedding);
  update knowledge_items set status = 'ready' where id = p_item_id;
  return true;
end;
$$;

-- Stale chunks (older version than the item) are skipped: no answer beats an outdated policy.
create function public.match_chunks(
  p_bot_id uuid,
  p_embedding extensions.vector(1536),
  p_count integer default 5
) returns table (chunk_id uuid, item_id uuid, title text, content text, similarity double precision)
language sql stable set search_path = public, extensions
as $$
  select c.id, c.item_id, k.title, c.content, 1 - (c.embedding <=> p_embedding)
  from chunks c
  join knowledge_items k on k.id = c.item_id and k.version = c.version
  where c.bot_id = p_bot_id
  order by c.embedding <=> p_embedding
  limit least(p_count, 20);
$$;

revoke execute on function public.replace_item_chunks(uuid, integer, text[], text[]) from public, anon, authenticated;
revoke execute on function public.match_chunks(uuid, extensions.vector, integer) from public, anon, authenticated;
grant execute on function public.replace_item_chunks(uuid, integer, text[], text[]) to service_role;
grant execute on function public.match_chunks(uuid, extensions.vector, integer) to service_role;
