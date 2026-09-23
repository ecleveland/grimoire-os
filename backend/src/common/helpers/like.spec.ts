import {
  containsInsensitive,
  endsWithInsensitive,
  equalsInsensitive,
  escapeLike,
  likeContainsPattern,
  startsWithInsensitive,
} from './like';

describe('escapeLike [VEG-529]', () => {
  it('escapes each LIKE metacharacter Postgres honours', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('Under_Score')).toBe('Under\\_Score');
    expect(escapeLike('Back\\slash')).toBe('Back\\\\slash');
  });

  it('escapes a trailing backslash, which would otherwise swallow what follows', () => {
    expect(escapeLike('abc\\')).toBe('abc\\\\');
  });

  it('escapes every metacharacter in a mixed string and leaves the rest alone', () => {
    expect(escapeLike('a%b_c\\d e')).toBe('a\\%b\\_c\\\\d e');
    expect(escapeLike('Fire Bolt')).toBe('Fire Bolt');
  });
});

describe('containsInsensitive [VEG-529]', () => {
  it('builds a case-insensitive contains filter with the value escaped', () => {
    expect(containsInsensitive('a_b')).toEqual({ contains: 'a\\_b', mode: 'insensitive' });
  });

  it('leaves a value without metacharacters untouched', () => {
    expect(containsInsensitive('fire')).toEqual({ contains: 'fire', mode: 'insensitive' });
  });
});

describe('startsWithInsensitive [VEG-529]', () => {
  it('builds a case-insensitive prefix filter with the value escaped', () => {
    expect(startsWithInsensitive('Fire_')).toEqual({ startsWith: 'Fire\\_', mode: 'insensitive' });
  });
});

describe('endsWithInsensitive [VEG-529]', () => {
  it('builds a case-insensitive suffix filter with the value escaped', () => {
    expect(endsWithInsensitive('%Bolt')).toEqual({ endsWith: '\\%Bolt', mode: 'insensitive' });
  });

  // Prisma appends nothing after the value here, so an unescaped trailing
  // backslash is left dangling at the end of the pattern.
  it('escapes a trailing backslash, which nothing else would terminate', () => {
    expect(endsWithInsensitive('Bolt\\')).toEqual({ endsWith: 'Bolt\\\\', mode: 'insensitive' });
  });
});

describe('equalsInsensitive [VEG-529]', () => {
  it('builds a case-insensitive equals filter with the value escaped', () => {
    expect(equalsInsensitive('Wiz%')).toEqual({ equals: 'Wiz\\%', mode: 'insensitive' });
  });
});

describe('likeContainsPattern [VEG-529]', () => {
  it('wraps the escaped value in the substring wildcards', () => {
    expect(likeContainsPattern('50%')).toBe('%50\\%%');
    expect(likeContainsPattern('fire')).toBe('%fire%');
  });
});
