const { query } = require('../config/postgres');
const UserModel = require('../models/userModel');
const logger = require('../utils/logger');
const { ROLES, PERMISSIONS, ROLE_HIERARCHY } = require('../config/roles.config');

class RoleService {
  static async initializeTables() {
    try {
      await query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'role'
          ) THEN
            ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user';
          END IF;
        END $$;
      `);
      logger.info('✓ Role table/columns verified');
    } catch (err) {
      logger.warn('RoleService.initializeTables notice:', err.message);
    }
  }

  static async setUserRole(userId, role, assignedBy = 'system') {
    const normalizedRole = (role || 'user').toLowerCase();
    try {
      await UserModel.updateRole(userId, normalizedRole, assignedBy);
      return { success: true, userId, role: normalizedRole };
    } catch (err) {
      logger.error('Error in RoleService.setUserRole:', err);
      throw err;
    }
  }

  static async removeRole(userId, roleName, actorId) {
    return this.setUserRole(userId, 'user', actorId || 'system');
  }

  static async getUserRole(userId) {
    try {
      const user = await UserModel.findById(userId);
      return user?.role || 'user';
    } catch (err) {
      logger.error('Error in RoleService.getUserRole:', err);
      return 'user';
    }
  }

  static async getUserRoles(userId) {
    const role = await this.getUserRole(userId);
    return [role];
  }

  static async getUserRoleDisplay(userId, lang = 'es') {
    const role = await this.getUserRole(userId);
    return role.toUpperCase();
  }

  static async getUsersByRole(role) {
    try {
      return await UserModel.getByRole((role || '').toLowerCase());
    } catch (err) {
      logger.error('Error in RoleService.getUsersByRole:', err);
      return [];
    }
  }

  static async hasPermission(userId, permission) {
    const role = await this.getUserRole(userId);
    if (role === 'superadmin') return true;
    if (role === 'admin') {
      return permission !== 'manage_admins' && permission !== 'manage_instances';
    }
    return false;
  }

  static async hasAnyRole(userId, allowedRoles = []) {
    const role = await this.getUserRole(userId);
    const normalized = allowedRoles.map(r => (r || '').toLowerCase());
    return normalized.includes(role.toLowerCase());
  }

  static async isAdmin(userId) {
    const role = await this.getUserRole(userId);
    return role === 'admin' || role === 'superadmin';
  }

  static async getAdmins() {
    try {
      const res = await query(`SELECT id FROM users WHERE role IN ('admin', 'superadmin')`);
      return res.rows.map(r => r.id);
    } catch (err) {
      return [];
    }
  }

  static async getRoleStats() {
    try {
      const res = await query(`SELECT role, COUNT(*) as count FROM users GROUP BY role`);
      const stats = {};
      res.rows.forEach(r => { stats[r.role || 'user'] = parseInt(r.count, 10); });
      return stats;
    } catch (err) {
      return {};
    }
  }
}

module.exports = RoleService;
