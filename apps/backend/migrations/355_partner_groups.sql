-- Migration 355: PNP Partners Network
-- Partner group affiliate program: group registry, admin splits,
-- referral attribution (6-month window), revenue share ledger, broadcasts.
-- NOTE: users.id is VARCHAR(255) — all FKs to users must use VARCHAR(255).

CREATE TABLE IF NOT EXISTS partner_groups (
  id            SERIAL PRIMARY KEY,
  slug          VARCHAR(20) UNIQUE NOT NULL,
  name          VARCHAR(100) NOT NULL,
  tg_group_id   BIGINT UNIQUE,
  badge_color   VARCHAR(7) NOT NULL DEFAULT '#a855f7',
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | active | suspended
  approved_by   VARCHAR(255) REFERENCES users(id),
  approved_at   TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Up to 3 admins per group; revenue_share_pct must sum to 100 across the group
CREATE TABLE IF NOT EXISTS partner_group_admins (
  id                SERIAL PRIMARY KEY,
  group_id          INTEGER NOT NULL REFERENCES partner_groups(id) ON DELETE CASCADE,
  user_id           VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tg_user_id        BIGINT,
  revenue_share_pct NUMERIC(5,2) NOT NULL DEFAULT 33.33,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

-- One referral row per user; UNIQUE(user_id) enforces one-group-per-user
CREATE TABLE IF NOT EXISTS partner_group_referrals (
  id              SERIAL PRIMARY KEY,
  group_id        INTEGER NOT NULL REFERENCES partner_groups(id),
  user_id         VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,   -- referred_at + 6 months
  milestone_paid  BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(user_id)
);

-- Revenue share + milestone bonus ledger; idempotent on (order_id, admin_id)
CREATE TABLE IF NOT EXISTS partner_group_ledger (
  id            SERIAL PRIMARY KEY,
  group_id      INTEGER NOT NULL REFERENCES partner_groups(id),
  admin_id      VARCHAR(255) NOT NULL REFERENCES users(id),
  referral_id   INTEGER NOT NULL REFERENCES partner_group_referrals(id),
  order_id      VARCHAR(150) NOT NULL,
  gross_usd     NUMERIC(10,2) NOT NULL,
  share_pct     NUMERIC(5,2) NOT NULL,
  share_usd     NUMERIC(10,2) NOT NULL,
  entry_type    VARCHAR(30) NOT NULL DEFAULT 'revenue_share',  -- revenue_share | milestone_bonus
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',        -- pending | paid | reversed
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id, admin_id)
);

-- Broadcast audit log
CREATE TABLE IF NOT EXISTS partner_group_broadcasts (
  id              SERIAL PRIMARY KEY,
  group_id        INTEGER NOT NULL REFERENCES partner_groups(id),
  sent_by         VARCHAR(255) NOT NULL REFERENCES users(id),
  message         TEXT NOT NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Referral attribution on users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS partner_group_id    INTEGER REFERENCES partner_groups(id),
  ADD COLUMN IF NOT EXISTS partner_badge_color VARCHAR(7);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_partner_group_admins_group   ON partner_group_admins(group_id);
CREATE INDEX IF NOT EXISTS idx_partner_group_admins_user    ON partner_group_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_partner_group_referrals_grp  ON partner_group_referrals(group_id);
CREATE INDEX IF NOT EXISTS idx_partner_group_referrals_exp  ON partner_group_referrals(expires_at);
CREATE INDEX IF NOT EXISTS idx_partner_group_ledger_group   ON partner_group_ledger(group_id);
CREATE INDEX IF NOT EXISTS idx_partner_group_ledger_admin   ON partner_group_ledger(admin_id);
CREATE INDEX IF NOT EXISTS idx_partner_group_ledger_status  ON partner_group_ledger(status);
CREATE INDEX IF NOT EXISTS idx_users_partner_group_id       ON users(partner_group_id) WHERE partner_group_id IS NOT NULL;
