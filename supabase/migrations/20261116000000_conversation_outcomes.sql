-- Safety refusals are recorded separately from "no knowledge" so operators can tell them apart.
alter table public.messages drop constraint messages_outcome_check;
alter table public.messages add constraint messages_outcome_check
  check (outcome in ('answered', 'no_match', 'verify_failed', 'refused', 'error'));
