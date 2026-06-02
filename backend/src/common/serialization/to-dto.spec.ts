import { Expose } from 'class-transformer';
import { toDto, toDtoArray } from './to-dto';

class SampleDto {
  @Expose() id!: string;
  @Expose() name!: string;
}

describe('toDto', () => {
  it('keeps only exposed fields and drops extraneous ones', () => {
    const result = toDto(SampleDto, {
      id: 'abc',
      name: 'Goblin',
      secret: 'leak-me',
    });

    expect(result).toBeInstanceOf(SampleDto);
    expect(result).toEqual({ id: 'abc', name: 'Goblin' });
    expect((result as unknown as Record<string, unknown>).secret).toBeUndefined();
  });

  it('preserves Date values without mangling them', () => {
    class WithDate {
      @Expose() id!: string;
      @Expose() createdAt!: Date;
    }
    const createdAt = new Date('2025-01-01T00:00:00Z');
    const result = toDto(WithDate, { id: 'x', createdAt, extra: 1 });

    // class-transformer clones the Date, but the value (and thus JSON output)
    // is preserved.
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe(createdAt.toISOString());
    expect((result as unknown as Record<string, unknown>).extra).toBeUndefined();
  });
});

describe('toDtoArray', () => {
  it('maps each element, dropping extraneous fields', () => {
    const result = toDtoArray(SampleDto, [
      { id: '1', name: 'A', secret: 'x' },
      { id: '2', name: 'B', secret: 'y' },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(SampleDto);
    expect(result).toEqual([
      { id: '1', name: 'A' },
      { id: '2', name: 'B' },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(toDtoArray(SampleDto, [])).toEqual([]);
  });
});
