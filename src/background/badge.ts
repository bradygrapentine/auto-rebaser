import { BADGE_BACKGROUND_COLOR } from '../core/constants';

export function setBadgeCount(n: number): void {
  if (n <= 0) {
    chrome.action.setBadgeText({ text: '' });
  } else {
    chrome.action.setBadgeText({ text: String(n) });
    chrome.action.setBadgeBackgroundColor({ color: BADGE_BACKGROUND_COLOR });
  }
}

export function clearBadge(): void {
  chrome.action.setBadgeText({ text: '' });
}
