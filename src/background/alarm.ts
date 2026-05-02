import type { IntervalMinutes } from '../core/types';
import { ALARM_NAME, DEFAULT_INTERVAL_MINUTES } from '../core/constants';

export function setupAlarm(intervalMinutes: IntervalMinutes = DEFAULT_INTERVAL_MINUTES): void {
  chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: intervalMinutes,
    periodInMinutes: intervalMinutes,
  });
}

export function clearAlarm(): void {
  chrome.alarms.clear(ALARM_NAME);
}
