-- Fix lifetime100 + lifetime80 prime entitlement: 90 days → 540 days (18 months)
-- Also remove incorrect is_lifetime flag so expiry is enforced properly
UPDATE plan_add_ons
SET is_lifetime = false, duration_days = 540
WHERE plan_id IN ('lifetime100', 'lifetime80') AND add_on_id = 'prime';

-- Rename both plans to PNPtv Founders with updated description
UPDATE plans SET
  name = 'PNPtv Founders',
  description = 'Lifetime access to all PNPtv! features — watch everything, call creators, no limits, forever. Includes 18 months of PRIME + Prime Channel access.'
WHERE id IN ('lifetime100', 'lifetime80');
