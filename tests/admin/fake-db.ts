export type Res = { data: unknown; error: unknown; count?: number };
export interface Call { table?: string; op: string; args: unknown[] }

/**
 * Fake Supabase client. `script` supplies results per "table.op" or "rpc.<name>" (arrays are consumed in order, the
 * last one repeats). Every query-builder call and rpc is recorded in `calls`.
 */
export function fakeDb(script: Record<string, Res | Res[]> = {}) {
  const calls: Call[] = [];
  const next = (key: string): Res => {
    const s = script[key];
    if (Array.isArray(s)) return s.length > 1 ? (s.shift() as Res) : s[0];
    return s ?? { data: [], error: null };
  };
  const from = (table: string) => {
    let op = "select";
    const b: Record<string, unknown> = {};
    const chain = (name: string) => (...args: unknown[]) => {
      if (name === "insert" || name === "update" || name === "delete" || name === "upsert") op = name;
      calls.push({ table, op: name, args });
      return b;
    };
    for (const m of ["select", "insert", "update", "upsert", "delete", "eq", "neq", "order", "limit", "in", "or", "is", "not", "gt", "range", "like", "ilike", "gte", "lt", "lte"]) {
      b[m] = chain(m);
    }
    const settle = () => Promise.resolve(next(`${table}.${op}`));
    b.maybeSingle = () => settle();
    b.single = () => settle();
    b.then = (res: (v: Res) => unknown, rej: (e: unknown) => unknown) => settle().then(res, rej);
    return b;
  };
  const rpc = (name: string, args: unknown) => {
    calls.push({ op: "rpc", args: [name, args] });
    return Promise.resolve(next(`rpc.${name}`));
  };
  return { db: { from, rpc }, calls };
}

export const rpcCalls = (calls: Call[], name?: string) =>
  calls.filter((c) => c.op === "rpc" && (name === undefined || c.args[0] === name));
export const wrote = (calls: Call[], table: string, op: string) => calls.filter((c) => c.table === table && c.op === op);
