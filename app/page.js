import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Belt from "./belt";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Link this sign-in to the matching person on the People list (by email).
  const { data: me } = await supabase.rpc("link_me");

  if (!me || !me.id) {
    return (
      <main className="gate">
        <div className="card">
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "var(--navy)" }}>You're not on the belt yet</h1>
          <p>
            You're signed in as <b>{user.email}</b>, but that email isn't on the People list. Ask Tom or Morgan to add
            you, then sign in again.
          </p>
          <form action="/auth/signout" method="post">
            <button className="btn btn-n" type="submit">Sign out</button>
          </form>
        </div>
      </main>
    );
  }

  return <Belt me={{ id: me.id, name: me.name, role: me.role, dept: me.dept }} />;
}
