import { describe, it, expect } from 'vitest';
import { setBadgeCount, clearBadge } from '../../src/background/badge';
import { BADGE_BACKGROUND_COLOR } from '../../src/core/constants';

describe('setBadgeCount', () => {
  it('count=0 clears badge text', () => {
    setBadgeCount(0);
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
    expect(chrome.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
  });

  it('count>0 sets text and color', () => {
    setBadgeCount(3);
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '3' });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: BADGE_BACKGROUND_COLOR,
    });
  });

  it('count=1 shows "1"', () => {
    setBadgeCount(1);
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '1' });
  });
});

describe('clearBadge', () => {
  it('sets badge text to empty string', () => {
    clearBadge();
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
    expect(chrome.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
  });
});
