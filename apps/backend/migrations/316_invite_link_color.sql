-- Optional brand color per invite link. When a user redeems a link that has
-- a color set, their own profile page background picks it up as a theme
-- accent (see inviteLinkService.redeemLink / webAppController.getProfile /
-- socialPostService.getPublicProfile).
ALTER TABLE invite_links ADD COLUMN IF NOT EXISTS color VARCHAR(16);
