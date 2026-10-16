'use strict';
// Pure configuration check; does not load .env or import application modules.
const path = require('node:path');
if (
  process.argv.length !== 4 ||
  process.argv[2] !== '--offline-compiled-dir' ||
  !path.isAbsolute(process.argv[3])
) {
  console.error(
    'Usage: node scripts/notifications/release-config.cjs --offline-compiled-dir <absolute reviewed build directory>',
  );
  process.exitCode = 1;
} else {
  try {
    const { notificationReleaseConfiguration } = require(
      path.join(
        process.argv[3],
        'core/notifications/notification-release.config.js',
      ),
    );
    const result = notificationReleaseConfiguration((key) => process.env[key]);
    console.log(JSON.stringify(result));
    if (result.status !== 'CONFIGURATION_VALID') process.exitCode = 1;
  } catch {
    console.error(
      'Notification configuration preflight failed (REVIEWED_BUILD_REQUIRED)',
    );
    process.exitCode = 1;
  }
}
