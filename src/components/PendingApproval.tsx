import type { MeProfile } from '../state/session.js';

export function PendingApproval({ me }: { me: MeProfile }) {
  return (
    <main className="onboarding pending-approval">
      <h1>等待開啟會員</h1>
      <p>將此畫面截圖給管理員以開啟會員</p>
      <dl>
        <div>
          <dt>LINE 名稱</dt>
          <dd>{me.displayName}</dd>
        </div>
        <div>
          <dt>娛樂城會員編號</dt>
          <dd>{me.entertainmentMemberCode}</dd>
        </div>
      </dl>
    </main>
  );
}
