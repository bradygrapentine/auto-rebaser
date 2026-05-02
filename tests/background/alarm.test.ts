import { describe, it, expect } from 'vitest';
import { setupAlarm, clearAlarm } from '../../src/background/alarm';
import { ALARM_NAME, DEFAULT_INTERVAL_MINUTES } from '../../src/core/constants';

describe('setupAlarm', () => {
  it('uses DEFAULT_INTERVAL_MINUTES when no arg given', () => {
    setupAlarm();
    expect(chrome.alarms.clear).toHaveBeenCalledWith(ALARM_NAME);
    expect(chrome.alarms.create).toHaveBeenCalledWith(ALARM_NAME, {
      delayInMinutes: DEFAULT_INTERVAL_MINUTES,
      periodInMinutes: DEFAULT_INTERVAL_MINUTES,
    });
  });

  it('uses custom interval', () => {
    setupAlarm(15);
    expect(chrome.alarms.clear).toHaveBeenCalledWith(ALARM_NAME);
    expect(chrome.alarms.create).toHaveBeenCalledWith(ALARM_NAME, {
      delayInMinutes: 15,
      periodInMinutes: 15,
    });
  });

  it('clears before creating (order)', () => {
    const order: string[] = [];
    (chrome.alarms.clear as ReturnType<typeof vi.fn>).mockImplementation(() => order.push('clear'));
    (chrome.alarms.create as ReturnType<typeof vi.fn>).mockImplementation(() => order.push('create'));
    setupAlarm(1);
    expect(order).toEqual(['clear', 'create']);
  });
});

describe('clearAlarm', () => {
  it('calls chrome.alarms.clear with ALARM_NAME', () => {
    clearAlarm();
    expect(chrome.alarms.clear).toHaveBeenCalledWith(ALARM_NAME);
    expect(chrome.alarms.clear).toHaveBeenCalledTimes(1);
  });
});
