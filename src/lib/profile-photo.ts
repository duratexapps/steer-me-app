import { supabase } from '@/src/lib/supabase';

// Added 2026-10-30. The profile photo is no longer a wall at sign-up (21 of 22 confirmed-but-unfinished
// accounts never added one), but it is still the identity check between ropers: a request can't be sent
// or accepted until the account has a photo. Every place that sends or accepts a request goes through
// requireOwnPhoto(), and the call sites already show a thrown Error's message as a toast.
export const PHOTO_NEEDED_MESSAGE =
  'Add a profile photo first: open Profile, then Edit profile. Ropers need to see who they are partnering with before a request is sent or accepted.';

export async function requireOwnPhoto() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data } = await supabase.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle();
  if (data && !data.avatar_url) throw new Error(PHOTO_NEEDED_MESSAGE);
}
