import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
