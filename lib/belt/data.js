// Supabase data layer for the belt.
// The app works in camelCase with "" for empty values; the database uses snake_case and nulls.

export const TABLES = [
  "projects",
  "actions",
  "updates",
  "milestones",
  "people",
  "departments",
  "absences",
  "decisions",
  "settings",
];

const SPECIAL_TO_DB = { order: "sort_order", from: "from_date", to: "to_date", by: "by_id" };
const SPECIAL_TO_APP = Object.fromEntries(Object.entries(SPECIAL_TO_DB).map(([a, b]) => [b, a]));
const READ_ONLY = new Set(["id", "log"]);

const snake = (k) => SPECIAL_TO_DB[k] || k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const camel = (k) => SPECIAL_TO_APP[k] || k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

export function toApp(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[camel(k)] = v;
  return out;
}

export function toDb(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (READ_ONLY.has(k) || v === undefined) continue;
    out[snake(k)] = v === "" ? null : v;
  }
  return out;
}

class DataError extends Error {
  constructor(error) {
    super(error.message);
    this.code = error.code === "42501" ? "forbidden" : error.code || "unknown";
  }
}

function check({ data, error }) {
  if (error) throw new DataError(error);
  return data;
}

// A small document-style API so the belt engine can stay the same shape as the prototype.
export function createApi(supabase) {
  return {
    async loadAll() {
      const results = await Promise.all(
        TABLES.map((t) => supabase.from(t).select("*"))
      );
      const out = {};
      TABLES.forEach((t, i) => {
        out[t] = check(results[i]).map(toApp);
      });
      return out;
    },
    async load(table) {
      return check(await supabase.from(table).select("*")).map(toApp);
    },
    doc(path) {
      const [table, id] = path.split("/");
      if (table === "meta") {
        return {
          set: async (value) => {
            const { updatedAt, updatedBy, ...rest } = value;
            check(
              await supabase
                .from("settings")
                .upsert({ key: id, value: rest, updated_at: new Date().toISOString(), updated_by: updatedBy || null })
            );
          },
        };
      }
      return {
        update: async (patch) => {
          check(await supabase.from(table).update(toDb(patch)).eq("id", id));
        },
        delete: async () => {
          check(await supabase.from(table).delete().eq("id", id));
        },
      };
    },
    collection(table) {
      return {
        add: async (row) => {
          const data = check(await supabase.from(table).insert(toDb(row)).select("id").single());
          return { id: data.id };
        },
      };
    },
    subscribe(onChange) {
      const channel = supabase.channel("belt-changes");
      for (const t of TABLES) {
        channel.on("postgres_changes", { event: "*", schema: "public", table: t }, () => onChange(t));
      }
      channel.subscribe();
      return () => supabase.removeChannel(channel);
    },
  };
}
