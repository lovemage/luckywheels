import {
  Gift,
  LayoutList,
  Medal,
  Plus,
  ReceiptText,
  RotateCw,
  Sparkles,
  Trophy,
  Upload,
  Wallet,
} from 'lucide-react';
import { ChangeEvent, useMemo, useState } from 'react';

type Prize = {
  id: number;
  rank: string;
  name: string;
  detail: string;
  stock: number;
  weight: number;
  segmentColor: string;
  textColor: string;
  icon: string;
  image?: string;
  enabled: boolean;
};

type WonPrize = {
  id: number;
  name: string;
  time: string;
  status: '待領取' | '已領取';
};

const initialPrizes: Prize[] = [
  { id: 1, rank: '頭獎', name: '最高彩金', detail: '', stock: 1, weight: 2, segmentColor: '#d92b3a', textColor: '#fff5d6', icon: '💰', enabled: true },
  { id: 2, rank: '二獎', name: '彩金', detail: '5,000 元', stock: 5, weight: 6, segmentColor: '#ec8a26', textColor: '#fff5d6', icon: '💰', enabled: true },
  { id: 3, rank: '三獎', name: '彩金', detail: '1,000 元', stock: 30, weight: 14, segmentColor: '#c98612', textColor: '#fff5d6', icon: '💰', enabled: true },
  { id: 4, rank: '四獎', name: '彩金', detail: '500 元', stock: 80, weight: 22, segmentColor: '#38a86e', textColor: '#fff5d6', icon: '💰', enabled: true },
  { id: 5, rank: '五獎', name: '彩金', detail: '100 元', stock: 200, weight: 26, segmentColor: '#2e7cd9', textColor: '#fff5d6', icon: '💰', enabled: true },
  { id: 6, rank: '六獎', name: '謝謝參加', detail: '', stock: 9999, weight: 30, segmentColor: '#9b3eb8', textColor: '#fff5d6', icon: '💰', enabled: true },
];

const packages = [
  { id: 1, title: '單次試手氣', points: 100, draws: 1, tag: '快速' },
  { id: 2, title: '人氣五連抽', points: 450, draws: 5, tag: '省 50' },
  { id: 3, title: '豪華十連抽', points: 850, draws: 10, tag: '推薦' },
];

const POINT_THRESHOLDS = [
  { points: 6, draws: 1 },
  { points: 15, draws: 3 },
  { points: 25, draws: 5 },
  { points: 35, draws: 7 },
  { points: 48, draws: 10 },
] as const;

const SINGLE_DRAW_COST = POINT_THRESHOLDS[0].points;
const MULTI_DRAW_COST = POINT_THRESHOLDS[POINT_THRESHOLDS.length - 1].points;

function availableDrawsFor(currentPoints: number): number {
  let draws = 0;
  for (const t of POINT_THRESHOLDS) {
    if (currentPoints >= t.points) draws = t.draws;
    else break;
  }
  return draws;
}

function segmentPath(index: number, total: number) {
  const radius = 49;
  const center = 50;
  const start = -90 + (360 / total) * index;
  const end = -90 + (360 / total) * (index + 1);
  const toPoint = (angle: number) => {
    const rad = (Math.PI / 180) * angle;
    return [center + radius * Math.cos(rad), center + radius * Math.sin(rad)];
  };
  const [x1, y1] = toPoint(start);
  const [x2, y2] = toPoint(end);
  const largeArc = 360 / total > 180 ? 1 : 0;

  return `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function pickPrize(prizes: Prize[]) {
  const active = prizes.filter((prize) => prize.enabled && prize.stock > 0);
  const totalWeight = active.reduce((sum, prize) => sum + prize.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const prize of active) {
    roll -= prize.weight;
    if (roll <= 0) return prize;
  }

  return active[active.length - 1] ?? prizes[0];
}

function wheelGradient(prizes: Prize[]) {
  const step = 100 / prizes.length;

  return prizes
    .map((prize, index) => {
      const start = (index * step).toFixed(4);
      const end = ((index + 1) * step).toFixed(4);
      return `${prize.segmentColor} ${start}% ${end}%`;
    })
    .join(', ');
}

export function App() {
  const [view, setView] = useState<'wheel' | 'exchange' | 'ranking' | 'rules' | 'mine'>('wheel');
  const [points, setPoints] = useState(28);
  const [totalDraws, setTotalDraws] = useState(0);
  const [lastDrawCount, setLastDrawCount] = useState(1);
  const [selectedTierIndex, setSelectedTierIndex] = useState(0);
  const availableDraws = availableDrawsFor(points);
  const maxAffordableIndex = (() => {
    let i = -1;
    for (let k = 0; k < POINT_THRESHOLDS.length; k += 1) {
      if (POINT_THRESHOLDS[k].points <= points) i = k;
    }
    return i;
  })();
  const effectiveTierIndex = Math.min(selectedTierIndex, Math.max(maxAffordableIndex, 0));
  const selectedTier = POINT_THRESHOLDS[effectiveTierIndex];
  const [prizes, setPrizes] = useState(initialPrizes);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [lastPrize, setLastPrize] = useState<Prize | null>(null);
  const [wonPrizes, setWonPrizes] = useState<WonPrize[]>([
    { id: 101, name: '咖啡兌換券', time: '2026/06/01 19:42', status: '待領取' },
    { id: 102, name: 'LINE POINTS 100 點', time: '2026/05/30 14:11', status: '已領取' },
  ]);

  const activePrizes = useMemo(() => prizes.filter((prize) => prize.enabled), [prizes]);

  const spinByTier = (tier: (typeof POINT_THRESHOLDS)[number]) => {
    if (spinning || points < tier.points) return;

    const result = pickPrize(prizes);
    const index = activePrizes.findIndex((prize) => prize.id === result.id);
    const segmentSize = 360 / activePrizes.length;
    const targetCenter = index * segmentSize;
    const nextRotation = rotation + 1440 + (360 - targetCenter);

    setSpinning(true);
    setPoints((value) => value - tier.points);
    setTotalDraws((value) => value + tier.draws);
    setRotation(nextRotation);
    setLastDrawCount(tier.draws);

    window.setTimeout(() => {
      setSpinning(false);
      setLastPrize(result);
      if (result.name !== '謝謝參加') {
        setWonPrizes((current) => [
          {
            id: Date.now(),
            name: `${result.rank} ${result.name}`,
            time: new Intl.DateTimeFormat('zh-TW', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date()),
            status: '待領取',
          },
          ...current,
        ]);
      }
    }, 4300);
  };

  const cycleTier = () => {
    if (spinning) return;
    const cyclable: number[] = [];
    POINT_THRESHOLDS.forEach((t, i) => {
      if (t.draws <= availableDraws) cyclable.push(i);
    });
    if (cyclable.length <= 1) return;
    const here = cyclable.indexOf(effectiveTierIndex);
    const next = cyclable[(here + 1) % cyclable.length] ?? 0;
    setSelectedTierIndex(next);
  };

  const exchange = (pack: (typeof packages)[number]) => {
    if (points < pack.points) return;
    setPoints((value) => value + pack.draws);
    setView('wheel');
  };

  const updatePrize = (id: number, patch: Partial<Prize>) => {
    setPrizes((current) => current.map((prize) => (prize.id === id ? { ...prize, ...patch } : prize)));
  };

  const addPrize = () => {
    const fallbackPalette = ['#d92b3a', '#ec8a26', '#f4cb3a', '#38a86e', '#2e7cd9', '#9b3eb8'];
    const nextId = Math.max(...prizes.map((prize) => prize.id)) + 1;
    const segmentColor = fallbackPalette[prizes.length % fallbackPalette.length];
    setPrizes((current) => [
      ...current,
      {
        id: nextId,
        rank: `${nextId} 獎`,
        name: '新獎品',
        detail: '請填寫說明',
        stock: 10,
        weight: 10,
        segmentColor,
        textColor: '#ffffff',
        icon: '💰',
        enabled: true,
      },
    ]);
  };

  const uploadPrizeImage = (id: number, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updatePrize(id, { image: String(reader.result) });
    reader.readAsDataURL(file);
  };

  return (
    <main className="showcase">
      <section className="phone-shell" aria-label="會員抽獎前台">
        <div className="stage-bg" />
        <div className="floating coin-a" />
        <div className="floating coin-b" />
        <div className="floating shard-a" />
        <div className="floating shard-b" />

        <header className="hero">
          <div className="title-lockup">
            <img className="logo-image" src="/assets/logo.png" alt="幸運輪盤 轉出你的幸運大獎" />
          </div>

          <aside className="member-card">
            <div className="avatar" />
            <div className="member-copy">
              <strong>會員專區</strong>
              <span>您好，會員</span>
            </div>
            <dl>
              <div>
                <dt>積分</dt>
                <dd>{points}</dd>
              </div>
              <div>
                <dt>可抽次數</dt>
                <dd>{availableDraws} 次</dd>
              </div>
              <div>
                <dt>累計抽獎次數</dt>
                <dd>{totalDraws} 次</dd>
              </div>
            </dl>
          </aside>
        </header>

        {view === 'wheel' && (
          <section className="wheel-screen">
            <Wheel prizes={activePrizes} rotation={rotation} spinning={spinning} />
          </section>
        )}

        {view === 'wheel' && (
          <div className="cta-row">
            <button
              className="primary-cta primary-cta--spin"
              onClick={() => spinByTier(selectedTier)}
              disabled={spinning || points < selectedTier.points}
            >
              <Gift size={24} />
              <span>
                {spinning
                  ? '抽獎中'
                  : selectedTier.draws === 1
                  ? '抽獎'
                  : `${selectedTier.draws} 連抽`}
              </span>
            </button>
            <button
              className="primary-cta primary-cta--cycle"
              onClick={cycleTier}
              disabled={spinning || availableDraws <= 1}
              aria-label="切換連抽次數"
            >
              <Sparkles size={22} />
            </button>
          </div>
        )}

        {view === 'exchange' && (
          <section className="panel-screen">
            <ScreenHeader icon={<Wallet />} title="兌換抽獎次數" subtitle={`目前可用 ${points.toLocaleString()} 點`} />
            <div className="package-list">
              {packages.map((pack) => (
                <button className="package-card" key={pack.id} onClick={() => exchange(pack)} disabled={points < pack.points}>
                  <span className="tag">{pack.tag}</span>
                  <strong>{pack.title}</strong>
                  <span>{pack.points.toLocaleString()} 點</span>
                  <b>{pack.draws} 次</b>
                </button>
              ))}
            </div>
          </section>
        )}

        {view === 'rules' && (
          <section className="panel-screen">
            <ScreenHeader icon={<ReceiptText />} title="活動規則" subtitle="正式版可由後台編輯文案" />
            <div className="rule-list">
              <p>每次抽獎消耗 1 次抽獎機會，結果由伺服器判定。</p>
              <p>中獎獎項會進入我的獎品，領取狀態由管理員更新。</p>
              <p>點數由後台儲值，會員可自行兌換抽獎次數。</p>
            </div>
          </section>
        )}

        {view === 'ranking' && (
          <section className="panel-screen">
            <ScreenHeader icon={<Trophy />} title="排行榜" subtitle="展示會員抽獎熱度" />
            <div className="win-list">
              {['陳**', '王**', '林**'].map((name, index) => (
                <article className="win-card" key={name}>
                  <Medal size={26} />
                  <div>
                    <strong>
                      第 {index + 1} 名 {name}
                    </strong>
                    <span>本期累計抽獎 {36 - index * 8} 次</span>
                  </div>
                  <em>{index === 0 ? '領先' : '追趕中'}</em>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === 'mine' && (
          <section className="panel-screen">
            <ScreenHeader icon={<Trophy />} title="我的獎品" subtitle={`${wonPrizes.length} 筆中獎紀錄`} />
            <div className="win-list">
              {wonPrizes.map((item) => (
                <article className="win-card" key={item.id}>
                  <Medal size={26} />
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.time}</span>
                  </div>
                  <em>{item.status}</em>
                </article>
              ))}
            </div>
          </section>
        )}

        <nav className="bottom-tabs">
          <TabButton active={view === 'wheel'} icon={<RotateCw />} label="輪盤" onClick={() => setView('wheel')} />
          <TabButton active={view === 'ranking'} icon={<Trophy />} label="排行榜" onClick={() => setView('ranking')} />
          <TabButton active={view === 'rules'} icon={<LayoutList />} label="活動規則" onClick={() => setView('rules')} />
          <TabButton active={view === 'mine'} icon={<Gift />} label="我的獎品" onClick={() => setView('mine')} />
        </nav>

        {lastPrize && (
          <div className="result-modal" role="dialog" aria-modal="true" aria-labelledby="result-modal-title">
            <button
              type="button"
              className="result-modal__backdrop"
              aria-label="關閉中獎彈窗"
              onClick={() => setLastPrize(null)}
            />
            <div className="result-modal__card">
              <Sparkles size={22} className="result-modal__sparkle result-modal__sparkle--a" />
              <Sparkles size={18} className="result-modal__sparkle result-modal__sparkle--b" />
              <h2 id="result-modal-title">
                恭喜中獎
                {lastDrawCount > 1 && <small className="result-modal__multi-tag">{lastDrawCount} 連抽結果</small>}
              </h2>
              <div
                className="result-modal__prize"
                style={{ background: lastPrize.segmentColor, color: lastPrize.textColor }}
              >
                {lastPrize.image ? <img src={lastPrize.image} alt="" /> : <span>{lastPrize.icon}</span>}
              </div>
              <strong>{lastPrize.rank}</strong>
              <p>
                {lastPrize.name}
                {lastPrize.detail ? `・${lastPrize.detail}` : ''}
              </p>
              <button type="button" className="result-modal__close" onClick={() => setLastPrize(null)}>
                知道了
              </button>
            </div>
          </div>
        )}
      </section>

      <AdminConsole
        points={points}
        availableDraws={availableDraws}
        totalDraws={totalDraws}
        prizes={prizes}
        setPoints={setPoints}
        updatePrize={updatePrize}
        addPrize={addPrize}
        uploadPrizeImage={uploadPrizeImage}
      />
    </main>
  );
}

function Wheel({
  prizes,
  rotation,
  spinning,
}: {
  prizes: Prize[];
  rotation: number;
  spinning: boolean;
}) {
  return (
    <div className="wheel-wrap">
      <img className="wheel-frame" src="/assets/wheel-frame.png" alt="" aria-hidden="true" />
      <div className="wheel" style={{ transform: `rotate(${rotation}deg)` }}>
        <div
          className="wheel-face"
          style={{ '--segments': wheelGradient(prizes) } as React.CSSProperties}
          aria-hidden="true"
        />
        {prizes.map((prize, index) => {
          const angle = (360 / prizes.length) * index;
          return (
            <div
              className="prize-label"
              key={prize.id}
              style={{
                transform: `rotate(${angle}deg) translateY(var(--label-radius)) rotate(${-(angle + rotation)}deg)`,
                color: prize.textColor,
              }}
            >
              <div className="prize-content">
                <strong>{prize.rank}</strong>
                <span>{prize.name}</span>
                {prize.detail && <small>{prize.detail}</small>}
                {prize.image ? <img src={prize.image} alt="" /> : <b>{prize.icon}</b>}
              </div>
            </div>
          );
        })}
      </div>
      <div className={`hub ${spinning ? 'is-spinning' : ''}`} aria-hidden="true">
        <span />
      </div>
    </div>
  );
}

function ScreenHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="screen-header">
      <div>{icon}</div>
      <span>{subtitle}</span>
      <h2>{title}</h2>
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function AdminConsole({
  points,
  availableDraws,
  totalDraws,
  prizes,
  setPoints,
  updatePrize,
  addPrize,
  uploadPrizeImage,
}: {
  points: number;
  availableDraws: number;
  totalDraws: number;
  prizes: Prize[];
  setPoints: React.Dispatch<React.SetStateAction<number>>;
  updatePrize: (id: number, patch: Partial<Prize>) => void;
  addPrize: () => void;
  uploadPrizeImage: (id: number, event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <aside className="admin-console" aria-label="Admin 後台展示">
      <div className="admin-heading">
        <span>Admin Console</span>
        <h2>會員與獎品管理</h2>
        <p>目前是前端假資料展示，正式版會接 LINE userId、點數流水與上傳儲存。</p>
      </div>

      <section className="admin-stats">
        <article>
          <span>會員</span>
          <strong>LINE 會員</strong>
          <small>U9f8a...demo</small>
        </article>
        <article>
          <span>積分</span>
          <strong>{points.toLocaleString()}</strong>
          <small>Admin 可手動派發</small>
        </article>
        <article>
          <span>抽獎次數</span>
          <strong>{availableDraws}</strong>
          <small>累計 {totalDraws} 次</small>
        </article>
      </section>

      <section className="admin-tools">
        <div>
          <h3>手動派發積分</h3>
          <p>正式版會寫入積分流水與操作者。</p>
        </div>
        <button onClick={() => setPoints((value) => value + SINGLE_DRAW_COST)}>
          <Plus size={18} />
          加 {SINGLE_DRAW_COST} 點
        </button>
        <button onClick={() => setPoints((value) => value + MULTI_DRAW_COST)}>
          <Plus size={18} />
          加 {MULTI_DRAW_COST} 點
        </button>
      </section>

      <section className="prize-editor">
        <div className="editor-title">
          <div>
            <span>Prize Builder</span>
            <h3>獎品與機率設定</h3>
          </div>
          <button onClick={addPrize}>
            <Plus size={18} />
            新增獎品
          </button>
        </div>

        <div className="prize-rows">
          {prizes.map((prize) => (
            <article className="prize-row" key={prize.id}>
              <div className="image-cell">
                {prize.image ? <img src={prize.image} alt="" /> : <span>{prize.icon}</span>}
                <label>
                  <Upload size={15} />
                  <input type="file" accept="image/*" onChange={(event) => uploadPrizeImage(prize.id, event)} />
                </label>
              </div>
              <input value={prize.rank} onChange={(event) => updatePrize(prize.id, { rank: event.target.value })} />
              <input value={prize.name} onChange={(event) => updatePrize(prize.id, { name: event.target.value })} />
              <input value={prize.detail} onChange={(event) => updatePrize(prize.id, { detail: event.target.value })} />
              <input
                type="number"
                min="0"
                value={prize.stock}
                onChange={(event) => updatePrize(prize.id, { stock: Number(event.target.value) })}
              />
              <input
                type="number"
                min="0"
                value={prize.weight}
                onChange={(event) => updatePrize(prize.id, { weight: Number(event.target.value) })}
              />
              <label className="switch">
                <input
                  type="checkbox"
                  checked={prize.enabled}
                  onChange={(event) => updatePrize(prize.id, { enabled: event.target.checked })}
                />
                <span />
              </label>
            </article>
          ))}
        </div>
      </section>
    </aside>
  );
}
