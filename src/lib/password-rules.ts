// Mirrors the live Supabase password rule (config.toml: minimum_password_length = 8, password_requirements = "letters_digits").
// The sign-up and reset screens only said "at least 8 characters" (reset said 6), so a plain-letters password failed with a
// raw server message. Check it here first and say what is needed in plain words.
export const PASSWORD_HINT = 'At least 8 characters, with a letter and a number';

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Your password needs at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Your password needs at least one letter and one number.';
  return null;
}
