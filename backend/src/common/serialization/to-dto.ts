import { ClassConstructor, plainToInstance } from 'class-transformer';

/**
 * Map a service result onto a response DTO, dropping every field the DTO does
 * not explicitly `@Expose()`. Centralizes `excludeExtraneousValues` so a
 * forgotten option can never silently leak a freshly-added Prisma column
 * (VEG-128). Use {@link toDtoArray} for list payloads.
 */
export function toDto<T>(cls: ClassConstructor<T>, data: object): T {
  return plainToInstance(cls, data, { excludeExtraneousValues: true });
}

/** Array variant of {@link toDto} for list/collection responses. */
export function toDtoArray<T>(cls: ClassConstructor<T>, data: object[]): T[] {
  return plainToInstance(cls, data, { excludeExtraneousValues: true });
}
