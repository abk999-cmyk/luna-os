import { useState, useMemo } from 'react';
import { PrimitiveProps } from './types';
import '../../styles/primitives/data-table.css';

/** Sortable, searchable, paginated data table. */
export function DataTable({ id, props, onEvent }: PrimitiveProps) {
  const headers: string[] = props.headers || [];
  const rows: any[][] | Record<string, any>[] = props.rows || [];
  const sortable = props.sortable ?? false;
  const searchable = props.searchable ?? false;
  const selectable = props.selectable ?? false;
  const pageSize = props.pagination?.pageSize || 0;
  const density = props.density || 'normal';

  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  // Normalize rows to arrays if they're objects
  const normalizedRows = useMemo(() => {
    return rows.map((row: any) => {
      if (Array.isArray(row)) return row;
      return headers.map((h: string) => row[h] ?? row[h.toLowerCase()] ?? '');
    });
  }, [rows, headers]);

  // Filter
  const filtered = useMemo(() => {
    if (!searchQuery) return normalizedRows;
    const q = searchQuery.toLowerCase();
    return normalizedRows.filter((row: any[]) =>
      row.some((cell: any) => String(cell).toLowerCase().includes(q))
    );
  }, [normalizedRows, searchQuery]);

  // Sort
  const sorted = useMemo(() => {
    if (sortCol === null) return filtered;
    return [...filtered].sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir]);

  // Paginate
  const totalPages = pageSize > 0 ? Math.ceil(sorted.length / pageSize) : 1;
  const displayed = pageSize > 0 ? sorted.slice(page * pageSize, (page + 1) * pageSize) : sorted;

  const handleSort = (colIdx: number) => {
    if (!sortable) return;
    const newDir = sortCol === colIdx ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc';
    setSortCol(colIdx);
    setSortDir(newDir);
    onEvent('onSort', { column: headers[colIdx], direction: newDir });
  };

  const handleRowClick = (rowIdx: number, row: any[]) => {
    if (selectable) {
      const next = new Set(selectedRows);
      if (next.has(rowIdx)) next.delete(rowIdx); else next.add(rowIdx);
      setSelectedRows(next);
    }
    onEvent('onRowSelect', { rowIndex: rowIdx, rowData: row });
  };

  return (
    <div className={`luna-datatable luna-datatable--${density}`} id={id}>
      {searchable && (
        <div className="luna-datatable__search">
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
              onEvent('onSearch', { query: e.target.value });
            }}
            className="luna-datatable__search-input"
          />
        </div>
      )}
      <div className="luna-datatable__wrapper">
        <table className="luna-datatable__table">
          <thead>
            <tr>
              {headers.map((h: string, i: number) => (
                <th
                  key={i}
                  className={`luna-datatable__th ${sortable ? 'luna-datatable__th--sortable' : ''}`}
                  onClick={() => handleSort(i)}
                >
                  {h}
                  {sortCol === i && (
                    <span className="luna-datatable__sort-icon">
                      {sortDir === 'asc' ? ' ▲' : ' ▼'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((row: any[], rowIdx: number) => (
              <tr
                key={rowIdx}
                className={`luna-datatable__tr ${selectedRows.has(rowIdx) ? 'luna-datatable__tr--selected' : ''} ${selectable ? 'luna-datatable__tr--selectable' : ''}`}
                onClick={() => handleRowClick(rowIdx, row)}
              >
                {row.map((cell: any, cellIdx: number) => (
                  <td key={cellIdx} className="luna-datatable__td">
                    {String(cell)}
                  </td>
                ))}
              </tr>
            ))}
            {displayed.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="luna-datatable__empty">
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pageSize > 0 && totalPages > 1 && (
        <div className="luna-datatable__pagination">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span>{page + 1} / {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
