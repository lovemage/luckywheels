import type { ReactNode } from 'react';

export function Table<T>({ rows, columns, rowKey }: {
  rows: T[];
  columns: { header: string; cell: (row: T) => ReactNode }[];
  rowKey: (row: T) => string;
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.header} style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: 8 }}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={rowKey(r)}>
            {columns.map((c) => (
              <td key={c.header} style={{ borderBottom: '1px solid #eee', padding: 8 }}>
                {c.cell(r)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
