import { afterEach, describe, expect, it, vi } from 'vitest';

const update = vi.fn();
vi.mock('../db', () => ({
  serviceClient: () => ({
    from: () => ({
      update: (values: unknown) => {
        update(values);
        return { eq: () => ({ or: async () => ({ error: null }) }) };
      },
    }),
  }),
}));

const { recordInstallSeen } = await import('./install-seen');

afterEach(() => update.mockReset());

describe('recordInstallSeen', () => {
  it('records a well-formed origin', async () => {
    await recordInstallSeen('b1', 'https://shop.example.com', false);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ last_blocked_origin: 'https://shop.example.com' }));
  });

  it.each([
    'https://a".example.com',
    'https://a",id.neq."x.example.com',
    'https://Shop.example.com',
    'http://shop.example.com',
    'https://xn--and-quotes".com',
    'https://*.example.com',
  ])('ignores forged origin %j', async (origin) => {
    await recordInstallSeen('b1', origin, false);
    expect(update).not.toHaveBeenCalled();
  });
});
