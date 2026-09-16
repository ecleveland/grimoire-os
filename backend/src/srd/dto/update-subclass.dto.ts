import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateSubclassDto } from './create-subclass.dto';

/**
 * Body for updating a homebrew subclass. `classId` is omitted rather than made
 * optional. The parent is fixed at creation, and with `forbidNonWhitelisted` on
 * the global pipe, a PATCH that carries one is a 400 rather than a silent no-op.
 *
 * Reparenting is refused because the create-time visibility check decides which
 * classes an author may hang a subclass off, and a later move would have to
 * re-decide it on a row other readers can already see.
 */
export class UpdateSubclassDto extends PartialType(
  OmitType(CreateSubclassDto, ['classId'] as const)
) {}
