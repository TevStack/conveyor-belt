"use client";

import { useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { createApi } from "@/lib/belt/data";
import { MARKUP } from "@/lib/belt/markup";
import { startBelt } from "@/lib/belt/engine";

export default function Belt({ me }) {
  const ref = useRef(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = MARKUP;
    const stop = startBelt({ api: createApi(supabase), mePerson: me });
    return () => {
      stop();
      if (ref.current) ref.current.innerHTML = "";
    };
  }, [supabase, me.id, me.role]);

  return <div ref={ref} />;
}
