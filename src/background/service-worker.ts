import { setupAlarm } from './alarm';
import { runPollCycle } from './poll-cycle';
import { registerMessageListener } from './messages';
import { ALARM_NAME } from '../core/constants';
import { runMigrationIfNeeded } from '../core/storage/migration';

registerMessageListener();

async function bootCycle() {
  await runMigrationIfNeeded();
  await runPollCycle();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) void bootCycle();
});

// On install / browser startup: migrate (no-op if already v2), configure
// the alarm, and fire an immediate poll so the popup has data on first
// open instead of waiting out the configured interval (default 5 min).
async function bootInstall() {
  await runMigrationIfNeeded();
  setupAlarm();
  await runPollCycle();
}

chrome.runtime.onInstalled.addListener(() => void bootInstall());
chrome.runtime.onStartup.addListener(() => void bootInstall());
