-- Cedar Chess: privacy-preserving shared opening statistics.
-- Individual match history stays under its existing player_id RLS.
ALTER TABLE public.cedar_match_history
  ADD COLUMN IF NOT EXISTS opening_uci text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.cedar_match_history
  ADD CONSTRAINT cedar_history_opening_uci_valid
  CHECK (
    cardinality(opening_uci) <= 8
    AND array_position(opening_uci, NULL) IS NULL
    AND (
      cardinality(opening_uci) = 0
      OR array_to_string(opening_uci, ' ') ~ '^([a-h][1-8][a-h][1-8][qrbn]?)( [a-h][1-8][a-h][1-8][qrbn]?)*$'
    )
  );

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.cedar_opening_contributions (
  player_id uuid NOT NULL,
  line_key text NOT NULL,
  PRIMARY KEY (player_id, line_key)
);
ALTER TABLE private.cedar_opening_contributions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.cedar_opening_contributions FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.cedar_shared_openings (
  line_key text PRIMARY KEY,
  games_seen integer NOT NULL DEFAULT 0 CHECK (games_seen >= 0),
  bot_wins integer NOT NULL DEFAULT 0 CHECK (bot_wins >= 0),
  human_wins integer NOT NULL DEFAULT 0 CHECK (human_wins >= 0),
  draws integer NOT NULL DEFAULT 0 CHECK (draws >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cedar_shared_openings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cedar_shared_openings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cedar_shared_openings TO authenticated;
CREATE POLICY "show aggregate openings only after five distinct players"
  ON public.cedar_shared_openings
  FOR SELECT TO authenticated
  USING (games_seen >= 5);

CREATE OR REPLACE FUNCTION private.cedar_record_shared_opening()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prefix_size integer;
  opening_key text;
  inserted_count integer;
BEGIN
  IF NEW.player_id IS NULL OR pg_catalog.cardinality(NEW.opening_uci) < 4 THEN
    RETURN NEW;
  END IF;

  -- Count at most ONE completed game per player per opening prefix.
  -- This limits replay-based poisoning and prevents identity disclosure.
  FOREACH prefix_size IN ARRAY ARRAY[4, 6, 8] LOOP
    IF pg_catalog.cardinality(NEW.opening_uci) >= prefix_size THEN
      opening_key := pg_catalog.array_to_string(NEW.opening_uci[1:prefix_size], ' ');
      INSERT INTO private.cedar_opening_contributions(player_id, line_key)
      VALUES (NEW.player_id, opening_key)
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS inserted_count = ROW_COUNT;

      IF inserted_count > 0 THEN
        INSERT INTO public.cedar_shared_openings (
          line_key, games_seen, bot_wins, human_wins, draws
        ) VALUES (
          opening_key, 1,
          CASE WHEN NEW.result = 'loss' THEN 1 ELSE 0 END,
          CASE WHEN NEW.result = 'win' THEN 1 ELSE 0 END,
          CASE WHEN NEW.result = 'draw' THEN 1 ELSE 0 END
        )
        ON CONFLICT (line_key) DO UPDATE SET
          games_seen = public.cedar_shared_openings.games_seen + 1,
          bot_wins = public.cedar_shared_openings.bot_wins + EXCLUDED.bot_wins,
          human_wins = public.cedar_shared_openings.human_wins + EXCLUDED.human_wins,
          draws = public.cedar_shared_openings.draws + EXCLUDED.draws,
          updated_at = now();
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.cedar_record_shared_opening() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER cedar_record_shared_opening_after_match
AFTER INSERT ON public.cedar_match_history
FOR EACH ROW EXECUTE FUNCTION private.cedar_record_shared_opening();

COMMENT ON TABLE public.cedar_shared_openings IS
'Anonymized chess opening outcomes; RLS requires five distinct contributor accounts. Stats inform search time only, never override Stockfish moves.';
