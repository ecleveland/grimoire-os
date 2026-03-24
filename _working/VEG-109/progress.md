# VEG-109: Fix Object.assign Mass Assignment

## Ticket
- **Title:** Fix Object.assign mass assignment
- **Priority:** High
- **Milestone:** M1: Security Hardening
- **Description:** Replace `Object.assign(model, dto)` with explicit field assignment in all update operations across all services. Prevents overwriting protected fields (ownerId, roles) via crafted request bodies.

## Findings
No `Object.assign` exists in the codebase. The actual vulnerability is in DTO design:
- **Characters** — `UpdateCharacterDto extends PartialType(CreateCharacterDto)` inherits `campaignId`, allowing users to reassign characters to arbitrary campaigns via PATCH
- **Characters** — Service uses unsafe `as unknown as Prisma.CharacterUncheckedUpdateInput` cast
- **Campaigns** — Safe (CreateCampaignDto doesn't include `ownerId`)
- **Notes** — Safe (already uses `OmitType` to exclude `campaignId`)
- **Encounters** — Safe (already uses `OmitType` to exclude `campaignId`)
- **Users** — Safe (already uses `OmitType` to exclude `password` and `role`)

## Acceptance Criteria

- [ ] AC1: `UpdateCharacterDto` must not allow `campaignId` to be set (use `OmitType`)
- [ ] AC2: Characters service update must not use unsafe `as unknown as` type cast
- [ ] AC3: Test proves `campaignId` cannot be passed through character update
- [ ] AC4: Audit confirms all other update DTOs properly restrict protected fields
