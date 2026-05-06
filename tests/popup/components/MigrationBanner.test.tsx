import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MigrationBanner } from '../../../src/popup/components/MigrationBanner';
import { MIGRATION_BANNER_KEY } from '../../../src/core/migration-banner';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MigrationBanner', () => {
  it('renders when not yet dismissed', async () => {
    chrome.storage.sync.get = vi.fn().mockResolvedValue({});
    render(<MigrationBanner onSwitchToApp={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByTestId('migration-banner')).toBeInTheDocument();
  });

  it('does not render when already dismissed', async () => {
    chrome.storage.sync.get = vi.fn().mockResolvedValue({
      [MIGRATION_BANNER_KEY]: true,
    });
    render(<MigrationBanner onSwitchToApp={vi.fn()} />);
    await act(async () => {});
    expect(screen.queryByTestId('migration-banner')).not.toBeInTheDocument();
  });

  it('switch button calls onSwitchToApp', async () => {
    chrome.storage.sync.get = vi.fn().mockResolvedValue({});
    const onSwitch = vi.fn();
    render(<MigrationBanner onSwitchToApp={onSwitch} />);
    await act(async () => {});
    fireEvent.click(screen.getByText(/switch to GitHub App/i));
    expect(onSwitch).toHaveBeenCalled();
  });

  it('dismiss writes to sync and hides the banner', async () => {
    chrome.storage.sync.get = vi.fn().mockResolvedValue({});
    chrome.storage.sync.set = vi.fn().mockResolvedValue(undefined);
    render(<MigrationBanner onSwitchToApp={vi.fn()} />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByTestId('migration-banner-dismiss'));
    });
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      [MIGRATION_BANNER_KEY]: true,
    });
    expect(screen.queryByTestId('migration-banner')).not.toBeInTheDocument();
  });
});
