import Button from './Button';

/** Page footer for server-paginated lists: "1–25 of 312" plus Prev / Next. */
export default function Pagination({
  page,
  pageSize,
  total,
  onPage,
  className = '',
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  if (total <= pageSize && page === 1) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  return (
    <div className={`flex items-center justify-between gap-3 text-xs text-muted-foreground ${className}`}>
      <span className="tabular-nums">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span className="px-2 tabular-nums">
          {page} / {pages}
        </span>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
