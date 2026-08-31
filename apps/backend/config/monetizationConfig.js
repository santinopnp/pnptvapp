/**
 * Monetization Configuration
 * Centralized configuration for all monetization features
 */

// ── Revenue-split constants ──────────────────────────────────────────────────
// 70% to creator, 30% to platform — applies to all non-membership revenue
// (call packages, token heartbeats, creator subscriptions, admin payouts).
// CREATOR_REVENUE_RATE + PLATFORM_COMMISSION_RATE MUST equal exactly 1.
const PLATFORM_COMMISSION_RATE = 0.30;
const CREATOR_REVENUE_RATE     = 0.70;
const TIP_CREATOR_RATE         = 1.0; // 100% to creator — tips are fully exempt from platform commission

// ── Gifted-token policy ──────────────────────────────────────────────────────
// Tokens gifted before PNP Live's public launch are restricted to these
// performers' live shows (tips + stream heartbeats). Regular purchased tokens
// work for any performer.
const GIFTED_ALLOWED_PERFORMER_USER_IDS = ['8599671840', '8f5f4dd1-7bdb-4571-b026-e09d91113c91'];

// Santino Furioso's user ID — historical key for the purchase-bonus token pool.
// The JSONB pool (user_token_wallets.creator_gifts['8599671840']) is spendable
// on both Santino and PNPLatinoBoy streams/tips (PRIME co-founders).
const SANTINO_USER_ID = '8599671840';

// PNPLatinoBoy (Lex) — PRIME co-founder. Reactivated 2026-08-09 with a new
// UUID identity after the 2026-08-08 termination + same-day re-registration.
// Original Telegram id 7246621722 stays terminated.
const LEX_USER_ID = '8f5f4dd1-7bdb-4571-b026-e09d91113c91';
const LEX_PRIME_HANGOUT_GROUP_ID = null; // hangout 785 was hard-deleted; not restored

// Amadeus — Jonathan's stage persona (Content & Talent Producer, joined
// 2026-08-09). Third founder-tier identity for PNPtv! Mode / Main Stage focus.
const AMADEUS_USER_ID = '7bdabb03-b447-4e8e-b989-efe1b5e773fd';

// PNPtv! Mode founders — permanent grant (pnptv_mode_expires_at='infinity').
// Detection queries JOIN users WHERE pnptv_mode_expires_at > NOW(), but this
// list is the source of truth for seeding + admin displays.
const PNPTV_MODE_FOUNDER_IDS = [SANTINO_USER_ID, LEX_USER_ID, AMADEUS_USER_ID];

// Tips landing during an active pnptv_mode_sessions row split 70/30
// (creator/platform). Regular tips outside PNPtv! Mode keep the existing
// TIP_CREATOR_RATE (1.0). The platform-side share funds Main Stage infra
// (LiveKit egress, discovery push fan-out, moderation).
const PNPTV_MODE_CREATOR_TIP_RATE  = 0.70;
const PNPTV_MODE_PLATFORM_TIP_RATE = 0.30;

// Grace period before a disconnected holder's session is considered ended.
// Absorbs wifi hiccups + LiveKit reconnect (~5-15s typical). If holder
// re-publishes within this window, session/lock stays intact.
const PNPTV_MODE_GRACE_SECONDS = 60;

// PRIME revenue split — 50% platform / 25% Santino / 25% Lex.
// Preserves Santino's post-termination 50% platform-reinvestment decision and
// splits the creator half equally between co-founders. Applies to every paid
// PRIME plan grant (price>0 only, trials skip).
const PRIME_PLATFORM_RATE = 0.50;
const PRIME_CREATOR_RATE  = 0.25; // per co-founder — Santino AND Lex each get this
const PRIME_REVENUE_RECIPIENTS = [SANTINO_USER_ID, LEX_USER_ID];

// PRIME hangout group IDs — every qualifying PRIME member is auto-joined.
// Lex's original room 785 was hard-deleted 2026-08-08; not restored.
const SANTINO_PRIME_HANGOUT_GROUP_ID = 719;
const PRIME_HANGOUT_GROUP_IDS = [SANTINO_PRIME_HANGOUT_GROUP_ID];

// ── Creator content-compliance policy ────────────────────────────────────────
// New creator_monthly subscribers' membership start is held until the creator has
// at least this many seconds of exclusive (is_premium) video content; missing the
// grace deadline suspends the creator. See services/contentComplianceService.js.
const CONTENT_COMPLIANCE_MIN_SECONDS = 240;       // 4 minutes
const CONTENT_COMPLIANCE_GRACE_DAYS = 7;
const CONTENT_COMPLIANCE_SUSPENSION_MONTHS = 6;
// Held subscribers whose creator is suspended for non-compliance are refunded in
// tokens at 105% of what they paid (standard 6 tokens = $1 USD rate, see dashTokenService.js).
const CONTENT_COMPLIANCE_REFUND_MULTIPLIER = 1.05;
// SantinoFurioso only — explicitly confirmed exempt from this rule (real
// superadmin/performer, already exempted from the similar onboarding-lock rule
// in migration 223). PNPLatinoBoy is NOT included here despite being exempt from
// that other rule — he is explicitly subject to content compliance.
const CONTENT_COMPLIANCE_EXEMPT_USER_IDS = [SANTINO_USER_ID];

// ── Crystal Creator pass pricing ─────────────────────────────────────────────
// Self-purchase price shown ONLY on /api/creator/crystal/self and its checkout.
// Gift price shown ONLY on /api/creators/:id/crystal/gift and its checkout.
// These two constants MUST never appear in the same response schema or log line.
const CRYSTAL_CREATOR_SELF_PRICE_CENTS = 10000;  // $100/mo — creator self-purchases
const CRYSTAL_CREATOR_GIFT_PRICE_CENTS = 15000;  // $150/mo — fan gifts to creator
const CRYSTAL_CREATOR_COMMISSION_PCT   = 15;      // 15% platform cut (creator keeps 85%)

// Earnings hold period: newly-recorded earnings sit in 'holding' status for this
// many hours before maturing to 'available'. This gives the platform time to
// process any refund or chargeback before paying out the creator.
const EARNINGS_HOLD_HOURS = 168;        // tokens + crypto: 7-day hold
const EARNINGS_HOLD_HOURS_EFIPAY = 336; // eFiPay (reseller): 14-day hold (higher chargeback window)

module.exports = {
  // Exported as top-level named constants for direct destructured imports.
  PLATFORM_COMMISSION_RATE,
  CREATOR_REVENUE_RATE,
  TIP_CREATOR_RATE,
  EARNINGS_HOLD_HOURS,
  EARNINGS_HOLD_HOURS_EFIPAY,
  CRYSTAL_CREATOR_SELF_PRICE_CENTS,
  CRYSTAL_CREATOR_GIFT_PRICE_CENTS,
  CRYSTAL_CREATOR_COMMISSION_PCT,
  GIFTED_ALLOWED_PERFORMER_USER_IDS,
  SANTINO_USER_ID,
  LEX_USER_ID,
  AMADEUS_USER_ID,
  PNPTV_MODE_FOUNDER_IDS,
  PNPTV_MODE_CREATOR_TIP_RATE,
  PNPTV_MODE_PLATFORM_TIP_RATE,
  PNPTV_MODE_GRACE_SECONDS,
  PRIME_PLATFORM_RATE,
  PRIME_CREATOR_RATE,
  PRIME_REVENUE_RECIPIENTS,
  SANTINO_PRIME_HANGOUT_GROUP_ID,
  LEX_PRIME_HANGOUT_GROUP_ID,
  PRIME_HANGOUT_GROUP_IDS,
  CONTENT_COMPLIANCE_MIN_SECONDS,
  CONTENT_COMPLIANCE_GRACE_DAYS,
  CONTENT_COMPLIANCE_SUSPENSION_MONTHS,
  CONTENT_COMPLIANCE_REFUND_MULTIPLIER,
  CONTENT_COMPLIANCE_EXEMPT_USER_IDS,
  // ==========================================
  // SUBSCRIPTION SETTINGS
  // ==========================================
  subscription: {
    // Default currency
    currency: process.env.DEFAULT_CURRENCY || 'USD',

    // Billing cycles
    billingCycles: {
      monthly: 30,
      yearly: 365,
    },

    // Renewal settings
    renewal: {
      gracePeriodDays: 3,
      autoRenewDays: 7,
      expirationCheckInterval: '0 0 * * *', // Daily at midnight
    },

    // Free trial (if enabled)
    freeTrialDays: parseInt(process.env.FREE_TRIAL_DAYS || '1'),

    // Features by plan
    features: {
      user: {
        free: {
          socialFeed: 'free_only',
          nearby: 'count_only',
          dms: 'limited',
          hangouts: 'browse_only',
          live: 'preview_only',
          profileBrowsing: 'interacted_only',
        },
        member: {
          socialFeed: 'free_and_member',
          nearby: 'blurred_profiles',
          dms: 'unlimited',
          hangouts: 'join',
          live: 'watch',
          profileBrowsing: 'all_blurred_prime',
        },
        prime: {
          socialFeed: 'all',
          nearby: 'full',
          dms: 'unlimited',
          hangouts: 'join_and_create',
          live: 'watch_and_stream',
          profileBrowsing: 'full',
        },
      },
    },

    freeTier: {
      dmLimits: { default: 3, afterDay14: 1 },
      decay: { deprioritizeAfterDays: 30 },
    },
  },

  // ==========================================
  // PAYMENT SETTINGS
  // ==========================================
  payment: {
    // Supported providers — NowPayments only (ETH + USDC-ERC20).
    // ePayco retired 2026-06-27, BTCPay/Dash retired 2026-07-31.
    providers: ['nowpayments'],

    // Default provider
    defaultProvider: 'nowpayments',

    // Payment methods
    methods: {
      nowpayments: ['eth', 'usdcerc20'],
    },

    // Minimum amounts
    minimums: {
      usd: 1.0,
      cop: 5000,
    },

    // Maximum amounts (fraud prevention)
    maximums: {
      usd: 10000,
      cop: 50000000,
    },

    // Retry settings
    retry: {
      maxAttempts: 3,
      delayMs: 5000,
      backoffMultiplier: 2,
    },

    // Webhook timeout
    webhookTimeout: parseInt(process.env.WEBHOOK_TIMEOUT || '30000'),
  },

  // ==========================================
  // MONETIZATION SETTINGS
  // ==========================================
  monetization: {
    // Revenue split percentages (model gets %)
    revenueSplit: {
      contentSale: {
        standard: 70,
      },
      streaming: {
        tips: 85,
      },
    },

    // Platform fees (in USD)
    platformFees: {
      perTransaction: 0.50,
      percentage: 2.5,
    },

    // Minimum earnings for withdrawal
    minimumWithdrawal: {
      usd: parseFloat(process.env.MIN_WITHDRAWAL_USD || '50'),
      cop: parseFloat(process.env.MIN_WITHDRAWAL_COP || '50000'),
    },

    // Maximum daily withdrawals per model
    maxWithdrawalsPerDay: 5,

    // Processing time
    processingTime: {
      bankTransfer: {
        min: 1,
        max: 3,
      },
      paypal: {
        min: 1,
        max: 2,
      },
    },
  },

  // ==========================================
  // CONTENT SETTINGS
  // ==========================================
  content: {
    // Supported content types
    types: ['photo', 'video', 'audio', 'document', 'bundle'],

    // Storage
    storage: {
      maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE || '500'),
      maxFilesPerMonth: 100,
    },

    // Pricing
    pricing: {
      minPrice: 0.99,
      maxPrice: 999.99,
      currency: 'USD',
    },

    // Exclusivity
    exclusivity: {
      enabled: true,
      duration: 30, // days
    },
  },

  // ==========================================
  // STREAMING SETTINGS
  // ==========================================
  streaming: {
    // Live stream limits (free tier)
    freeTierLimits: {
      maxDurationMinutes: 60,
      maxViewers: 100,
      maxStreamsPerWeek: 1,
    },

    // Monetization
    monetization: {
      tipsEnabled: true,
      subscriptionRequired: false,
      premiumStreamingEnabled: true,
    },

    // Recording
    recording: {
      enabled: true,
      retentionDays: 30,
    },
  },

  // ==========================================
  // AUDIT & COMPLIANCE
  // ==========================================
  audit: {
    // Log all transactions
    logTransactions: true,

    // Retention period (days)
    retentionDays: 365,

    // PCI compliance
    pciCompliance: true,

    // Data encryption
    encryption: {
      enabled: true,
      algorithm: 'AES-256-GCM',
    },
  },

  // ==========================================
  // EXCHANGE RATES
  // ==========================================
  // NOTE: USD→COP rate is managed exclusively by getEpaycoCopRate() in services/paymentService.js.
  // These config entries are kept for structural compatibility only — do NOT read defaultRate
  // or fallback.COP in payment code. Use getEpaycoCopRate() and fail closed if unavailable.
  exchangeRates: {
    // Update interval (hours)
    updateInterval: 24,

    // Fallback rates — for non-payment display purposes only (NOT used for ePayco charges)
    fallback: {
      'USD': 1.0,
      'EUR': 1.10,
    },
  },

  // ==========================================
  // NOTIFICATIONS
  // ==========================================
  notifications: {
    // Send email on events
    email: {
      subscriptionCreated: true,
      subscriptionExpiring: true,
      subscriptionExpired: true,
      paymentProcessed: true,
      withdrawalRequested: true,
      withdrawalApproved: true,
      withdrawalProcessed: true,
      withdrawalFailed: true,
      earningsAccrued: true,
    },

    // Send push notifications
    push: {
      enabled: process.env.ENABLE_PUSH_NOTIFICATIONS !== 'false',
      subscriptionCreated: true,
      paymentProcessed: true,
      withdrawalProcessed: true,
    },

    // Send SMS
    sms: {
      enabled: process.env.ENABLE_SMS !== 'false',
      withdrawalApproved: true,
      withdrawalProcessed: true,
    },
  },

  // ==========================================
  // FEATURE FLAGS
  // ==========================================
  features: {
    // Enable/disable features
    subscriptions: process.env.ENABLE_SUBSCRIPTIONS !== 'false',
    paidContent: process.env.ENABLE_PAID_CONTENT !== 'false',
    streaming: process.env.ENABLE_STREAMING !== 'false',
    tips: process.env.ENABLE_TIPS !== 'false',
    withdrawals: process.env.ENABLE_WITHDRAWALS !== 'false',
    crypto: process.env.ENABLE_CRYPTO !== 'false',
  },

  // ==========================================
  // VALIDATION
  // ==========================================
  validation: {
    email: {
      required: true,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    password: {
      minLength: 8,
      requireUppercase: true,
      requireNumbers: true,
      requireSpecialChars: false,
    },
    username: {
      minLength: 3,
      maxLength: 50,
      pattern: /^[a-zA-Z0-9_-]+$/,
    },
  },

  // ==========================================
  // RATE LIMITING
  // ==========================================
  rateLimit: {
    login: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5,
    },
    checkout: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 10,
    },
    withdrawal: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 3,
    },
  },

  // ==========================================
  // ERROR MESSAGES
  // ==========================================
  errors: {
    INVALID_CREDENTIALS: 'Invalid email or password',
    UNAUTHORIZED: 'Authentication required',
    FORBIDDEN: 'Access denied',
    PLAN_NOT_FOUND: 'Subscription plan not found',
    NO_ACTIVE_SUBSCRIPTION: 'No active subscription',
    LIMIT_EXCEEDED: 'Limit exceeded',
    MINIMUM_WITHDRAWAL: 'Below minimum withdrawal amount',
    INVALID_PAYMENT_METHOD: 'Invalid payment method',
    PAYMENT_FAILED: 'Payment failed',
    INSUFFICIENT_BALANCE: 'Insufficient balance',
    INVALID_CONTENT: 'Invalid content',
    STORAGE_LIMIT: 'Storage limit exceeded',
    INVALID_AMOUNT: 'Invalid amount',
  },
};
