const { ROLES, PERMISSIONS } = require('../config/roles.config');
const RoleService = require('./roleService');

class PermissionService {
  static async isAdmin(userId) {
    return RoleService.isAdmin(userId);
  }

  static async hasPermission(userId, permission) {
    return RoleService.hasPermission(userId, permission);
  }

  static async getUserRole(userId) {
    return RoleService.getUserRole(userId);
  }
}

module.exports = PermissionService;
