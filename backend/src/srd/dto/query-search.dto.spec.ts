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
});
