import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Giới hạn route cho các role chỉ định (dùng kèm `@UseGuards(RolesGuard)`). */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
