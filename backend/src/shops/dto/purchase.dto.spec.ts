import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PurchaseDto } from './purchase.dto';

describe('PurchaseDto', () => {
  const base = {
    characterId: '123e4567-e89b-42d3-a456-556642440000',
    itemIndex: 0,
    quantity: 1,
  };

  const toDto = (plain: Record<string, unknown>) => plainToInstance(PurchaseDto, plain);
  const errorOn = (errors: Awaited<ReturnType<typeof validate>>, prop: string) =>
    errors.find(e => e.property === prop);

  it('accepts a minimal valid payload', async () => {
    expect(await validate(toDto(base))).toHaveLength(0);
  });

  it('accepts optional optimistic-lock versions', async () => {
    const errors = await validate(
      toDto({ ...base, expectedShopVersion: 2, expectedCharacterVersion: 5 })
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-UUID characterId', async () => {
    const errors = await validate(toDto({ ...base, characterId: 'not-a-uuid' }));
    expect(errorOn(errors, 'characterId')).toBeDefined();
  });

  it('rejects a negative itemIndex', async () => {
    const errors = await validate(toDto({ ...base, itemIndex: -1 }));
    expect(errorOn(errors, 'itemIndex')).toBeDefined();
  });

  it('rejects a quantity below 1', async () => {
    const errors = await validate(toDto({ ...base, quantity: 0 }));
    expect(errorOn(errors, 'quantity')).toBeDefined();
  });

  it('rejects a non-integer quantity', async () => {
    const errors = await validate(toDto({ ...base, quantity: 1.5 }));
    expect(errorOn(errors, 'quantity')).toBeDefined();
  });

  it('rejects a quantity above the cap', async () => {
    const errors = await validate(toDto({ ...base, quantity: 100_001 }));
    expect(errorOn(errors, 'quantity')).toBeDefined();
  });

  it('rejects a negative expectedShopVersion', async () => {
    const errors = await validate(toDto({ ...base, expectedShopVersion: -1 }));
    expect(errorOn(errors, 'expectedShopVersion')).toBeDefined();
  });
});
