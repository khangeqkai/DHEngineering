// What each stored role is called on screen (the stored values stay user/manager/admin).
// The one list: the Users page, Settings and the activity wording all read it.
export const ROLE_LABELS = { user: 'Worker', manager: 'Manager', admin: 'Admin' };

export const roleLabel = (role) => ROLE_LABELS[role] || role || '';
