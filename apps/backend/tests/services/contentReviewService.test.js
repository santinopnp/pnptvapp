'use strict';

jest.mock('../../config/postgres', () => ({ query: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../services/notificationEmitter', () => ({ emit: jest.fn().mockResolvedValue() }));
jest.mock('../../services/channelVideoService', () => ({ publishVideo: jest.fn().mockResolvedValue({}) }));

const { query } = require('../../config/postgres');
const channelVideoService = require('../../services/channelVideoService');
const NotificationEmitter = require('../../services/notificationEmitter');
const svc = require('../../services/contentReviewService');

describe('contentReviewService.requiresReview', () => {
  it('holds active creators', () => {
    expect(svc.requiresReview({ creator_status: 'active', role: 'creator' })).toBe(true);
  });
  it('never holds admins', () => {
    expect(svc.requiresReview({ creator_status: 'active', role: 'admin' })).toBe(false);
  });
  it('does not hold regular members', () => {
    expect(svc.requiresReview({ creator_status: null, role: 'user' })).toBe(false);
  });
});

describe('contentReviewService queue', () => {
  beforeEach(() => jest.clearAllMocks());

  it('hides a held post and queues it', async () => {
    query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'pending' }] });
    await svc.holdSocialPost(42, 'u1');
    expect(query.mock.calls[0][0]).toMatch(/SET is_deleted = true/);
    expect(query.mock.calls[1][1]).toEqual(['social_post', '42', 'u1']);
  });

  it('approving a post un-hides it, recounts its channel and notifies the creator', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'r1', content_type: 'social_post', content_id: '42', creator_id: 'u1', status: 'approved' }] })
      .mockResolvedValueOnce({ rows: [{ channel_id: 7 }] })
      .mockResolvedValueOnce({});
    await svc.approve('r1', 'admin1');
    expect(query.mock.calls[1][0]).toMatch(/SET is_deleted = false/);
    expect(query.mock.calls[2][1]).toEqual([7]);
    expect(NotificationEmitter.emit).toHaveBeenCalledWith(expect.objectContaining({ targetUserId: 'u1' }));
  });

  it('approving a channel video publishes it as admin', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'r2', content_type: 'channel_video', content_id: '9', creator_id: 'u1', status: 'approved' }] });
    await svc.approve('r2', 'admin1');
    expect(channelVideoService.publishVideo).toHaveBeenCalledWith({ videoId: 9, userId: 'admin1', isAdmin: true });
  });

  it('rejecting album media marks it rejected', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'r3', content_type: 'creator_media', content_id: '5', creator_id: 'u1', status: 'rejected', reason: 'blurry' }] })
      .mockResolvedValueOnce({});
    await svc.reject('r3', 'admin1', 'blurry');
    expect(query.mock.calls[1][0]).toMatch(/review_status = 'rejected'/);
  });

  it('refuses to decide a review twice', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(svc.approve('r1', 'admin1')).rejects.toMatchObject({ status: 404 });
  });
});
