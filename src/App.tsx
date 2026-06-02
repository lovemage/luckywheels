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
  color: 'violet' | 'cream';
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
  { id: 1, rank: '頭獎', name: '旗艦手機', detail: 'Grand Prize', stock: 1, weight: 2, color: 'violet', icon: '📱', enabled: true },
  { id: 2, rank: '二獎', name: '藍牙耳機', detail: 'Premium Audio', stock: 5, weight: 6, color: 'cream', icon: '🎧', enabled: true },
  { id: 3, rank: '三獎', name: '超商禮券', detail: '500 元', stock: 30, weight: 16, color: 'violet', icon: '🎟️', enabled: true },
  { id: 4, rank: '四獎', name: 'LINE POINTS', detail: '100 點', stock: 80, weight: 24, color: 'cream', icon: '🟢', enabled: true },
  { id: 5, rank: '五獎', name: '咖啡兌換券', detail: '任選一杯', stock: 120, weight: 24, color: 'cream', icon: '☕', enabled: true },
  { id: 6, rank: '六獎', name: '精美小禮物', detail: '限量周邊', stock: 200, weight: 20, color: 'violet', icon: '🎁', enabled: true },
  { id: 7, rank: '七獎', name: '謝謝參加', detail: '再接再厲', stock: 9999, weight: 8, color: 'cream', icon: '🙂', enabled: true },
];

const packages = [
  { id: 1, title: '單次試手氣', points: 100, draws: 1, tag: '快速' },
  { id: 2, title: '人氣五連抽', points: 450, draws: 5, tag: '省 50' },
  { id: 3, title: '豪華十連抽', points: 850, draws: 10, tag: '推薦' },
];

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
  const colors = {
    violet: '#9f2df1',
    cream: '#ffedb5',
  };
  const step = 100 / prizes.length;

  return prizes
    .map((prize, index) => {
      const start = (index * step).toFixed(4);
      const end = ((index + 1) * step).toFixed(4);
      return `${colors[prize.color]} ${start}% ${end}%`;
    })
    .join(', ');
}

function dividerAngles(total: number) {
  return Array.from({ length: total }, (_, index) => (360 / total) * index);
}

export function App() {
  const [view, setView] = useState<'wheel' | 'exchange' | 'ranking' | 'rules' | 'mine'>('wheel');
  const [points, setPoints] = useState(1280);
  const [draws, setDraws] = useState(5);
  const [totalDraws, setTotalDraws] = useState(28);
  const [prizes, setPrizes] = useState(initialPrizes);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [lastPrize, setLastPrize] = useState<Prize | null>(null);
  const [wonPrizes, setWonPrizes] = useState<WonPrize[]>([
    { id: 101, name: '咖啡兌換券', time: '2026/06/01 19:42', status: '待領取' },
    { id: 102, name: 'LINE POINTS 100 點', time: '2026/05/30 14:11', status: '已領取' },
  ]);

  const activePrizes = useMemo(() => prizes.filter((prize) => prize.enabled), [prizes]);

  const spin = () => {
    if (spinning || draws <= 0) return;

    const result = pickPrize(prizes);
    const index = activePrizes.findIndex((prize) => prize.id === result.id);
    const segmentSize = 360 / activePrizes.length;
    const targetCenter = index * segmentSize + segmentSize / 2;
    const nextRotation = rotation + 1440 + (360 - targetCenter);

    setSpinning(true);
    setDraws((value) => value - 1);
    setTotalDraws((value) => value + 1);
    setRotation(nextRotation);

    window.setTimeout(() => {
      setSpinning(false);
      setLastPrize(result);
      if (result.rank !== '七獎') {
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

  const exchange = (pack: (typeof packages)[number]) => {
    if (points < pack.points) return;
    setPoints((value) => value - pack.points);
    setDraws((value) => value + pack.draws);
    setView('wheel');
  };

  const updatePrize = (id: number, patch: Partial<Prize>) => {
    setPrizes((current) => current.map((prize) => (prize.id === id ? { ...prize, ...patch } : prize)));
  };

  const addPrize = () => {
    const nextId = Math.max(...prizes.map((prize) => prize.id)) + 1;
    setPrizes((current) => [
      ...current,
      {
        id: nextId,
        rank: `${nextId} 獎`,
        name: '新獎品',
        detail: '請填寫說明',
        stock: 10,
        weight: 10,
        color: nextId % 2 === 0 ? 'cream' : 'violet',
        icon: '✨',
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
              <span>您好，LINE 會員</span>
            </div>
            <span className="vip">VIP 3</span>
            <dl>
              <div>
                <dt>點數餘額</dt>
                <dd>{points.toLocaleString()}</dd>
              </div>
              <div>
                <dt>可抽獎次數</dt>
                <dd>{draws} 次</dd>
              </div>
            </dl>
          </aside>
        </header>

        {view === 'wheel' && (
          <section className="wheel-screen">
            <Wheel
              prizes={activePrizes}
              rotation={rotation}
              spinning={spinning}
              onSpin={spin}
              disabled={spinning || draws <= 0}
            />
            <button className="primary-cta" onClick={spin} disabled={spinning || draws <= 0}>
              <Gift size={34} />
              <span>{spinning ? '抽獎中' : draws > 0 ? '立即抽獎' : '請先兌換次數'}</span>
              <small>消耗 1 次抽獎機會</small>
            </button>
            <button className="exchange-link" onClick={() => setView('exchange')}>
              用點數兌換抽獎次數
            </button>
          </section>
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
          <TabButton active={view === 'ranking'} icon={<Trophy />} label="排行" onClick={() => setView('ranking')} />
          <TabButton active={view === 'rules'} icon={<LayoutList />} label="規則" onClick={() => setView('rules')} />
          <TabButton active={view === 'mine'} icon={<Gift />} label="獎品" onClick={() => setView('mine')} />
        </nav>

        {lastPrize && (
          <div className="result-toast">
            <Sparkles size={22} />
            <span>
              抽中 <b>{lastPrize.rank}</b>，{lastPrize.name}
            </span>
            <button onClick={() => setLastPrize(null)}>知道了</button>
          </div>
        )}
      </section>

      <AdminConsole
        points={points}
        draws={draws}
        totalDraws={totalDraws}
        prizes={prizes}
        setPoints={setPoints}
        setDraws={setDraws}
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
  onSpin,
  disabled,
}: {
  prizes: Prize[];
  rotation: number;
  spinning: boolean;
  onSpin: () => void;
  disabled: boolean;
}) {
  return (
    <div className="wheel-wrap">
      <img className="wheel-frame" src="/assets/wheel-frame.png" alt="" aria-hidden="true" />
      <div className="wheel" style={{ transform: `rotate(${rotation}deg)` }}>
        <div
          className="wheel-face"
          style={{ '--segments': wheelGradient(prizes) } as React.CSSProperties}
          aria-hidden="true"
        >
          {dividerAngles(prizes.length).map((angle) => (
            <span className="segment-divider-line" key={angle} style={{ '--line-angle': `${angle}deg` } as React.CSSProperties} />
          ))}
        </div>
        {prizes.map((prize, index) => {
          const angle = (360 / prizes.length) * index + 360 / prizes.length / 2;
          return (
            <div
              className={`prize-label ${prize.color === 'violet' ? 'on-violet' : 'on-cream'}`}
              key={prize.id}
              style={{ transform: `rotate(${angle}deg) translateY(var(--label-radius)) rotate(${-angle}deg)` }}
            >
              <div className="prize-content">
                <strong>{prize.rank}</strong>
                <span>{prize.name}</span>
                <small>{prize.detail}</small>
                {prize.image ? <img src={prize.image} alt="" /> : <b>{prize.icon}</b>}
              </div>
            </div>
          );
        })}
      </div>
      <button className={`hub ${spinning ? 'is-spinning' : ''}`} aria-label="立即抽獎" onClick={onSpin} disabled={disabled}>
        <span />
      </button>
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
  draws,
  totalDraws,
  prizes,
  setPoints,
  setDraws,
  updatePrize,
  addPrize,
  uploadPrizeImage,
}: {
  points: number;
  draws: number;
  totalDraws: number;
  prizes: Prize[];
  setPoints: React.Dispatch<React.SetStateAction<number>>;
  setDraws: React.Dispatch<React.SetStateAction<number>>;
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
          <span>點數餘額</span>
          <strong>{points.toLocaleString()}</strong>
          <small>Admin 可手動儲值</small>
        </article>
        <article>
          <span>抽獎次數</span>
          <strong>{draws}</strong>
          <small>累計 {totalDraws} 次</small>
        </article>
      </section>

      <section className="admin-tools">
        <div>
          <h3>手動儲值</h3>
          <p>正式版會寫入點數流水與操作者。</p>
        </div>
        <button onClick={() => setPoints((value) => value + 500)}>
          <Plus size={18} />
          加 500 點
        </button>
        <button onClick={() => setDraws((value) => value + 1)}>
          <Plus size={18} />
          加 1 次
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
