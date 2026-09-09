/**
 * A compact figures table for the dashboards.
 *
 * Scrolls inside its own container rather than pushing the page sideways, which
 * matters because these are read on phones as often as on desks. Numbers are
 * right-aligned so digits line up and magnitudes are comparable at a glance.
 */
export function StatTable({
  columns,
  rows,
  empty,
}: {
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Record<string, React.ReactNode>[];
  empty: string;
}) {
  if (!rows.length) {
    return <p className="mt-3 text-meta text-muted">{empty}</p>;
  }

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-hairline">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`py-2 text-meta font-medium text-muted ${column.numeric ? "text-right" : ""}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-hairline last:border-b-0">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`py-2.5 align-top text-meta text-ink ${column.numeric ? "text-right tabular-nums" : ""}`}
                >
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
