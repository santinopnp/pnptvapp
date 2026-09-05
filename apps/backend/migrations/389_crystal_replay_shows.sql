-- Migration 389: Crystal Creator Replay Shows
-- Crystal Creators can stream pre-recorded MP4s into main-stage-prime as if live.
-- Tips still route to the real creator via pnp_tips.performer_id.

CREATE TABLE crystal_replay_shows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id varchar(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  r2_key text,                      -- R2 object key (nullable — MVP allows local /uploads path in source_url)
  source_url text NOT NULL,         -- URL LiveKit ingress pulls from (presigned R2 OR https://pnptv.app/uploads/...)
  thumbnail_url text,
  duration_seconds int,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_crystal_replay_shows_creator
  ON crystal_replay_shows(creator_user_id)
  WHERE is_active;

CREATE TABLE crystal_replay_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id varchar(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  show_id uuid NOT NULL REFERENCES crystal_replay_shows(id) ON DELETE RESTRICT,
  participant_identity text NOT NULL,       -- 'replay-<creator_user_id>'
  livekit_ingress_id text,
  status text NOT NULL DEFAULT 'starting',  -- starting | live | stopped | failed
  started_at timestamptz NOT NULL DEFAULT NOW(),
  ended_at timestamptz,
  ended_reason text,
  tip_total_cents int NOT NULL DEFAULT 0
);

-- Enforces max 1 active session per creator at the DB level.
CREATE UNIQUE INDEX uniq_crystal_replay_session_active
  ON crystal_replay_sessions(creator_user_id)
  WHERE status IN ('starting', 'live');

CREATE INDEX idx_crystal_replay_sessions_status
  ON crystal_replay_sessions(status, started_at DESC);
