-- Create storage bucket for maritime files
INSERT INTO storage.buckets (id, name, public)
VALUES ('maritime-files', 'maritime-files', true)
ON CONFLICT (id) DO NOTHING;

-- Create policies for maritime-files bucket
CREATE POLICY "Maritime files are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'maritime-files');

CREATE POLICY "Anyone can upload maritime files" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'maritime-files');

CREATE POLICY "Anyone can update maritime files" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'maritime-files');

CREATE POLICY "Anyone can delete maritime files" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'maritime-files');