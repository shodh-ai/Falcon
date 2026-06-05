import { SetMetadata } from '@nestjs/common';

export const ENTITY_CREATOR_KEY = 'entity_creator_only';

/** Restricts route to the master Super Admin account (entity creator hub). */
export const EntityCreatorOnly = () => SetMetadata(ENTITY_CREATOR_KEY, true);
