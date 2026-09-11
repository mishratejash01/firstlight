import { createClient } from "@/lib/supabase/server";
import { formatTimeAgo } from "@/lib/format/datetime";

/**
 * The model key pool, key by key.
 *
 * Keys are shown by provider and the last four characters only; the table
 * behind this never holds a key. What matters here is which pools are
 * carrying the load, which keys the providers are refusing, and for how
 * long — the questions an operator asks when the desk goes quiet.
 */
export async function AiKeyHealth() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("ai_key_health")
    .select("key_id, provider, label, calls, errors, cooling_until, last_error, last_error_at, last_used_at")
    .order("provider")
    .order("label");

  if (!rows?.length) {
    return (
      <p className="mt-3 max-w-measure text-meta leading-relaxed text-muted">
        No key has been used yet. Rows appear here after the first model call.
      </p>
    );
  }

  const now = Date.now();

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-meta">
        <thead>
          <tr className="border-b border-hairline text-muted">
            <th className="py-2 pr-4 font-normal">Key</th>
            <th className="py-2 pr-4 font-normal">Calls</th>
            <th className="py-2 pr-4 font-normal">Errors</th>
            <th className="py-2 pr-4 font-normal">State</th>
            <th className="py-2 font-normal">Last error</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const cooling = row.cooling_until && new Date(row.cooling_until).getTime() > now;
            return (
              <tr key={row.key_id} className="border-b border-hairline align-top">
                <td className="py-2 pr-4 text-ink">{row.label}</td>
                <td className="py-2 pr-4 text-ink">{row.calls}</td>
                <td className="py-2 pr-4 text-muted">{row.errors}</td>
                <td className={cooling ? "py-2 pr-4 text-signal" : "py-2 pr-4 text-muted"}>
                  {cooling
                    ? `Cooling until ${new Date(row.cooling_until as string).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                    : row.last_used_at
                      ? `Used ${formatTimeAgo(row.last_used_at)}`
                      : "Idle"}
                </td>
                <td className="max-w-md py-2 text-muted">
                  {row.last_error ? (
                    <>
                      {row.last_error.slice(0, 120)}
                      {row.last_error_at ? ` · ${formatTimeAgo(row.last_error_at)}` : ""}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
