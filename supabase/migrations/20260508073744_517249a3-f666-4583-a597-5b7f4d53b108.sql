
alter table public.incidents enable row level security;
create policy "incidents public all" on public.incidents for all using (true) with check (true);

alter table public.qwen_learnings enable row level security;
create policy "learnings public all" on public.qwen_learnings for all using (true) with check (true);
