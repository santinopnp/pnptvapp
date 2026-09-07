require('dotenv').config();
const PlanModel = require('../models/planModel');
const logger = require('../utils/logger');

/**
 * Seed database with initial data
 */
const seedDatabase = async () => {
  try {
    logger.info('Starting database seed...');

    // Initialize default plans
    logger.info('Seeding default subscription plans...');
    await PlanModel.initializeDefaultPlans();

    logger.info('✓ Database seeded successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Failed to seed database:', error);
    process.exit(1);
  }
};

// Run seed if called directly
if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
