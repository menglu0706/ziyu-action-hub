-- content-images was created ad-hoc via the dashboard with no file_size_limit or
-- allowed_mime_types, unlike avatars (004_user_avatars.sql). That gap let raw,
-- uncompressed camera photos (1-3MB each) get uploaded directly through the Supabase
-- dashboard, bypassing the app's own client-side compression pipeline (ImageUpload.tsx
-- resizes to 1200px WebP quality 80, which typically produces well under 500KB). Cap it
-- at the bucket level so oversized files are rejected regardless of upload path.
begin;

update storage.buckets
set file_size_limit = 2097152, -- 2MB: generous headroom over the app's own compressed output
    allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'content-images';

commit;
