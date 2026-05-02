import { setupAlarm } from './alarm';
import { runPollCycle } from './poll-cycle';
import { registerMessageListener } from './messages';
import { ALARM_NAME } from '../core/constants';

registerMessageListener();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) void runPollCycle();
});

chrome.runtime.onInstalled.addListener(() => setupAlarm());
chrome.runtime.onStartup.addListener(() => setupAlarm());
