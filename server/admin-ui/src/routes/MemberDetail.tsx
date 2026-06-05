import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchUser } from '../api/users.js';
import { AccountTypeBadge } from '../components/AccountTypeBadge.js';

export function MemberDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', id],
    queryFn: () => fetchUser(id!),
    enabled: Boolean(id),
  });
  if (isLoading || !data) return <p>載入中…</p>;
  return (
    <section>
      <h1>{data.nickname ?? '(未填暱稱)'}　<AccountTypeBadge type={data.accountType} /></h1>
      <dl>
        <dt>LINE 名</dt><dd>{data.displayName}</dd>
        <dt>lineUserId</dt><dd>{data.lineUserId}</dd>
        <dt>娛樂城會員編號</dt><dd>{data.entertainmentMemberCode ?? '—'}</dd>
        <dt>積分</dt><dd>{data.points}</dd>
        <dt>累計抽獎</dt><dd>{data.lifetimeDrawCount}</dd>
      </dl>
      {data.accountType === 'test' && (
        <section>
          <h2>測試帳號設定</h2>
          <p>testSkipCost：{String(data.testSkipCost)}</p>
          <p>testForcePrizeId：{data.testForcePrizeId ?? '—'}</p>
        </section>
      )}
    </section>
  );
}
