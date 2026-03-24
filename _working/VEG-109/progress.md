# VEG-109: Fix Object.assign Mass Assignment

## Ticket
- **Title:** Fix Object.assign mass assignment
- **Priority:** High
- **Milestone:** M1: Security Hardening

## Acceptance Criteria

- [x] AC1: `UpdateCharacterDto` must not allow `campaignId` to be set (use `OmitType`)
- [x] AC2: Characters service casts documented — needed for Prisma JSON field compatibility, safe now that DTO is restricted
- [x] AC3: Test proves `campaignId` cannot be passed through character update
- [x] AC4: Audit confirms all other update DTOs properly restrict protected fields

## AC4 Audit Results
| Service | Update DTO | Protected Fields | Status |
|---|---|---|---|
| Characters | `OmitType(CreateCharacterDto, ['campaignId'])` | `campaignId` excluded | **FIXED** |
| Campaigns | `PartialType(CreateCampaignDto)` | `ownerId` not in DTO | Safe |
| Notes | `OmitType(CreateNoteDto, ['campaignId'])` | `authorId` not in DTO | Safe |
| Encounters | `OmitType(CreateEncounterDto, ['campaignId'])` | `createdById` not in DTO | Safe |
| Users | `OmitType(CreateUserDto, ['password', 'role'])` | Properly restricted | Safe |

## Traceability Matrix
| AC | Test | File | Status |
|---|---|---|---|
| AC1 | `should reject campaignId as a non-whitelisted property` | characters.service.spec.ts | PASS |
| AC1 | `should allow legitimate character fields` | characters.service.spec.ts | PASS |
| AC3 | `should reject campaignId as a non-whitelisted property` | characters.service.spec.ts | PASS |

## Test Results
- Run 1: 19 suites, 179 tests, 0 failures
- Run 2: 19 suites, 179 tests, 0 failures (idempotent)
