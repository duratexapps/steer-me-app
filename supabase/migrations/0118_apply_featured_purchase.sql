-- Marking a featured purchase paid and extending featured_until were two separate calls from the webhook, so a crash or timeout
-- between them could leave a purchase paid with no days applied (and Stripe's retry would see "paid" and stop). One function,
-- one transaction: either both happen or neither does. Safe to call twice (the second call changes nothing).
create or replace function public.apply_featured_purchase(p_purchase_id uuid, p_session_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.featured_purchases;
begin
  update public.featured_purchases
  set status = 'paid', paid_at = now(), stripe_session_id = coalesce(p_session_id, stripe_session_id)
  where id = p_purchase_id and status = 'pending'
  returning * into p;

  if p.id is null then
    return false;
  end if;

  if p.target_type = 'event' then
    update public.events set featured_until = greatest(now(), coalesce(featured_until, now())) + (p.days * interval '1 day') where id = p.target_id;
  else
    update public.layover_spots set featured_until = greatest(now(), coalesce(featured_until, now())) + (p.days * interval '1 day') where id = p.target_id;
  end if;
  if not found then
    raise exception 'Featured target % not found', p.target_id;
  end if;
  return true;
end;
$$;

revoke execute on function public.apply_featured_purchase(uuid, text) from public, anon, authenticated;
grant execute on function public.apply_featured_purchase(uuid, text) to service_role;
