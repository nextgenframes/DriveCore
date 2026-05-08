
drop policy if exists "incident files owner write" on storage.objects;
drop policy if exists "incident-files owner update" on storage.objects;
create policy "incident-files public all" on storage.objects for all using (bucket_id = 'incident-files') with check (bucket_id = 'incident-files');
update storage.buckets set public = true where id = 'incident-files';
