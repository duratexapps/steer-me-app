-- Upload limits on the buckets people write to. None had a size cap or file-type restriction, so any signed-in user could
-- fill storage (or host non-image files on the public buckets). The app only uploads photos; the largest existing object is
-- 9.3 MB, so 12 MB leaves room. Existing files are untouched.
update storage.buckets
set file_size_limit = 12582912,
    allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif']
where id in ('avatars', 'coggins-documents', 'event-fliers', 'issue-screenshots', 'need-fliers', 'producer-docs', 'verification-screenshots');
