'use strict';
require('dotenv').config({ path: '/opt/pnptvapp/.env' });
require('dotenv').config({ path: '/opt/pnptvapp/.env.production', override: true });

const PushNotificationService = require('../services/pushNotificationService');
const NotificationEmitter = require('../services/notificationEmitter');

const USER_ID = '8261112227';

async function main() {
  await PushNotificationService.sendToUser(USER_ID, {
    title: 'Your call credit is back',
    body: 'Your booking was reset — you can now pick a new time with SantinoFurioso!',
    url: '/c/SantinoFurioso',
    tag: `rebook-ready-${USER_ID}`,
    notifType: 'call_booking',
  });
  console.log('Push sent.');

  await NotificationEmitter.emit({
    type: 'system',
    category: 'booking',
    targetUserId: USER_ID,
    entityType: 'booking',
    message: 'Your session credit has been returned — head to SantinoFurioso\'s profile to pick a new time slot!',
  });
  console.log('In-app notification sent.');

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
