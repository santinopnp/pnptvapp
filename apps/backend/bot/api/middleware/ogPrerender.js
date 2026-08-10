'use strict';

/**
 * OG Prerender Middleware
 *
 * Intercepts requests from social media crawlers (X/Twitter, Facebook, etc.)
 * and serves minimal HTML with dynamic Open Graph meta tags based on the URL.
 * Regular browsers get proxied to the SPA as normal.
 *
 * Supported routes:
 *   /social/post/:postId        → post content + media
 *   /profile/:userId            → user profile
 *   /u/:username                → user profile (short alias)
 *   /creator/:username          → creator profile page
 *   /live/:streamId             → live stream
 *   /v/:postId[/:slug]          → video preview page for X sharing
 *   /channels                   → channels directory
 *   /chat/:groupId              → hangout group
 *   /h/:groupId                 → hangout group (short alias)
 *   /main-stage                 → Main Stage generic card
 *   /main-stage/join/:code      → Main Stage invite card (host name + branded image)
 *   /*                          → default PNPtv card
 */

const { getPool } = require('../../../config/postgres');
const mainStageInviteService = require('../../../services/mainStageInviteService');
const ogService = require('../../../services/ogService');
const logger = require('../../../utils/logger');

const CRAWLER_UA = /Twitterbot|facebookexternalhit|LinkedInBot|Slackbot|Discordbot|WhatsApp|TelegramBot|Pinterest|Googlebot|bingbot/i;
const BASE_URL = process.env.APP_PUBLIC_URL || 'https://pnptv.app';
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;
const MAIN_STAGE_IMAGE = `${BASE_URL}/og-main-stage.png`;
const DEFAULT_TITLE = 'PNPtv!';
const DEFAULT_DESC = 'PNPtv! is a private social platform for gay men into the party and play lifestyle.';

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderOgHtml({
  title, description, image, url, type = 'website', imageWidth, imageHeight, twitterCard,
  // Video / player extensions (optional): og:video + twitter:player tags
  video, videoType, videoWidth, videoHeight,
  playerUrl, playerWidth, playerHeight, playerStream, playerStreamType,
}) {
  const safeTitle = escapeHtml(title || DEFAULT_TITLE);
  const safeDesc = escapeHtml(description || DEFAULT_DESC);
  const safeImage = escapeHtml(image || DEFAULT_IMAGE);
  const safeUrl = escapeHtml(url || BASE_URL);
  const safeImageAlt = escapeHtml(title || DEFAULT_TITLE);
  const w = imageWidth || 1200;
  const h = imageHeight || 630;
  const card = twitterCard || 'summary_large_image';

  // og:video block — rendered when a video URL is provided. Facebook, WhatsApp,
  // Telegram, iMessage and Slack all inline-preview using these tags.
  const videoBlock = video ? `
  <meta property="og:video" content="${escapeHtml(video)}" />
  <meta property="og:video:secure_url" content="${escapeHtml(video)}" />
  <meta property="og:video:type" content="${escapeHtml(videoType || 'video/mp4')}" />
  <meta property="og:video:width" content="${videoWidth || w}" />
  <meta property="og:video:height" content="${videoHeight || h}" />` : '';

  // twitter:player block — only when the card is "player" and we have an
  // https iframe URL. X requires HTTPS + no framing restrictions on the
  // player page. See apps/web/public/live-embed.html.
  const playerBlock = (card === 'player' && playerUrl) ? `
  <meta name="twitter:player" content="${escapeHtml(playerUrl)}" />
  <meta name="twitter:player:width" content="${playerWidth || 1280}" />
  <meta name="twitter:player:height" content="${playerHeight || 720}" />${playerStream ? `
  <meta name="twitter:player:stream" content="${escapeHtml(playerStream)}" />
  <meta name="twitter:player:stream:content_type" content="${escapeHtml(playerStreamType || 'video/mp4')}" />` : ''}` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}" />
  <meta property="og:type" content="${type}" />
  <meta property="og:site_name" content="PNPtv!" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:url" content="${safeUrl}" />
  <meta property="og:image" content="${safeImage}" />
  <meta property="og:image:secure_url" content="${safeImage}" />
  <meta property="og:image:width" content="${w}" />
  <meta property="og:image:height" content="${h}" />
  <meta property="og:image:alt" content="${safeImageAlt}" />${videoBlock}
  <meta name="twitter:card" content="${card}" />
  <meta name="twitter:site" content="@pnptv" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  <meta name="twitter:image" content="${safeImage}" />${playerBlock}
  <meta http-equiv="refresh" content="0;url=${safeUrl}" />
</head>
<body><p>Redirecting to <a href="${safeUrl}">${safeTitle}</a>...</p></body>
</html>`;
}

// Extract a hangout invite code from a post's content and, if present, resolve
// the linked group so the OG card can advertise the hangout instead of the
// raw text (fixes bare pnptv.app/hangouts/invite/... share previews).
async function embeddedHangoutFromContent(content) {
  if (!content) return null;
  const m = content.match(/pnptv\.app\/hangouts\/invite\/([A-Za-z0-9_-]{6,64})/i);
  if (!m) return null;
  try { return await loadHangoutGroup({ inviteCode: m[1] }); } catch { return null; }
}

async function getPostOg(postId) {
  try {
    const { rows } = await getPool().query(
      `SELECT sp.content, sp.media_url, sp.media_type, sp.video_thumbnail_url,
              sp.video_title, sp.video_description,
              u.first_name, u.username, u.photo_file_id
       FROM social_posts sp
       JOIN users u ON u.id = sp.user_id
       WHERE sp.id = $1 AND sp.is_deleted = false`,
      [postId]
    );
    if (!rows[0]) return null;
    const post = rows[0];
    const author = post.first_name || post.username || 'Member';

    // If the post embeds a hangout invite link, prefer the hangout card —
    // richer visual + explicit CTA. Same rule applies for every pnptv link
    // shared through the feed.
    const linkedHangout = await embeddedHangoutFromContent(post.content);
    if (linkedHangout) {
      return {
        ...buildGroupOg(linkedHangout, `${BASE_URL}/social/post/${postId}`),
        // Keep the article type so downstream analytics still classify it as a post.
        type: 'article',
      };
    }

    const preview = (post.content && post.content.trim())
      ? post.content.trim().slice(0, 200) + (post.content.length > 200 ? '...' : '')
      : (post.video_description || `${author} just posted on PNPtv! Real people, real clouds. 🌫️`);

    // Prefer post media in this priority: video thumbnail > image media > author avatar > default.
    let image = DEFAULT_IMAGE;
    if (post.media_type === 'video' && post.video_thumbnail_url) {
      image = post.video_thumbnail_url.startsWith('http')
        ? post.video_thumbnail_url : `${BASE_URL}${post.video_thumbnail_url}`;
    } else if (post.media_type === 'image' && post.media_url) {
      image = post.media_url.startsWith('http') ? post.media_url : `${BASE_URL}${post.media_url}`;
    } else if (post.photo_file_id && (post.photo_file_id.startsWith('/') || post.photo_file_id.startsWith('http'))) {
      image = post.photo_file_id.startsWith('http') ? post.photo_file_id : `${BASE_URL}${post.photo_file_id}`;
    }

    // Video preview support — Facebook/WhatsApp/Telegram/iMessage/Slack all
    // inline-play from og:video, so ship the raw MP4 when we have it.
    const video = (post.media_type === 'video' && post.media_url)
      ? (post.media_url.startsWith('http') ? post.media_url : `${BASE_URL}${post.media_url}`)
      : null;

    return {
      title: post.video_title || `${author} on PNPtv!`,
      description: preview,
      image,
      url: `${BASE_URL}/social/post/${postId}`,
      type: video ? 'video.other' : 'article',
      ...(video ? { video, videoType: 'video/mp4', videoWidth: 1280, videoHeight: 720 } : {}),
    };
  } catch (err) {
    logger.warn('OG prerender: post lookup failed', { postId, error: err.message });
    return null;
  }
}

async function getProfileOg(userId) {
  try {
    const { rows } = await getPool().query(
      `SELECT first_name, username, bio, photo_file_id
       FROM users WHERE id = $1 AND is_deleted = false`,
      [userId]
    );
    if (!rows[0]) return null;
    const user = rows[0];
    const handle = user.username || user.first_name || 'member';
    const desc = user.bio
      ? user.bio.slice(0, 160) + (user.bio.length > 160 ? '...' : '')
      : 'PNPtv! Clouds & Slam Network!';
    const image = user.photo_file_id && (user.photo_file_id.startsWith('/') || user.photo_file_id.startsWith('http'))
      ? (user.photo_file_id.startsWith('http') ? user.photo_file_id : `${BASE_URL}${user.photo_file_id}`)
      : DEFAULT_IMAGE;
    return {
      title: `@${handle} — PNPtv! Clouds & Slam Network!`,
      description: desc,
      image,
      url: `${BASE_URL}/profile/${userId}`,
      type: 'profile',
    };
  } catch (err) {
    logger.warn('OG prerender: profile lookup failed', { userId, error: err.message });
    return null;
  }
}

async function getLiveOg(streamId) {
  try {
    // streamId in the URL is a channel ref like "pnptv-santino". Look up the
    // creator by live_channel (primary), username, or numeric id (legacy).
    // The old query joined against live_streams.user_id, but live_streams rows
    // are only created by the deprecated bot flow — OBS-based creators (the
    // current path) have no row, so the old query always returned null.
    const { rows } = await getPool().query(
      `SELECT id, first_name, username, live_channel, photo_file_id
         FROM users
        WHERE live_channel = $1 OR username = $1 OR id::text = $1
        LIMIT 1`,
      [streamId]
    );
    if (!rows[0]) return null;
    const user = rows[0];
    const streamer = user.first_name || user.username || 'Creator';
    const channelRef = user.live_channel || streamId;

    // Prefer the creator-set stream title/description from Redis (stream:meta),
    // fall back to a generic "<streamer> is live" line.
    let title = null;
    let description = null;
    try {
      const { getRedis } = require('../../../config/redis');
      const redis = getRedis();
      const raw = await redis.get(`stream:meta:${channelRef}`);
      if (raw) {
        const meta = JSON.parse(raw);
        if (meta.title) title = meta.title;
        if (meta.description) description = meta.description;
      }
    } catch (_) { /* meta is best-effort */ }

    // Snapshot image — served by /api/og/snapshot/<ref>.jpg, which fetches
    // the Restreamer JPG (updated every 5s while streaming) with a graceful
    // fallback chain (Restreamer → creator's profile photo → default OG image)
    // so crawlers never get a 401/404 and the card always renders something.
    const snapshotUrl = `${BASE_URL}/api/og/snapshot/${channelRef}.jpg`;

    // Live HLS manifest — Restreamer memfs. Facebook / WhatsApp / Telegram /
    // iMessage / Slack use og:video to inline-preview the live feed.
    const hlsUrl = `${process.env.LIVE_HLS_BASE_URL || 'https://live.pnptv.app'}/memfs/${channelRef}.m3u8`;

    // Iframe player page (static — apps/web/public/live-embed.html) for
    // twitter:card=player. X shows an inline video preview when the tweet is
    // expanded. The player reads ?ref=<channelRef> and loads HLS via hls.js.
    const playerUrl = `${BASE_URL}/live-embed.html?ref=${encodeURIComponent(channelRef)}`;

    return {
      title: title || `🔴 ${streamer} is LIVE — Real Models. Real Clouds.`,
      description: description || `Watch ${streamer} stream live on PNPtv! Real models, real clouds. Join now 🌫️🔞 — pnptv.app`,
      image: snapshotUrl,
      imageWidth: 1280,
      imageHeight: 720,
      url: `${BASE_URL}/live/${streamId}`,
      type: 'video.other',
      twitterCard: 'player',
      video: hlsUrl,
      videoType: 'application/vnd.apple.mpegurl',
      videoWidth: 1280,
      videoHeight: 720,
      playerUrl,
      playerWidth: 1280,
      playerHeight: 720,
    };
  } catch (err) {
    logger.warn('OG prerender: stream lookup failed', { streamId, error: err.message });
    return null;
  }
}

// Load a hangout group by either numeric id or invite_code (Carlos: every
// pnptv link — hangouts, invites, posts — must render a rich card).
async function loadHangoutGroup({ groupId = null, inviteCode = null }) {
  const q = groupId
    ? [`SELECT hg.id, hg.name, hg.description, hg.avatar_url, hg.is_public, hg.is_main, hg.invite_code,
        (SELECT COUNT(*)::int FROM hangout_group_members m WHERE m.group_id = hg.id AND COALESCE(m.is_banned, false) = false) AS member_count
        FROM hangout_groups hg WHERE hg.id = $1`, [groupId]]
    : [`SELECT hg.id, hg.name, hg.description, hg.avatar_url, hg.is_public, hg.is_main, hg.invite_code,
        (SELECT COUNT(*)::int FROM hangout_group_members m WHERE m.group_id = hg.id AND COALESCE(m.is_banned, false) = false) AS member_count
        FROM hangout_groups hg WHERE hg.invite_code = $1`, [inviteCode]];
  const { rows } = await getPool().query(q[0], q[1]);
  return rows[0] || null;
}

function catchyHangoutDescription(group) {
  const rawDesc = (group.description || '').replace(/\s+/g, ' ').trim();
  if (rawDesc) return `${rawDesc.slice(0, 200)}${rawDesc.length > 200 ? '...' : ''} · Join on PNPtv!`;
  const members = Number(group.member_count) || 0;
  const parts = [`Join ${group.name} on PNPtv!`];
  if (members > 3) parts.push(`${members} members inside.`);
  parts.push('Real people, real clouds, real hangs. 🌫️');
  return parts.join(' ');
}

function buildGroupOg(group, canonicalUrl) {
  if (!group.is_public && !group.is_main) {
    // Private — reveal nothing beyond a branded card
    return {
      title: '🎥 Private Hangout — PNPtv!',
      description: 'Members-only video hangout on PNPtv! Get an invite from the host.',
      image: DEFAULT_IMAGE,
      url: canonicalUrl,
      type: 'video.other',
    };
  }
  const image = group.avatar_url
    ? (group.avatar_url.startsWith('http') ? group.avatar_url : `${BASE_URL}${group.avatar_url}`)
    : DEFAULT_IMAGE;
  return {
    title: `🎥 ${group.name} — PNPtv! Hangout`,
    description: catchyHangoutDescription(group),
    image,
    url: canonicalUrl,
    type: 'video.other',
  };
}

async function getGroupOg(groupId) {
  try {
    const group = await loadHangoutGroup({ groupId });
    if (!group) return null;
    return buildGroupOg(group, `${BASE_URL}/h/${groupId}`);
  } catch (err) {
    logger.warn('OG prerender: group lookup failed', { groupId, error: err.message });
    return null;
  }
}

async function getHangoutInviteOg(code) {
  try {
    const group = await loadHangoutGroup({ inviteCode: code });
    if (!group) return null;
    return buildGroupOg(group, `${BASE_URL}/hangouts/invite/${code}`);
  } catch (err) {
    logger.warn('OG prerender: hangout invite lookup failed', { code, error: err.message });
    return null;
  }
}

function getMainStageOg() {
  return {
    title: 'Bye Zoom. Join Main Stage.',
    description: 'Hottest PNP Streaming Party. By PNPtv!',
    image: MAIN_STAGE_IMAGE,
    url: `${BASE_URL}/main-stage`,
    type: 'video.other',
  };
}

async function getMainStageInviteOg(code) {
  try {
    const preview = await mainStageInviteService.previewInvite(code);
    if (!preview || !preview.valid) {
      return {
        title: 'Bye Zoom. Join Main Stage.',
        description: 'Hottest PNP Streaming Party. By PNPtv!',
        image: MAIN_STAGE_IMAGE,
        url: `${BASE_URL}/main-stage/join/${code}`,
        type: 'video.other',
      };
    }
    const host = preview.hostName;
    return {
      title: 'Bye Zoom. Join Main Stage.',
      description: host
        ? `${host} is hosting. Hottest PNP Streaming Party. By PNPtv!`
        : 'Hottest PNP Streaming Party. By PNPtv!',
      image: MAIN_STAGE_IMAGE,
      url: `${BASE_URL}/main-stage/join/${code}`,
      type: 'video.other',
    };
  } catch (err) {
    logger.warn('OG prerender: main-stage invite lookup failed', { code, error: err.message });
    return {
      title: 'Bye Zoom. Join Main Stage.',
      description: 'Hottest PNP Streaming Party. By PNPtv!',
      image: MAIN_STAGE_IMAGE,
      url: `${BASE_URL}/main-stage/join/${code}`,
      type: 'video.other',
    };
  }
}

/**
 * Convert an ogService data object (which may have richer fields) into
 * the shape expected by renderOgHtml. Falls back to defaults on null.
 */
function ogServiceToRenderOg(og, fallbackUrl) {
  if (!og) return { url: fallbackUrl };
  return {
    title: og.title || null,
    description: og.description || null,
    image: og.image || null,
    url: og.url || fallbackUrl,
    type: og.type || 'website',
    imageWidth: og.imageWidth || null,
    imageHeight: og.imageHeight || null,
    twitterCard: og.twitterCard || null,
    // Forward video / player fields so getVideoPreviewOG and getLiveOg both
    // get inline previews on Facebook / WhatsApp / iMessage / Slack (og:video)
    // and X (twitter:player).
    video: og.video || null,
    videoType: og.videoType || null,
    videoWidth: og.videoWidth || null,
    videoHeight: og.videoHeight || null,
    playerUrl: og.playerUrl || null,
    playerWidth: og.playerWidth || null,
    playerHeight: og.playerHeight || null,
    playerStream: og.playerStream || null,
    playerStreamType: og.playerStreamType || null,
  };
}

/**
 * Express middleware — mount BEFORE the static file handler.
 * Only intercepts crawler user-agents; regular browsers pass through.
 */
function ogPrerenderMiddleware(req, res, next) {
  const ua = req.headers['user-agent'] || '';
  if (!CRAWLER_UA.test(ua)) return next();

  const path = req.path;

  // Match routes
  const postMatch = path.match(/^\/social\/post\/(\d+)$/);
  const profileMatch = path.match(/^\/profile\/([^/]+)$/);
  const uMatch = path.match(/^\/u\/([^/]+)$/);
  const creatorMatch = path.match(/^\/creator\/([^/]+)$/);
  const liveMatch = path.match(/^\/live\/([^/]+)$/);
  const videoMatch = path.match(/^\/v\/(\d+)(?:\/[^/]*)?\/?$/);
  const chatMatch = path.match(/^\/chat\/(\d+)$/);
  const hMatch = path.match(/^\/h\/(\d+)$/);
  const hangoutInviteMatch = path.match(/^\/hangouts\/invite\/([A-Za-z0-9_-]{6,64})\/?$/);
  const mainStageInviteMatch = path.match(/^\/main-stage\/join\/([A-Za-z0-9_-]{8,32})$/);
  const mainStageMatch = /^\/main-stage\/?$/.test(path);
  const channelsMatch = /^\/channels\/?$/.test(path);

  let ogPromise;
  if (postMatch) {
    ogPromise = getPostOg(postMatch[1]);
  } else if (profileMatch) {
    ogPromise = getProfileOg(profileMatch[1]);
  } else if (uMatch) {
    // /u/:username — delegate to ogService which supports username lookup
    ogPromise = ogService.getProfileOG(uMatch[1]).then((og) => ogServiceToRenderOg(og, `${BASE_URL}/u/${uMatch[1]}`));
  } else if (creatorMatch) {
    // /creator/:username — creator profile page
    ogPromise = ogService.getProfileOG(creatorMatch[1]).then((og) => ogServiceToRenderOg(og, `${BASE_URL}/creator/${creatorMatch[1]}`));
  } else if (videoMatch) {
    // /v/:postId[/:slug] — video preview page for X sharing
    ogPromise = ogService.getVideoPreviewOG(videoMatch[1]).then((og) => ogServiceToRenderOg(og, `${BASE_URL}/v/${videoMatch[1]}`));
  } else if (channelsMatch) {
    const html = renderOgHtml(ogServiceToRenderOg(ogService.getChannelsOG(), `${BASE_URL}/channels`));
    return res.type('html').send(html);
  } else if (liveMatch) {
    ogPromise = getLiveOg(liveMatch[1]);
  } else if (chatMatch) {
    ogPromise = getGroupOg(chatMatch[1]);
  } else if (hMatch) {
    ogPromise = getGroupOg(hMatch[1]);
  } else if (hangoutInviteMatch) {
    ogPromise = getHangoutInviteOg(hangoutInviteMatch[1]);
  } else if (mainStageInviteMatch) {
    ogPromise = getMainStageInviteOg(mainStageInviteMatch[1]);
  } else if (mainStageMatch) {
    const html = renderOgHtml(getMainStageOg());
    return res.type('html').send(html);
  } else if (path === '/subscribe' || path === '/lifetime100' || path === '/' || path === '/rush') {
    // Ru$h Wallet launch card — Aug 2026 through 2026-08-23. Revert this block after.
    const html = renderOgHtml({
      title: 'Ru$h Wallet is live on PNPtv! — 20% off yearly & lifetime PRIME',
      description: 'Tip creators, unlock content, book private calls — all with Ru$h 💎. Launch offer through Aug 23.',
      image: `${BASE_URL}/rush-wallet/preview.jpg`,
      imageWidth: 1200,
      imageHeight: 2133,
      url: `${BASE_URL}${path}`,
      video: `${BASE_URL}/rush-wallet/marketing-vertical.mp4`,
      videoType: 'video/mp4',
      videoWidth: 1080,
      videoHeight: 1920,
    });
    return res.type('html').send(html);
  } else {
    // Default card for any other page
    const html = renderOgHtml({
      url: `${BASE_URL}${path}`,
    });
    return res.type('html').send(html);
  }

  ogPromise
    .then((og) => {
      const html = renderOgHtml(og || { url: `${BASE_URL}${path}` });
      res.type('html').send(html);
    })
    .catch(() => {
      res.type('html').send(renderOgHtml({ url: `${BASE_URL}${path}` }));
    });
}

module.exports = { ogPrerenderMiddleware };
