import { File } from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/src/lib/supabase';
import type { PickedImage } from '@/src/lib/image-picker';

type Bucket = 'verification-screenshots' | 'avatars' | 'producer-docs' | 'need-fliers';

function extensionFor(mimeType: string) {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  return 'jpg';
}

// Every bucket policy keys ownership on the first path segment matching
// auth.uid() (see supabase/migrations/0013_storage.sql), so every upload
// here writes to `{userId}/{filename}`. Overwriting the same fixed filename
// (upsert: true) is what makes "replaces and deletes the old one" (Privacy
// Policy section 5) a single call instead of a separate delete step.
export async function uploadUserFile(bucket: Bucket, userId: string, image: PickedImage, filename: string) {
  const path = `${userId}/${filename}.${extensionFor(image.mimeType)}`;
  const base64 = await new File(image.uri).base64();

  const { error } = await supabase.storage.from(bucket).upload(path, decode(base64), {
    contentType: image.mimeType,
    upsert: true,
  });

  if (error) throw error;
  return path;
}

export async function removeUserFile(bucket: Bucket, path: string) {
  await supabase.storage.from(bucket).remove([path]);
}

export function publicUrlFor(bucket: Bucket, path: string | null | undefined) {
  if (!path) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// verification-screenshots is a private bucket - getPublicUrl() would
// return a URL that doesn't actually work (or worse, shouldn't work) without
// going through RLS. createSignedUrl() is itself RLS-checked (only an owner
// or, per migration 0022, a confirmed team partner can generate one), so
// this is the only correct way to display a card that isn't your own.
export async function signedUrlFor(bucket: Bucket, path: string | null | undefined, expiresInSeconds = 120) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data.signedUrl;
}
