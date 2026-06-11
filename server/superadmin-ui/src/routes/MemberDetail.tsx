import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client.js';
import type { Site } from '../api/me.js';
import {
  fetchUser, approveUser, deleteUser, adjustPoints, setAccountType,
  setBlacklist, setEntertainmentCode, updateTestSettings, migrateMember,
  fetchPointsHistory, fetchDrawHistory,
} from '../api/users.js';
import { SiteBadge, AccountBadge } from '../components/SiteBadge.js';
import { drawTierLabel } from '../utils/drawLabel.js';

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function MemberDetail() {
  const params = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const site = (params.site === 'A' || params.site === 'B' ? params.site : null) as Site | null;
  const id = params.id ?? '';

  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [migrating, setMigrating] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['superadmin', 'user', site, id],
    queryFn: () => fetchUser(site!, id),
    enabled: !!site && !!id,
  });
  const pointsHistory = useQuery({
    queryKey: ['superadmin', 'user', site, id, 'points-history'],
    queryFn: () => fetchPointsHistory(site!, id),
    enabled: !!site && !!id,
  });
  const drawHistory = useQuery({
    queryKey: ['superadmin', 'user', site, id, 'draw-history'],
    queryFn: () => fetchDrawHistory(site!, id),
    enabled: !!site && !!id,
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ['superadmin', 'user', site, id] });
    qc.invalidateQueries({ queryKey: ['superadmin', 'users'] });
  }

  function run(p: Promise<unknown>, okText: string) {
    setMsg(null);
    return p.then(() => { setMsg({ kind: 'ok', text: okText }); refresh(); })
      .catch((e) => setMsg({ kind: 'err', text: (e as ApiError)?.message || '操作失敗' }));
  }

  if (!site) return <p className="sa-error">站別參數錯誤</p>;
  if (isLoading) return <p className="sa-loading">載入中…</p>;
  if (isError || !data) return <p className="sa-error">讀取失敗</p>;

  const u = data.user;
  const cs = data.crossSite;

  return (
    <section className="sa-page sa-detail">
      <div className="sa-detail-top">
        <Link to="/" className="sa-btn sa-btn--ghost sa-btn--sm">← 返回列表</Link>
        {msg && <span className={`sa-flash sa-flash--${msg.kind}`}>{msg.text}</span>}
      </div>

      <header className="sa-detail-head">
        {u.pictureUrl
          ? <img src={u.pictureUrl} alt="" className="sa-avatar sa-avatar--lg" referrerPolicy="no-referrer" />
          : <span className="sa-avatar sa-avatar--lg sa-avatar--blank" aria-hidden="true" />}
        <div>
          <h2>{u.nickname || u.displayName}</h2>
          <div className="sa-chips">
            <SiteBadge site={u.site} label={u.siteLabel} />
            <AccountBadge accountType={u.accountType} />
          </div>
          <p className="sa-sub">LINE：{u.displayName}　·　lineUserId：{u.lineUserId}</p>
          <p className="sa-sub">娛樂城編號：{u.entertainmentMemberCode ?? '（未綁定）'}　·　積分：{u.points}　·　抽獎：{u.lifetimeDrawCount}</p>
          <p className="sa-sub">註冊：{fmt(u.createdAt)}</p>
          {u.accountType === 'blacklisted' && u.blacklistReason && (
            <p className="sa-warn-inline">黑名單原因：{u.blacklistReason}</p>
          )}
        </div>
      </header>

      {(cs.sameLineUser || cs.sameEntertainmentCode) && (
        <div className="sa-warn">
          <strong>⚠ 跨站偵測：此人在「{cs.otherSiteLabel}」也有資料</strong>
          <ul>
            {cs.sameLineUser && (
              <li>
                同一個 LINE 帳號：
                <Link to={`/users/${cs.otherSite}/${cs.sameLineUser.id}`}>
                  {cs.sameLineUser.nickname || cs.sameLineUser.displayName}
                </Link>
                （{cs.sameLineUser.accountType}，編號 {cs.sameLineUser.entertainmentMemberCode ?? '—'}）
              </li>
            )}
            {cs.sameEntertainmentCode && (
              <li>
                相同娛樂城編號：
                <Link to={`/users/${cs.otherSite}/${cs.sameEntertainmentCode.id}`}>
                  {cs.sameEntertainmentCode.nickname || cs.sameEntertainmentCode.displayName}
                </Link>
                （{cs.sameEntertainmentCode.accountType}）
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="sa-cards">
        {u.accountType === 'pending' && (
          <Card title="審核">
            <button type="button" className="sa-btn" onClick={() => run(approveUser(site, id), '已允許會員')}>
              允許會員（pending → 正式）
            </button>
          </Card>
        )}

        {u.accountType !== 'pending' && u.accountType !== 'blacklisted' && (
          <Card title="帳號類型">
            <div className="sa-inline">
              <button type="button" className="sa-btn sa-btn--ghost"
                disabled={u.accountType === 'verified'}
                onClick={() => run(setAccountType(site, id, 'verified'), '已設為正式')}>設為正式</button>
              <button type="button" className="sa-btn sa-btn--ghost"
                disabled={u.accountType === 'test'}
                onClick={() => run(setAccountType(site, id, 'test'), '已設為測試')}>設為測試</button>
            </div>
          </Card>
        )}

        <BlacklistCard site={site} id={id} blacklisted={u.accountType === 'blacklisted'} run={run} />
        <PointsCard site={site} id={id} run={run} />
        <EntertainmentCodeCard site={site} id={id} current={u.entertainmentMemberCode} run={run} />

        {u.accountType === 'test' && (
          <TestSettingsCard site={site} id={id} skipCost={u.testSkipCost} forcePrizeId={u.testForcePrizeId} run={run} />
        )}

        <Card title="搬遷會員">
          <p className="sa-sub">
            把此會員（含 <strong>{u.points}</strong> 積分）搬到「{cs.otherSiteLabel}」，
            並<strong>刪除來源帳號</strong>。若對方站已有同一人會被擋下。
          </p>
          <button type="button" className="sa-btn" disabled={migrating}
            onClick={async () => {
              if (!window.confirm(
                `確定把「${u.nickname || u.displayName}」從「${u.siteLabel}」搬到「${cs.otherSiteLabel}」？\n` +
                `會帶走 ${u.points} 積分，並刪除「${u.siteLabel}」的來源帳號（含抽獎紀錄）。`,
              )) return;
              setMigrating(true);
              setMsg(null);
              try {
                const r = await migrateMember(site, id);
                qc.invalidateQueries({ queryKey: ['superadmin', 'users'] });
                nav('/', { replace: true, state: { flash: `已搬遷到 ${cs.otherSiteLabel}（${r.points} 積分）` } });
              } catch (e) {
                setMsg({ kind: 'err', text: (e as ApiError)?.message || '搬遷失敗' });
                setMigrating(false);
              }
            }}>
            {migrating ? '搬遷中…' : `搬遷到「${cs.otherSiteLabel}」`}
          </button>
        </Card>

        <Card title="刪除會員" danger>
          <p className="sa-sub">會連同抽獎紀錄一併刪除，無法復原。</p>
          <button type="button" className="sa-btn sa-btn--danger"
            onClick={() => {
              if (!window.confirm(`確定刪除「${u.nickname || u.displayName}」(${u.siteLabel})？此操作無法復原。`)) return;
              run(deleteUser(site, id), '已刪除').then(() => nav('/', { replace: true }));
            }}>
            刪除此會員
          </button>
        </Card>
      </div>

      <div className="sa-cards">
        <Card title="積分調整紀錄">
          {pointsHistory.data?.items.length
            ? (
              <ul className="sa-loglist">
                {pointsHistory.data.items.map((h) => (
                  <li key={h.id}>
                    <span className={h.delta >= 0 ? 'sa-pos' : 'sa-neg'}>{h.delta >= 0 ? `+${h.delta}` : h.delta}</span>
                    {' '}（{h.before ?? '—'} → {h.after ?? '—'}）
                    {h.reason ? `　${h.reason}` : ''}
                    <span className="sa-sub">　{fmt(h.createdAt)}{h.adminUser ? `　by ${h.adminUser.email}` : ''}</span>
                  </li>
                ))}
              </ul>
            )
            : <p className="sa-sub">沒有紀錄</p>}
        </Card>

        <Card title="抽獎紀錄">
          {drawHistory.data?.items.length
            ? (
              <ul className="sa-loglist">
                {drawHistory.data.items.map((r) => (
                  <li key={r.redemption.id}>
                    <strong>{r.redemption.code}</strong>（{drawTierLabel(r.redemption.tier, r.redemption.tierDraws)}・{r.redemption.status}）
                    <span className="sa-sub">　{fmt(r.redemption.createdAt)}</span>
                    <div className="sa-sub">{r.draws.map((d) => `${d.prize.name}${d.winningCashAmount ? `(+${d.winningCashAmount})` : ''}`).join('、')}</div>
                  </li>
                ))}
              </ul>
            )
            : <p className="sa-sub">沒有紀錄</p>}
        </Card>
      </div>
    </section>
  );
}

function Card({ title, children, danger }: { title: string; children: ReactNode; danger?: boolean }) {
  return (
    <div className={`sa-card${danger ? ' sa-card--danger' : ''}`}>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function BlacklistCard({ site, id, blacklisted, run }: {
  site: Site; id: string; blacklisted: boolean; run: (p: Promise<unknown>, ok: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState('');
  return (
    <Card title="黑名單">
      {blacklisted
        ? (
          <button type="button" className="sa-btn sa-btn--ghost"
            onClick={() => run(setBlacklist(site, id, { blacklist: false, restoreTo: 'verified' }), '已解除黑名單')}>
            解除黑名單（恢復為正式）
          </button>
        )
        : (
          <>
            <input className="sa-input" placeholder="原因（必填）" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button type="button" className="sa-btn sa-btn--danger" disabled={!reason.trim()}
              onClick={() => run(setBlacklist(site, id, { blacklist: true, reason: reason.trim() }), '已加入黑名單').then(() => setReason(''))}>
              加入黑名單
            </button>
          </>
        )}
    </Card>
  );
}

function PointsCard({ site, id, run }: {
  site: Site; id: string; run: (p: Promise<unknown>, ok: string) => Promise<unknown>;
}) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const n = Number(delta);
  const valid = Number.isInteger(n) && n !== 0;
  return (
    <Card title="積分調整">
      <div className="sa-inline">
        <input className="sa-input sa-input--sm" type="number" placeholder="±數量" value={delta} onChange={(e) => setDelta(e.target.value)} />
        <input className="sa-input" placeholder="原因（選填）" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <button type="button" className="sa-btn" disabled={!valid}
        onClick={() => run(adjustPoints(site, id, { delta: n, reason: reason.trim() || undefined }), '已調整積分').then(() => { setDelta(''); setReason(''); })}>
        套用
      </button>
    </Card>
  );
}

function EntertainmentCodeCard({ site, id, current, run }: {
  site: Site; id: string; current: string | null; run: (p: Promise<unknown>, ok: string) => Promise<unknown>;
}) {
  const [code, setCode] = useState(current ?? '');
  const [reason, setReason] = useState('');
  return (
    <Card title="娛樂城編號">
      <div className="sa-inline">
        <input className="sa-input" placeholder="編號（清空＝解除綁定）" value={code} onChange={(e) => setCode(e.target.value)} />
        <input className="sa-input" placeholder="原因（必填）" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <button type="button" className="sa-btn" disabled={!reason.trim()}
        onClick={() => run(setEntertainmentCode(site, id, { code: code.trim() || null, reason: reason.trim() }), '已更新編號').then(() => setReason(''))}>
        更新
      </button>
    </Card>
  );
}

function TestSettingsCard({ site, id, skipCost, forcePrizeId, run }: {
  site: Site; id: string; skipCost: boolean; forcePrizeId: string | null;
  run: (p: Promise<unknown>, ok: string) => Promise<unknown>;
}) {
  const [prizeId, setPrizeId] = useState(forcePrizeId ?? '');
  return (
    <Card title="測試設定">
      <label className="sa-check">
        <input type="checkbox" checked={skipCost}
          onChange={(e) => run(updateTestSettings(site, id, { testSkipCost: e.target.checked }), '已更新測試設定')} />
        抽獎不扣積分
      </label>
      <div className="sa-inline">
        <input className="sa-input" placeholder="強制中獎 prizeId（清空＝取消）" value={prizeId} onChange={(e) => setPrizeId(e.target.value)} />
        <button type="button" className="sa-btn sa-btn--ghost"
          onClick={() => run(updateTestSettings(site, id, { testForcePrizeId: prizeId.trim() || null }), '已更新強制獎品')}>
          套用
        </button>
      </div>
    </Card>
  );
}
