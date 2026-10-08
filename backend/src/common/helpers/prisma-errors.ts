import { Prisma } from '../../generated/prisma/client';

/**
 * The database error the pg driver adapter attaches to a known request error,
 * under `meta.driverAdapterError.cause`. A constraint violation reports the
 * violated index here, by name, instead of `meta.target` or `meta.field_name`.
 * Fields are `unknown` because the shape is read from an untyped meta bag.
 */
interface DriverAdapterCause {
  originalCode?: unknown;
  constraint?: { index?: unknown; fields?: unknown };
}

function causeOf(err: Prisma.PrismaClientKnownRequestError): DriverAdapterCause | undefined {
  const meta = err.meta as { driverAdapterError?: { cause?: DriverAdapterCause } } | undefined;
  return meta?.driverAdapterError?.cause;
}

/** The columns a violation names, when the adapter reports them instead of an index. */
export function violatedFields(err: Prisma.PrismaClientKnownRequestError): string[] | undefined {
  const fields = causeOf(err)?.constraint?.fields;
  if (!Array.isArray(fields) || !fields.every(f => typeof f === 'string')) return undefined;
  return fields;
}

/** The constraint a violation names: its index, or its columns when only those are reported. */
export function violatedConstraint(err: Prisma.PrismaClientKnownRequestError): string | undefined {
  const index = causeOf(err)?.constraint?.index;
  if (typeof index === 'string') return index;
  return violatedFields(err)?.join(', ');
}

/** The Postgres SQLSTATE behind a known request error, when the adapter carries one. */
export function sqlStateOf(err: Prisma.PrismaClientKnownRequestError): string | undefined {
  const code = causeOf(err)?.originalCode;
  return typeof code === 'string' ? code : undefined;
}
