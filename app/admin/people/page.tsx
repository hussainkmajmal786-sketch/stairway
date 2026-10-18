import { requireAdmin } from "@/lib/admin/auth";
import { listAdminSocieties } from "@/lib/admin/societies";
import { AnonymiseForm } from "@/components/admin/AnonymiseForm";
import { InviteForm } from "@/components/admin/InviteForm";
import { RoleList, type InviteItem, type RoleItem } from "@/components/admin/RoleList";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });

export default async function AdminPeoplePage() {
  const { ctx, db } = await requireAdmin("/admin/people", { kind: "super" });
  const societies = await listAdminSocieties(db, ctx);
  const socName = new Map(societies.map((s) => [s.id, s.shortName]));

  const [{ data: roleRows }, { data: inviteRows }] = await Promise.all([
    db.from("admin_roles").select("id, user_id, role, society_id").order("created_at").limit(100),
    db.from("admin_invites").select("id, email, role, society_id, expires_at").is("accepted_at", null).is("revoked_at", null)
      .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(100),
  ]);
  const ids = [...new Set((roleRows ?? []).map((r) => r.user_id))];
  const { data: profs } = ids.length ? await db.from("profiles").select("id, handle").in("id", ids) : { data: [] };
  const handle = new Map((profs ?? []).map((p) => [p.id, p.handle]));

  const roles: RoleItem[] = (roleRows ?? []).map((r) => ({
    id: r.id, label: handle.get(r.user_id) ?? r.user_id.slice(0, 8), role: r.role,
    society: r.society_id ? (socName.get(r.society_id) ?? "a society") : "", isSelf: r.user_id === ctx.userId,
  }));
  const invites: InviteItem[] = (inviteRows ?? []).map((i) => ({
    id: i.id, email: i.email, role: i.role, society: i.society_id ? (socName.get(i.society_id) ?? "a society") : "", expires: day(i.expires_at),
  }));

  return (
    <div className="grid gap-8">
      <header>
        <p className="mono font-bold text-ink-3">Admin</p>
        <h1 className="text-3xl font-semibold md:text-4xl">Admins</h1>
        <p className="mt-2 text-ink-3">Roles are created only by accepting an invite. There is no email: copy the link and send it yourself.</p>
      </header>
      <RoleList roles={roles} invites={invites} />
      <InviteForm societies={societies.map((s) => ({ id: s.id, name: s.name }))} />
      <AnonymiseForm />
    </div>
  );
}
