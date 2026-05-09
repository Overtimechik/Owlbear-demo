-- Public maps bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('maps', 'maps', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "Maps are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'maps');

-- Open write (matches room-code access model for MVP)
CREATE POLICY "Anyone can upload maps"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'maps');

CREATE POLICY "Anyone can update maps"
ON storage.objects FOR UPDATE
USING (bucket_id = 'maps');

CREATE POLICY "Anyone can delete maps"
ON storage.objects FOR DELETE
USING (bucket_id = 'maps');