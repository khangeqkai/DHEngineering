import permissions from '../../../server/src/shared/permissions.json';

// One name per permission, and the roles that carry it — read from the same
// JSON the server reads (server/src/shared/permissions.json), so a role's
// access can never drift between the two. Meaning of each name is documented
// in CLAUDE.md's Roles and permissions section.
export function can(user, permission) {
  const roles = permissions[permission];
  if (!Array.isArray(roles)) throw new Error(`Unknown permission: ${permission}`);
  return roles.includes(user?.role);
}

// Management roles: a manager can do everything an admin can except job
// costing and the labour rates/overtime settings (money stays admin-only).
export const isManagement = (user) => can(user, 'management');
