import { setupAlarm } from './alarm';
import { runPollCycle } from './poll-cycle';
import { registerMessageListener } from './messages';
import { ALARM_NAME } from '../core/constants';

registerMessageListener();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) void runPollCycle();
});

// On install / browser startup: configure the alarm AND fire an
// immediate poll so the popup has data on first open instead of waiting
// out the configured interval (default 5 min).
chrome.runtime.onInstalled.addListener(() => {
  setupAlarm();
  void runPollCycle();
});
chrome.runtime.onStartup.addListener(() => {
  setupAlarm();
  void runPollCycle();
});
