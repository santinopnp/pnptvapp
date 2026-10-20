-- Migration 436: Drop unused indexes on empty tables
--
-- WHY: 1,614 total indexes → 19–25ms planning overhead per query.
-- PostgreSQL planner must evaluate every candidate index during query planning.
-- The indexes below are ALL safe to drop because:
--   1. idx_scan = 0 (never used since server start on 2026-10-19)
--   2. The table has COUNT(*) = 0 (verified by explicit COUNT, not just pg_stat estimates)
--   3. None back a PRIMARY KEY, UNIQUE, or EXCLUSION constraint
--   4. None are CREATE UNIQUE INDEX (would enforce data integrity)
--
-- WHAT WE KEPT (not in this list):
--   - All indexes on tables with any live rows (even 1)
--   - All CREATE UNIQUE INDEX (data integrity enforcement)
--   - All constraint-backed indexes (PK / UNIQUE constraint / EXCLUSION)
--   - All indexes on active-feature tables regardless of row count
--     (notifications, direct_messages, users, payments, social_posts, etc.)
--
-- DROP COUNT: 307 indexes
-- CONCURRENTLY: no table lock in production; runs online
--
-- DOWN: These indexes can be recreated from their original CREATE INDEX
--       statements in the table DDL migrations if any of these features
--       are re-activated. They are NOT backed up here because:
--       (a) all tables are empty so there is nothing to index anyway, and
--       (b) the DDL to recreate them remains in the original migration files.
--
-- Estimated planner improvement: ~50% reduction in plan candidates → target
-- planning time <10ms (from 19–25ms baseline measured in migration 435).
-- =============================================================================

-- ab_test_assignments (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_ab_assignment_ab_test_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_ab_assignment_user_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_ab_assignment_variant;

-- activation_codes (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_activation_codes_expires_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_activation_codes_used;
DROP INDEX CONCURRENTLY IF EXISTS idx_activation_codes_used_by;

-- age_verification_attempts (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_age_verification_attempts_created_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_age_verification_attempts_user_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_age_verification_attempts_verified;

-- approval_queue (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_approval_queue_created_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_approval_queue_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_approval_queue_topic_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_approval_queue_user_id;

-- availability_change_log (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_availability_change_log_model;

-- booking_audit_logs (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_booking_audit_action;
DROP INDEX CONCURRENTLY IF EXISTS idx_booking_audit_actor;
DROP INDEX CONCURRENTLY IF EXISTS idx_booking_audit_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_booking_audit_entity;

-- booking_holds (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_booking_holds_expires;

-- booking_notifications (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_booking_notifications_booking;
DROP INDEX CONCURRENTLY IF EXISTS idx_booking_notifications_scheduled;
DROP INDEX CONCURRENTLY IF EXISTS idx_booking_notifications_user;

-- booking_slots (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_booking_slots_hold_expires;
DROP INDEX CONCURRENTLY IF EXISTS idx_booking_slots_performer;
DROP INDEX CONCURRENTLY IF EXISTS idx_booking_slots_start;
DROP INDEX CONCURRENTLY IF EXISTS idx_booking_slots_status;

-- bot_addition_attempts (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_bot_addition_attempts_bot_username;
DROP INDEX CONCURRENTLY IF EXISTS idx_bot_addition_attempts_group_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_bot_addition_attempts_timestamp;
DROP INDEX CONCURRENTLY IF EXISTS idx_bot_addition_attempts_user_id;

-- broadcast_ab_tests (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_ab_test_broadcast_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_ab_test_created_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_ab_test_created_by;
DROP INDEX CONCURRENTLY IF EXISTS idx_ab_test_status;

-- broadcast_engagement (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_engagement_broadcast_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_engagement_interaction_type;
DROP INDEX CONCURRENTLY IF EXISTS idx_engagement_message_opened_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_engagement_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_engagement_user_id;

-- broadcast_media (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_broadcast_media_broadcast_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_broadcast_media_created_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_broadcast_media_media_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_broadcast_media_s3_key;

-- broadcast_retry_queue (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_retry_queue_attempt_number;
DROP INDEX CONCURRENTLY IF EXISTS idx_retry_queue_broadcast_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_retry_queue_next_retry_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_retry_queue_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_retry_queue_user_id;

-- broadcast_schedules (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_schedules_broadcast_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_schedules_is_recurring;
DROP INDEX CONCURRENTLY IF EXISTS idx_schedules_next_execution;
DROP INDEX CONCURRENTLY IF EXISTS idx_schedules_scheduled_for;
DROP INDEX CONCURRENTLY IF EXISTS idx_schedules_status;

-- broadcast_templates (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_templates_created_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_templates_created_by;
DROP INDEX CONCURRENTLY IF EXISTS idx_templates_is_active;

-- call_bookings (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_call_bookings_performer_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_call_bookings_scheduled_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_call_bookings_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_call_bookings_user_id;

-- call_feedback (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_call_feedback_call_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_call_feedback_created_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_call_feedback_rating;
DROP INDEX CONCURRENTLY IF EXISTS idx_call_feedback_user_id;

-- call_moderation_logs (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_call_moderation_logs_action_type;
DROP INDEX CONCURRENTLY IF EXISTS idx_call_moderation_logs_booking_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_call_moderation_logs_call_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_call_moderation_logs_timestamp;
DROP INDEX CONCURRENTLY IF EXISTS idx_call_moderation_logs_user_id;

-- calls (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_calls_caller_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_calls_receiver_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_calls_scheduled_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_calls_status;

-- canva_export_jobs (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_canva_exports_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_canva_exports_user;

-- card_tokens (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_card_tokens_default;
DROP INDEX CONCURRENTLY IF EXISTS idx_card_tokens_token;
DROP INDEX CONCURRENTLY IF EXISTS idx_card_tokens_user_id;

-- channel_subscribers (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_channel_subs_channel;
DROP INDEX CONCURRENTLY IF EXISTS idx_channel_subs_user;

-- colombia_engagement_log (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_col_eng_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_col_eng_week;

-- community_post_analytics (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_community_post_analytics_group_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_community_post_analytics_post_id;

-- community_post_buttons (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_community_post_buttons_button_order;
DROP INDEX CONCURRENTLY IF EXISTS idx_community_post_buttons_post_id;

-- community_post_channel_analytics (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_channel_analytics_destination;
DROP INDEX CONCURRENTLY IF EXISTS idx_channel_analytics_post_id;

-- community_post_channel_deliveries (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_post_channel_deliveries_channel;
DROP INDEX CONCURRENTLY IF EXISTS idx_post_channel_deliveries_post_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_post_channel_deliveries_status;

-- community_post_deliveries (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_community_post_deliveries_group_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_community_post_deliveries_post_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_community_post_deliveries_schedule_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_community_post_deliveries_status;

-- community_post_media_enhanced (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_community_post_media_checksum;
DROP INDEX CONCURRENTLY IF EXISTS idx_community_post_media_post_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_community_post_media_processing;
DROP INDEX CONCURRENTLY IF EXISTS idx_community_post_media_type;

-- community_post_multi_destination_status (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_multi_status_destination;
DROP INDEX CONCURRENTLY IF EXISTS idx_multi_status_post_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_multi_status_status;

-- community_post_schedules (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_community_post_schedules_next_execution;
DROP INDEX CONCURRENTLY IF EXISTS idx_community_post_schedules_post_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_community_post_schedules_scheduled_for;
DROP INDEX CONCURRENTLY IF EXISTS idx_community_post_schedules_status;

-- community_post_video_processing (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_video_processing_post_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_video_processing_priority;
DROP INDEX CONCURRENTLY IF EXISTS idx_video_processing_status;

-- community_posts (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_community_posts_admin_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_community_posts_channel_ids;
DROP INDEX CONCURRENTLY IF EXISTS idx_community_posts_created_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_community_posts_destinations;
DROP INDEX CONCURRENTLY IF EXISTS idx_community_posts_is_recurring;
DROP INDEX CONCURRENTLY IF EXISTS idx_community_posts_scheduled_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_community_posts_status;

-- courtesy_invite_redemptions (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_courtesy_redemptions_invite_id;

-- creator_milestone_notifications (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_cmn_pending_notified_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_cmn_user_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_creator_milestone_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_creator_milestone_user_id;

-- creator_prerecorded_slots (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_prerecorded_bunny;
DROP INDEX CONCURRENTLY IF EXISTS idx_prerecorded_creator;

-- creator_service_bookings (0 rows)
-- NOTE: idx_csb_payment_ref_unique is UNIQUE — kept

-- creator_strike_log (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_creator_strike_log_creator;

-- creator_withdraw_requests (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_withdraw_requests_status;

-- cult_event_registrations (0 rows — confirmed no rows but table exists)
-- (no non-unique non-constraint indexes in candidate list for this table)

-- custom_emotes (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_custom_emotes_user_id;

-- custom_media_items (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_custom_media_items_pack;
DROP INDEX CONCURRENTLY IF EXISTS idx_custom_media_items_tags;

-- custom_media_packs (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_custom_media_packs_type;

-- dm_mentions (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_dm_mentions_mentioned_user;

-- emote_usage (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_emote_usage_emote_name;
DROP INDEX CONCURRENTLY IF EXISTS idx_emote_usage_used_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_emote_usage_user_id;

-- federated_access_log (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_federated_access_log_timestamp;
DROP INDEX CONCURRENTLY IF EXISTS idx_federated_access_log_user_id;

-- forwarded_violations (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_forwarded_violations_group_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_forwarded_violations_timestamp;
DROP INDEX CONCURRENTLY IF EXISTS idx_forwarded_violations_user_id;

-- fraud_flags (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_fraud_flags_card;
DROP INDEX CONCURRENTLY IF EXISTS idx_fraud_flags_created_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_fraud_flags_email;
DROP INDEX CONCURRENTLY IF EXISTS idx_fraud_flags_phone;
DROP INDEX CONCURRENTLY IF EXISTS idx_fraud_flags_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_fraud_flags_user_id;

-- gamification (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_gamification_level;
DROP INDEX CONCURRENTLY IF EXISTS idx_gamification_points;
DROP INDEX CONCURRENTLY IF EXISTS idx_gamification_user_id;

-- geo_invite_tokens (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_geo_invite_tokens_creator;
DROP INDEX CONCURRENTLY IF EXISTS idx_geo_invite_tokens_token;

-- group_migration_tracking (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_gmt_chat;
DROP INDEX CONCURRENTLY IF EXISTS idx_gmt_user;

-- hangout_poll_votes (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_hangout_poll_votes_poll_id;

-- hangout_polls (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_hangout_polls_hangout_id;

-- jitsi_participants (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_jitsi_participants_room_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_jitsi_participants_user_id;

-- live_show_tickets (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_live_show_tickets_slot;
DROP INDEX CONCURRENTLY IF EXISTS idx_live_show_tickets_user;

-- media_favorites (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_media_favorites_media_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_media_favorites_user_id;

-- media_play_history (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_media_play_history_media_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_media_play_history_played_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_media_play_history_user_id;

-- media_playlists (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_media_playlists_created_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_media_playlists_is_public;
DROP INDEX CONCURRENTLY IF EXISTS idx_media_playlists_owner_id;

-- media_ratings (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_media_ratings_media_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_media_ratings_rating;
DROP INDEX CONCURRENTLY IF EXISTS idx_media_ratings_user_id;

-- media_shares (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_media_shares_created_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_media_shares_like_count;
DROP INDEX CONCURRENTLY IF EXISTS idx_media_shares_media_type;
DROP INDEX CONCURRENTLY IF EXISTS idx_media_shares_share_count;
DROP INDEX CONCURRENTLY IF EXISTS idx_media_shares_user_id;

-- model_availability (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_model_availability_model;
DROP INDEX CONCURRENTLY IF EXISTS idx_model_availability_time;

-- model_earnings (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_model_earnings_status;

-- model_photos (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_model_photos_model;

-- model_status (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_model_status_model;

-- models (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_models_active;

-- moderation (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_moderation_group_id;

-- moderation_actions (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_moderation_actions_group;
DROP INDEX CONCURRENTLY IF EXISTS idx_moderation_actions_type;
DROP INDEX CONCURRENTLY IF EXISTS idx_moderation_actions_user;

-- nearby_place_favorites (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_place_favorites_place;
DROP INDEX CONCURRENTLY IF EXISTS idx_place_favorites_user;

-- nearby_place_reviews (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_place_reviews_place;

-- parche_bookings (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_parche_bookings_buyer;
DROP INDEX CONCURRENTLY IF EXISTS idx_parche_bookings_parche;
DROP INDEX CONCURRENTLY IF EXISTS idx_parche_bookings_payment;
-- NOTE: uq_parche_bookings_buyer_active is UNIQUE — kept

-- parche_packages (0 rows)
-- (no non-unique non-constraint indexes in candidate list)

-- partner_group_admins (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_partner_group_admins_group;
DROP INDEX CONCURRENTLY IF EXISTS idx_partner_group_admins_user;

-- partner_group_broadcasts (0 rows)
-- (no non-unique indexes in candidate list for this table)

-- partner_group_ledger (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_partner_group_ledger_admin;
DROP INDEX CONCURRENTLY IF EXISTS idx_partner_group_ledger_group;
DROP INDEX CONCURRENTLY IF EXISTS idx_partner_group_ledger_status;

-- partner_group_referrals (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_partner_group_referrals_exp;
DROP INDEX CONCURRENTLY IF EXISTS idx_partner_group_referrals_grp;

-- pds_posts (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_pds_posts_author;
DROP INDEX CONCURRENTLY IF EXISTS idx_pds_posts_cached_by;
DROP INDEX CONCURRENTLY IF EXISTS idx_pds_posts_expires_at;

-- performer_availability (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_performer_availability_date;
DROP INDEX CONCURRENTLY IF EXISTS idx_performer_availability_day;
DROP INDEX CONCURRENTLY IF EXISTS idx_performer_availability_performer;
DROP INDEX CONCURRENTLY IF EXISTS idx_performer_availability_type;

-- place_reports (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_pr_place;

-- player_states (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_player_states_media_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_player_states_playlist_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_player_states_user_id;

-- playlist_items (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_playlist_items_media_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_playlist_items_playlist_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_playlist_items_position;

-- playlist_tracks (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_playlist_tracks_playlist;

-- pnp_availability (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_pnp_availability_hold;
DROP INDEX CONCURRENTLY IF EXISTS idx_pnp_availability_model;
DROP INDEX CONCURRENTLY IF EXISTS idx_pnp_availability_model_booked;
DROP INDEX CONCURRENTLY IF EXISTS idx_pnp_availability_slot_type;
DROP INDEX CONCURRENTLY IF EXISTS idx_pnp_availability_time;

-- pnp_feedback (0 rows)
-- NOTE: idx_pnp_feedback_booking_user is UNIQUE — kept
-- pnp_tips (43 rows) — all indexes kept

-- pnp_model_blocked_dates (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_pnp_blocked_dates_lookup;

-- pnp_model_earnings (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_pnp_model_earnings_model;
DROP INDEX CONCURRENTLY IF EXISTS idx_pnp_model_earnings_payout;
DROP INDEX CONCURRENTLY IF EXISTS idx_pnp_model_earnings_type;

-- pnp_model_payouts (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_pnp_payouts_model;
DROP INDEX CONCURRENTLY IF EXISTS idx_pnp_payouts_status;

-- pnp_model_schedules (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_pnp_model_schedules_lookup;

-- pnp_refunds (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_pnp_refunds_booking;
DROP INDEX CONCURRENTLY IF EXISTS idx_pnp_refunds_pending;

-- pnptv_fam_content_credits (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_ffcc_creator_unpaid;
DROP INDEX CONCURRENTLY IF EXISTS idx_ffcc_fam_creator_content;
DROP INDEX CONCURRENTLY IF EXISTS idx_ffcc_fam_time;

-- private_calls (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_private_calls_booking_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_private_calls_call_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_private_calls_caller_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_private_calls_payment_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_private_calls_receiver_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_private_calls_scheduled_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_private_calls_scheduled_date;
DROP INDEX CONCURRENTLY IF EXISTS idx_private_calls_status;

-- promo_code_usage (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_promo_code_usage_code;
DROP INDEX CONCURRENTLY IF EXISTS idx_promo_code_usage_used_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_promo_code_usage_user_id;
-- NOTE: uq_promo_code_usage_code_user is UNIQUE — kept

-- radio_listen_history (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_radio_listen_history_track;
DROP INDEX CONCURRENTLY IF EXISTS idx_radio_listen_history_user;

-- radio_playlists (0 rows — separate from media_playlists)
-- (no non-unique indexes in candidate list)

-- radio_queue (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_radio_queue_media_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_radio_queue_position;

-- radio_schedule (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_radio_schedule_day_of_week;
DROP INDEX CONCURRENTLY IF EXISTS idx_radio_schedule_day_time;

-- radio_stations (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_radio_stations_active;
DROP INDEX CONCURRENTLY IF EXISTS idx_radio_stations_genre;

-- radio_subscribers (0 rows)
-- (no non-unique indexes in candidate list)

-- radio_tracks (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_radio_tracks_active;
DROP INDEX CONCURRENTLY IF EXISTS idx_radio_tracks_type;

-- recurring_payments (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_recurring_payments_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_recurring_payments_subscription_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_recurring_payments_transaction_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_recurring_payments_user_id;

-- refunds (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_refunds_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_refunds_user_id;
-- NOTE: idx_refunds_payment_id_unique is UNIQUE — kept

-- report_appeals (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_report_appeals_ip_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_report_appeals_resolved_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_report_appeals_status_created;
-- NOTE: idx_report_appeals_unique_pending is UNIQUE — kept

-- room_participants (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_room_participants_room_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_room_participants_user_id;

-- social_post_hashtags (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_sph_post_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_sph_tag_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_social_post_hashtags_tag_trgm;

-- stream_banned_users (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_stream_banned_users_stream_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_stream_banned_users_user_id;

-- stream_chat_violations (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_stream_violations_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_stream_violations_severity;
DROP INDEX CONCURRENTLY IF EXISTS idx_stream_violations_stream;
DROP INDEX CONCURRENTLY IF EXISTS idx_stream_violations_user;

-- stream_comments (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_stream_comments_deleted;
DROP INDEX CONCURRENTLY IF EXISTS idx_stream_comments_stream_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_stream_comments_timestamp;
DROP INDEX CONCURRENTLY IF EXISTS idx_stream_comments_user_id;

-- stream_local_uploads (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_stream_local_uploads_user_time;

-- stream_moderation_stats (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_stream_moderation_stats_date;
DROP INDEX CONCURRENTLY IF EXISTS idx_stream_moderation_stats_stream;

-- stream_notifications (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_stream_notifications_streamer_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_stream_notifications_user_id;

-- stream_snapshots (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_stream_snapshots_user_time;

-- topic_violations (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_violations_timestamp;
DROP INDEX CONCURRENTLY IF EXISTS idx_violations_user_topic;

-- user_broadcast_preferences (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_user_prefs_is_opted_out;
DROP INDEX CONCURRENTLY IF EXISTS idx_user_prefs_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_user_prefs_user_id;

-- user_call_packages (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_user_call_packages_active;
DROP INDEX CONCURRENTLY IF EXISTS idx_user_call_packages_expires;
DROP INDEX CONCURRENTLY IF EXISTS idx_user_call_packages_remaining;
DROP INDEX CONCURRENTLY IF EXISTS idx_user_call_packages_user_id;

-- user_media_favorites (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_user_media_favorites_user;

-- user_moderation_actions (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_moderation_actions_active;
DROP INDEX CONCURRENTLY IF EXISTS idx_moderation_actions_user_id;

-- user_notifications (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_user_notifications_active;
DROP INDEX CONCURRENTLY IF EXISTS idx_user_notifications_model;

-- video_access_grants (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_video_grants_expires;
DROP INDEX CONCURRENTLY IF EXISTS idx_video_grants_ledger;
DROP INDEX CONCURRENTLY IF EXISTS idx_video_grants_user_video;

-- wall_of_fame_daily_stats (0 rows)
-- (no non-unique non-constraint indexes in candidate list)

-- webhook_events (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_webhook_events_external_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_webhook_events_provider;

-- webinar_registrations (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_webinar_registrations_user_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_webinar_registrations_webinar_id;

-- webinars (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_webinars_status;

-- wellness_tips (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_wellness_tips_active;

-- withdrawal_audit_log (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_withdrawal_audit_withdrawal_id;

-- withdrawals (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_withdrawals_status;

-- x_ab_tests (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_x_ab_tests_campaign;

-- x_unfollow_logs (0 rows)
DROP INDEX CONCURRENTLY IF EXISTS idx_x_unfollow_logs_created_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_x_unfollow_logs_user_id;

-- broadcast_dejesusof22_wave4_2026_09_04 (0 rows — one-shot campaign table)
-- (no non-unique non-constraint indexes on this table)

-- nudge_2257_grace_2026_07_30 (0 rows — one-shot campaign table)
-- (no non-unique non-constraint indexes on this table)

-- =============================================================================
-- VERIFY after applying:
--   SELECT count(*) FROM pg_indexes WHERE schemaname='public';
--   -- Should be approximately 1614 - 307 = 1307
-- =============================================================================
