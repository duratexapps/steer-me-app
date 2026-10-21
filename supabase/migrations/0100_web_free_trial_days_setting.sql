-- The web free month becomes a server setting instead of a constant, so it can be switched without a release.
-- web_free_trial_days = 0 means no free month: checkout starts the plan straight away and the Subscription screen
-- drops every "free month" wording (it keys off web_trial_eligible below). Set to 30 to bring it back.
-- Starts at 0: a free month given to a real customer cannot be taken back, while withholding one can be undone.
--
-- Also: a comped account (migration 0099) shows as subscribed on the Subscription screen.

insert into public.app_settings (key, value) values ('web_free_trial_days', '0'::jsonb)
on conflict (key) do nothing;

create or replace function public.get_subscription_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  store_active boolean;
  store_expires timestamptz;
  store_product text;
  w public.stripe_subscriptions%rowtype;
  checkout_on boolean;
  web_active boolean;
  comped boolean;
  trial_days integer;
begin
  select entitlement_active, expires_at, product_id
    into store_active, store_expires, store_product
    from public.subscriptions where id = auth.uid();
  store_active := coalesce(store_active, false);

  select * into w from public.stripe_subscriptions where user_id = auth.uid();
  web_active := coalesce(w.active, false);

  comped := exists (select 1 from public.comped_users where user_id = auth.uid());

  checkout_on := coalesce(
    (select (value)::text = 'true' from public.app_settings where key = 'web_checkout_enabled'), false);
  trial_days := coalesce(
    (select (value)::text::integer from public.app_settings where key = 'web_free_trial_days'), 0);

  return jsonb_build_object(
    'entitlement_active', store_active or web_active or comped,
    'source', case
                when store_active and web_active then 'both'
                when web_active then 'web'
                when store_active then 'store'
                else null end,
    'product_id', store_product,
    'expires_at', case
                    when web_active and store_active then greatest(store_expires, w.current_period_end)
                    when web_active then w.current_period_end
                    else store_expires end,
    'web_active', web_active,
    'web_status', w.status,
    'web_cancel_at_period_end', coalesce(w.cancel_at_period_end, false),
    'web_trial_end', w.trial_end,
    'web_has_customer', w.stripe_customer_id is not null,
    'web_checkout_enabled', checkout_on,
    'web_trial_eligible', (w.stripe_subscription_id is null) and not store_active and trial_days > 0
  );
end;
$$;
