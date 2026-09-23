import { ValidationPipe } from '@nestjs/common';
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from '../../bootstrap-config';
import { QuerySearchDto } from './query-search.dto';

// The kind filter is the one place a query string becomes the search's source
// list, and it is built from the shared SEARCH_KINDS. Running the production
// pipe rather than calling the transform by hand is what proves a real request
// for `types=class` survives validation instead of being whitelisted away.
describe('QuerySearchDto', () => {
  const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
  const transform = (query: object) =>
    pipe.transform(query, { type: 'query' as const, metatype: QuerySearchDto as never });

  it('keeps every kind the shared list names and drops the rest [VEG-510]', async () => {
    const dto = (await transform({ types: 'class,feature,bogus' })) as QuerySearchDto;

    expect(dto.types).toEqual(['class', 'feature']);
  });

  it('leaves types undefined when the query names none [VEG-510]', async () => {
    const dto = (await transform({})) as QuerySearchDto;

    expect(dto.types).toBeUndefined();
  });

  // `?types=class&types=bogus` reaches the DTO as an array, not a string, so the
  // two branches have to filter alike. Unfiltered, an unknown kind becomes a
  // source nothing builds and the search answers an empty page.
  it('filters a repeated query parameter the same way as the comma form [VEG-510]', async () => {
    const dto = (await transform({ types: ['class', 'bogus'] })) as QuerySearchDto;

    expect(dto.types).toEqual(['class']);
  });

  it('falls back to every kind when an array names none that exist [VEG-510]', async () => {
    const dto = (await transform({ types: ['x', 'y'] })) as QuerySearchDto;

    expect(dto.types).toBeUndefined();
  });
});
