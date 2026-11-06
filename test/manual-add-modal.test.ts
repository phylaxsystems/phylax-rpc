import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManualAddModal } from '../src/ManualAddModal';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ManualAddModal image loading', () => {
  it('preloads the active guide opening pair, the alternate opening image, and then the next step', () => {
    const requestedImages: string[] = [];

    class MockImage {
      decoding = 'auto';
      onerror: null | (() => void) = null;

      set src(value: string) {
        requestedImages.push(value);
      }
    }

    vi.stubGlobal('Image', MockImage);

    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(createElement(ManualAddModal, {
        open: true,
        onClose: vi.fn(),
        walletName: 'Rainbow',
      }));
    });

    expect(requestedImages).toEqual([
      'https://imagedelivery.net/d5Lcqs_wQTDRwGl7Qqna0g/303a6ec3-a1d7-4227-5469-5dc8d06a0400/public',
      'https://imagedelivery.net/d5Lcqs_wQTDRwGl7Qqna0g/51f15724-6524-40ca-5e9e-c3959e3ef000/w=800',
      'https://imagedelivery.net/d5Lcqs_wQTDRwGl7Qqna0g/49f007a1-ca85-4ce5-f4db-65bc183c3c00/w=800',
      'https://imagedelivery.net/d5Lcqs_wQTDRwGl7Qqna0g/7c160697-8a29-45b7-6cca-fee14c9a7d00/w=800',
    ]);

    act(() => {
      renderer.root.findByProps({ 'aria-label': 'Step 2: Open Settings' }).props.onClick();
    });
    const secondStepImage = renderer.root.findByProps({
      alt: 'Rainbow step 2: Open Settings',
    });
    expect(secondStepImage.props.className).toBe(
      'phylax-wallet-guide__step-image--rainbow-settings',
    );
    act(() => {
      secondStepImage.props.onLoad();
    });

    expect(requestedImages[requestedImages.length - 1]).toBe(
      'https://imagedelivery.net/d5Lcqs_wQTDRwGl7Qqna0g/bce42398-c7c8-4ad4-deed-c4bbe7229500/w=800',
    );

    renderer.unmount();
  });
});

describe('ManualAddModal Zerion guide', () => {
  it('selects the four-step Zerion walkthrough from the wallet name', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(createElement(ManualAddModal, {
        open: true,
        onClose: vi.fn(),
        walletName: 'Zerion',
      }));
    });

    const stepTabs = renderer.root
      .findAllByType('button')
      .filter((node) => typeof node.props['aria-label'] === 'string'
        && node.props['aria-label'].startsWith('Step '));
    expect(stepTabs.map((tab) => tab.props['aria-label'])).toEqual([
      'Step 1: Open Zerion',
      'Step 2: Open Networks',
      'Step 3: Select Ethereum',
      'Step 4: Paste the Phylax URL',
    ]);

    act(() => {
      stepTabs[3]?.props.onClick();
    });
    expect(
      renderer.root.findByProps({ alt: 'Zerion step 4: Paste the Phylax URL' }),
    ).toBeTruthy();

    renderer.unmount();
  });
});

describe('ManualAddModal verifier changes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      setInterval,
      clearInterval,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function deferred() {
    let resolve!: (value: boolean) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<boolean>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  async function renderVerification(verifyConnection: () => boolean | Promise<boolean>) {
    const props = { open: true, onClose: vi.fn(), walletName: 'Rabby' };
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ManualAddModal, { ...props, verifyConnection }));
    });
    const lastStep = () => act(() => {
      renderer.root.findByProps({ 'aria-label': 'Step 5: Make sure it is enabled' }).props.onClick();
    });
    if (renderer.root.findAllByProps({ 'aria-label': 'Step 5: Make sure it is enabled' }).length) {
      lastStep();
    }
    return {
      renderer,
      lastStep,
      heading: () => renderer.root.findByType('h2').children.join(''),
      update: async (next: () => boolean | Promise<boolean>) => {
        await act(async () => {
          renderer.update(createElement(ManualAddModal, { ...props, verifyConnection: next }));
        });
      },
      done: () => renderer.root.findByProps({
        className: 'phylax-wallet-guide__action phylax-wallet-guide__action--primary',
      }),
      status: () => renderer.root.findAllByProps({
        className: 'phylax-wallet-guide__connection-copy',
      })[0]?.findByType('strong').children.join('')
        ?? renderer.root.findByType('h2').children.join(''),
    };
  }

  it.each(['connected', 'disconnected', 'rejected'] as const)(
    'clears the previous success until the replacement verifier is %s',
    async (outcome) => {
      const next = deferred();
      const replacement = vi.fn(() => next.promise);
      const modal = await renderVerification(async () => true);
      try {
        expect(modal.heading()).toBe('Connected to Phylax');
        expect(modal.done().props.disabled).toBeFalsy();
        await modal.update(replacement);

        expect(modal.heading()).not.toBe('Connected to Phylax');
        modal.lastStep();
        expect(modal.status()).toBe('Ready to verify');
        expect(modal.done().props.disabled).toBe(true);
        expect(replacement).not.toHaveBeenCalled();

        await act(async () => {
          vi.advanceTimersByTime(3_000);
        });
        expect(replacement).toHaveBeenCalledTimes(1);
        await act(async () => {
          if (outcome === 'rejected') next.reject(new Error('unavailable'));
          else next.resolve(outcome === 'connected');
        });

        expect(Boolean(modal.done().props.disabled)).toBe(outcome !== 'connected');
        expect(modal.status()).toBe(outcome === 'connected'
          ? 'Connected to Phylax'
          : 'Not connected yet');
      } finally {
        act(() => modal.renderer.unmount());
      }
    },
  );

  it('ignores an old pending success after the replacement reports disconnected', async () => {
    const old = deferred();
    const modal = await renderVerification(() => old.promise);
    const replacement = vi.fn(async () => false);
    try {
      await modal.update(replacement);
      await act(async () => {
        vi.advanceTimersByTime(3_000);
      });
      expect(modal.status()).toBe('Not connected yet');
      await act(async () => {
        old.resolve(true);
      });
      expect(modal.status()).toBe('Not connected yet');
      expect(modal.done().props.disabled).toBe(true);
    } finally {
      act(() => modal.renderer.unmount());
    }
  });

  it('uses the latest inline callback without restarting the polling interval', async () => {
    const calls: number[] = [];
    const onClose = vi.fn();
    function Harness({ revision }: { revision: number }) {
      return createElement(ManualAddModal, {
        open: true, onClose, walletName: 'Rabby',
        verifyConnection: () => { calls.push(revision); return true; },
      });
    }
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Harness, { revision: 0 }));
    });
    try {
      for (const revision of [1, 2, 3]) {
        await act(async () => {
          renderer.update(createElement(Harness, { revision }));
        });
      }
      expect(calls).toEqual([0]);
      expect(vi.getTimerCount()).toBe(1);
      await act(async () => {
        vi.advanceTimersByTime(3_000);
      });
      expect(calls).toEqual([0, 3]);
    } finally {
      act(() => renderer.unmount());
    }
  });

  it('cleans up polling when unmounted with verification pending', async () => {
    const pending = deferred();
    const verifier = vi.fn(() => pending.promise);
    const modal = await renderVerification(verifier);
    act(() => modal.renderer.unmount());
    expect(vi.getTimerCount()).toBe(0);
    expect(window.removeEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
    await act(async () => {
      pending.resolve(true);
      vi.advanceTimersByTime(3_000);
    });
    expect(verifier).toHaveBeenCalledTimes(1);
  });
});
