-- 2026-10-11 - loosen the entry_code check from 0083. Draw Pro's real codes
-- use 23456789ABCDEFGHJKMNPQRSTUVWXYZ, but its own documented test value
-- (ZZ12) contains a '1', and a validator stricter than it needs to be just
-- drops a legitimate code silently. The check only has to keep junk out of
-- a short on-screen field: 3-8 letters or digits.
create or replace function public.register_draw_pro_entry_submission(
  p_token text,
  p_entry_type text,
  p_requested_run_count int,
  p_entry_code text default null,
  p_pay_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  link public.draw_pro_entry_links;
  new_id uuid;
  v_code text := null;
  v_pay text := null;
begin
  if p_entry_type not in ('draw_in', 'preformed_team') then
    raise exception 'Invalid entry_type';
  end if;

  select * into link from public.draw_pro_entry_links where token = p_token;
  if link is null then
    raise exception 'Entry link not found for token';
  end if;

  if p_entry_code is not null and upper(p_entry_code) ~ '^[A-Z0-9]{3,8}$' then
    v_code := upper(p_entry_code);
  end if;
  if p_pay_url is not null and p_pay_url ~ '^https://(www\.)?ropingtools\.com/pay/[A-Za-z0-9_-]{10,200}$' then
    v_pay := p_pay_url;
  end if;

  insert into public.draw_pro_entry_link_teams (entry_link_id, entry_type, requested_run_count, entry_code, pay_url)
  values (link.id, p_entry_type, greatest(1, coalesce(p_requested_run_count, 1)), v_code, v_pay)
  returning id into new_id;

  return new_id;
end;
$$;

-- create or replace keeps the existing privileges, but restate them so this
-- file is correct on its own.
revoke all on function public.register_draw_pro_entry_submission(text, text, int, text, text)
  from public, anon, authenticated;
