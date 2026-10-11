// Pure capability helpers (importable from client and server code). The server derives the rows from
// `admin_roles` on every request; nothing here is a security boundary by itself.

export interface AdminRoleRow {
  role: "super_admin" | "society_admin";
  society_id: string | null;
}

export interface AdminCaps {
  isSuper: boolean;
  societyIds: string[];
}

export function adminCaps(rows: readonly AdminRoleRow[]): AdminCaps {
  const isSuper = rows.some((r) => r.role === "super_admin");
  const ids = new Set<string>();
  for (const r of rows) if (r.role === "society_admin" && r.society_id) ids.add(r.society_id);
  return { isSuper, societyIds: [...ids] };
}

export function canManageSociety(caps: AdminCaps, societyId: string): boolean {
  return caps.isSuper || caps.societyIds.includes(societyId);
}
