// 資料載入中的骨架畫面：取代單行「載入中…」，讓版面先出現、資料回來時不跳動。

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <section className="member-detail-card member-detail-card--wide admin-skeleton-card" aria-busy="true" aria-label="載入中">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="admin-skeleton-row">
          <span className="admin-skeleton-bar" style={{ width: '18%' }} />
          <span className="admin-skeleton-bar" style={{ width: '32%' }} />
          <span className="admin-skeleton-bar" style={{ width: '14%' }} />
          <span className="admin-skeleton-bar" style={{ width: '22%' }} />
        </div>
      ))}
    </section>
  );
}

export function PageSkeleton() {
  return (
    <div className="member-detail-page" aria-busy="true" aria-label="載入中">
      <div className="member-detail-card admin-skeleton-card">
        <span className="admin-skeleton-bar admin-skeleton-bar--title" style={{ width: '28%' }} />
        <span className="admin-skeleton-bar" style={{ width: '56%' }} />
      </div>
      <div className="member-detail-grid">
        {[0, 1].map((i) => (
          <div key={i} className="member-detail-card admin-skeleton-card">
            <span className="admin-skeleton-bar admin-skeleton-bar--title" style={{ width: '36%' }} />
            <span className="admin-skeleton-bar" style={{ width: '100%' }} />
            <span className="admin-skeleton-bar" style={{ width: '82%' }} />
            <span className="admin-skeleton-bar" style={{ width: '64%' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
