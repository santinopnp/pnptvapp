const UserModel = require('../models/userModel');
const { query } = require('../config/postgres');
const logger = require('../utils/logger');

class UserService {
  static async getById(userId) {
    try {
      return await UserModel.findById(userId);
    } catch (err) {
      logger.error('UserService.getById error:', err);
      return null;
    }
  }

  static async getUser(userId) {
    return this.getById(userId);
  }

  static async getByEmail(email) {
    try {
      return await UserModel.findByEmail(email);
    } catch (err) {
      return null;
    }
  }

  static async getOrCreateFromContext(ctx) {
    try {
      if (!ctx || !ctx.from) return null;
      const user = await UserModel.findById(ctx.from.id);
      if (user) return user;
      return await UserModel.create({
        id: ctx.from.id,
        telegram_id: ctx.from.id,
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name,
        language: ctx.from.language_code || 'es',
        role: 'user',
      });
    } catch (err) {
      logger.error('UserService.getOrCreateFromContext error:', err);
      return null;
    }
  }

  static async updateProfile(userId, updates) {
    try {
      return await UserModel.update(userId, updates);
    } catch (err) {
      logger.error('UserService.updateProfile error:', err);
      return null;
    }
  }

  static async updateUser(userId, updates) {
    return this.updateProfile(userId, updates);
  }

  static async updateLocation(userId, { lat, lng } = {}) {
    try {
      return await UserModel.updateLocation(userId, lat, lng);
    } catch (err) {
      return null;
    }
  }

  static async getNearbyUsers(userId, radius = 10) {
    try {
      if (typeof UserModel.getNearbyUsers === 'function') {
        return await UserModel.getNearbyUsers(userId, radius);
      }
      return [];
    } catch (err) {
      return [];
    }
  }

  static async hasActiveSubscription(userId) {
    try {
      const user = await UserModel.findById(userId);
      if (!user) return false;
      if (user.role === 'admin' || user.role === 'superadmin') return true;
      if (user.subscription_status === 'active' && (!user.plan_expiry || new Date(user.plan_expiry) > new Date())) {
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  }

  static async getStatistics() {
    try {
      const res = await query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN subscription_status = 'active' THEN 1 END) as active_subscriptions,
          COUNT(CASE WHEN role IN ('admin', 'superadmin') THEN 1 END) as admin_count
        FROM users
      `);
      return res.rows[0] || { total_users: 0, active_subscriptions: 0, admin_count: 0 };
    } catch (err) {
      return { total_users: 0, active_subscriptions: 0, admin_count: 0 };
    }
  }

  static async saveFavoritePlace(userId, placeId) {
    return { success: true };
  }
}

module.exports = UserService;
