-- Set a stable, trusted search path for the existing trigger function.
alter function public.set_cedar_updated_at()
  set search_path = pg_catalog, public;
