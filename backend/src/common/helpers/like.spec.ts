import { containsInsensitive, equalsInsensitive, escapeLike, likeContainsPattern } from './like';

describe('escapeLike [VEG-529]', () => {
  it('escapes each LIKE metacharacter Postgres honours', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('Under_Score')).toBe('Under\\_Score');
    expect(escapeLike('Back\\slash')).toBe('Back\\\\slash');
  });

  it('escapes a trailing backslash, which raises 22025 unescaped', () => {
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
