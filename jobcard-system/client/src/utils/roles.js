// Management roles: a manager can do everything an admin can except job
// costing and the labour rates/overtime settings (money stays admin-only).
export const MANAGEMENT_ROLES = ['admin', 'manager'];
export const isManagement = (user) => MANAGEMENT_ROLES.includes(user?.role);
