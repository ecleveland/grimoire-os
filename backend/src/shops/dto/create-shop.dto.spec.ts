import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateShopDto } from './create-shop.dto';

describe('CreateShopDto', () => {
  const base = {
    campaignId: '123e4567-e89b-42d3-a456-556642440000',
    name: "Maelin's Apothecary",
    theme: 'alchemist',
  };

  function toDto(plain: Record<string, unknown>): CreateShopDto {
    return plainToInstance(CreateShopDto, plain);
  }

  function lineItemErrors(errors: Awaited<ReturnType<typeof validate>>) {
    return errors.find(e => e.property === 'items')?.children ?? [];
  }

  it('accepts a minimal shop with no items', async () => {
    const errors = await validate(toDto(base));
    expect(errors).toHaveLength(0);
  });

  it('rejects a missing required field (theme)', async () => {
    const { theme: _theme, ...withoutTheme } = base;
    const errors = await validate(toDto(withoutTheme));
    expect(errors.find(e => e.property === 'theme')).toBeDefined();
  });

  it('accepts a line item with a structured coin price and integer stock', async () => {
    const errors = await validate(
      toDto({
        ...base,
        items: [{ name: 'Potion of Healing', price: { gp: 50 }, stock: 5 }],
      })
    );
    expect(errors).toHaveLength(0);
  });

  it('accepts a null stock (unlimited)', async () => {
    const errors = await validate(
      toDto({ ...base, items: [{ name: 'Torch', price: { cp: 1 }, stock: null }] })
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects a negative stock', async () => {
    const errors = await validate(
      toDto({ ...base, items: [{ name: 'Torch', price: { cp: 1 }, stock: -1 }] })
    );
    expect(lineItemErrors(errors).length).toBeGreaterThan(0);
  });

  it('rejects a line item missing a name', async () => {
    const errors = await validate(toDto({ ...base, items: [{ price: { gp: 1 }, stock: 1 }] }));
    expect(lineItemErrors(errors).length).toBeGreaterThan(0);
  });

  it('rejects a non-integer coin denomination', async () => {
    const errors = await validate(
      toDto({ ...base, items: [{ name: 'Gem', price: { gp: 1.5 }, stock: 1 }] })
    );
    expect(lineItemErrors(errors).length).toBeGreaterThan(0);
  });

  it('rejects an invalid itemId (non-uuid)', async () => {
    const errors = await validate(
      toDto({ ...base, items: [{ itemId: 'not-a-uuid', name: 'Gem', price: { gp: 1 }, stock: 1 }] })
    );
    expect(lineItemErrors(errors).length).toBeGreaterThan(0);
  });
});
