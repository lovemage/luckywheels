import { ChevronRight } from 'lucide-react';
import type { AssistantMe } from '../../api/assistant.js';
import type { AssistantView } from '../AssistantApp.js';
import { InkTitle } from '../InkTitle.js';

// 曜金規則：說明畫面上的數字怎麼看、助手怎麼排序。未開通也能看（讓會員先了解助手能提供什麼）。
// 措辭維持中立：數字是已發生的紀錄，不暗示中獎機率、預測或保證獲利。

interface Metric {
  id: string;
  name: string;
  weight: string;
  meaning: string;
  points: string[];
  example?: { label: string; lines: string[] };
}

const METRICS: Metric[] = [
  {
    id: 'unopened',
    name: '未開轉數',
    weight: '綜合分數比重 35%',
    meaning: '這台機台從上一次開出到現在，已經累積轉了幾轉還沒開出',
    points: [
      '數字越大，代表這台距離上一次開出越久',
      '可以搭配「前兩次開出間隔」一起看，知道這台近期大約隔多少轉開出一次',
      '助手會把每台的未開轉數跟同一款遊戲的所有機台比較，告訴你它多於多少比例的機台',
    ],
    example: {
      label: '對照範例',
      lines: ['前兩次分別隔 300 轉、500 轉開出，平均 400 轉', '目前未開 900 轉，已經超過這台近期的平均間隔'],
    },
  },
  {
    id: 'rtp',
    name: 'RTP 返還率',
    weight: '今日 RTP 比重 25% · 近 30 天 RTP 比重 20%',
    meaning: '機台派出的金額占玩家總下注的比例',
    points: [
      '今日 RTP 是今天到目前為止的返還率，下注量少的時候數字起伏很大',
      '近 30 天 RTP 涵蓋較長的期間，比較能反映這台機台平常的水準',
      '兩個數字對照著看。今日 RTP 偏低、近 30 天 RTP 正常或偏高，代表這台今天派出的比例低於它平常的表現',
      '單日 RTP 偶爾會出現上千 % 的極端數字，助手計分時看的是它在同遊戲中的排名，單一極端值不會把排序拉歪',
    ],
    example: {
      label: '計算方式',
      lines: ['今天累積下注 10,000、派出 9,500', '今日 RTP ＝ 9,500 ÷ 10,000 ＝ 95%'],
    },
  },
  {
    id: 'bet',
    name: '今日下注量',
    weight: '綜合分數比重 20%',
    meaning: '今天所有玩家在這台機台累積的下注金額',
    points: [
      '下注量高，代表今天有很多人在這台遊玩，是熱度的參考',
      '下注量也決定今日 RTP 有多可信。同樣是 80%，累積下注 100 元和累積下注 10 萬元，代表的意義差很多',
      '看到今日 RTP 很低或很高時，先確認下注量夠不夠大，再決定要不要參考這個數字',
    ],
  },
];

const SIGNAL_METALS = [
  { key: 'silver', name: '銀' },
  { key: 'gold', name: '黃金' },
  { key: 'platinum', name: '白金' },
  { key: 'obsidian', name: '曜金' },
];

export function RulesView({ me, onNavigate }: { me: AssistantMe | null; onNavigate: (view: AssistantView) => void }) {
  const active = me?.pass.active ?? false;

  return (
    <div className="aa-page aa-rules">
      <InkTitle as="h1" className="aa-page-title aa-display" text="曜金規則" height={40} />

      <nav className="aa-rules-toc" aria-label="本頁內容">
        {METRICS.map((m) => (
          <a key={m.id} href={`#aa-rule-${m.id}`}>{m.name}</a>
        ))}
        <a href="#aa-rule-score">怎麼排序</a>
        <a href="#aa-rule-signal">曜金訊號</a>
      </nav>

      {METRICS.map((m) => (
        <section key={m.id} id={`aa-rule-${m.id}`} className="aa-rule" aria-labelledby={`aa-rule-${m.id}-title`}>
          <div className="aa-section-head">
            <InkTitle id={`aa-rule-${m.id}-title`} className="aa-display" text={m.name} height={32} />
          </div>
          <p className="aa-rule-weight">{m.weight}</p>
          <p className="aa-rule-meaning">{m.meaning}</p>
          <ul className="aa-reasons aa-rule-points">
            {m.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {m.example && (
            <div className="aa-rule-example">
              <span className="aa-rule-example-label">{m.example.label}</span>
              {m.example.lines.map((l) => (
                <p key={l}>{l}</p>
              ))}
            </div>
          )}
        </section>
      ))}

      <section id="aa-rule-score" className="aa-rule" aria-labelledby="aa-rule-score-title">
        <div className="aa-section-head">
          <InkTitle id="aa-rule-score-title" className="aa-display" text="助手怎麼排序" height={32} />
        </div>
        <ul className="aa-reasons aa-rule-points">
          <li>四項數字各自換算成在同遊戲中的排名，再依比重合成 0–100 的綜合分數</li>
          <li>未開轉數越多、今日 RTP 越低、近 30 天 RTP 越高、今日下注量越高，分數越高</li>
          <li>精選空台只列目前沒人使用的機台，依綜合分數取前 5 名</li>
          <li>本金推薦依你的本金與目標倍數設定分數門檻，並把推薦分散到不同機台，減少多人同時擠進同一台；達到門檻的機台不足時，會以目前分數最高的空台補上</li>
          <li>超過 30 分鐘沒有更新的機台不列入排序；細項資料較舊時，該項以中間值計算</li>
        </ul>
      </section>

      <section id="aa-rule-signal" className="aa-rule" aria-labelledby="aa-rule-signal-title">
        <div className="aa-section-head">
          <h2 id="aa-rule-signal-title" className="aa-display">曜金訊號</h2>
        </div>
        <p className="aa-rule-weight">開通期間在首頁顯示 · 一次一組</p>
        <p className="aa-rule-meaning">每一組訊號都對應一台發出當下符合條件、目前沒人使用的機台</p>
        <ul className="aa-rule-metals" aria-label="元寶種類">
          {SIGNAL_METALS.map((m) => (
            <li key={m.key}>
              <img src={`/assets/assistant/metal/${m.key}.webp`} alt="" width="48" height="48" loading="lazy" />
              <span>{m.name}</span>
            </li>
          ))}
        </ul>
        <ul className="aa-reasons aa-rule-points">
          <li>每組訊號由 2–3 種元寶加上倍數組成，用來區分不同的訊號</li>
          <li>訊號強度由對應機台的綜合分數換算，分數越高，強度越高</li>
          <li>對應的機台有人入座、開過免費遊戲、今日 RTP 明顯變動，或資料停止更新時，系統會自動換一組新的訊號，並在畫面上說明原因</li>
          <li>玩完一輪免費遊戲後，可以按「免遊結束，換一組」取得新訊號；剛換過需要稍候一段時間才能再換</li>
          <li>同一台機台同時對應的訊號數有上限，避免太多會員擠進同一台</li>
        </ul>
      </section>

      <section className="aa-rule aa-rule-note" aria-labelledby="aa-rule-note-title">
        <InkTitle id="aa-rule-note-title" className="aa-rule-note-title" text="使用提醒" height={26} />
        <p>畫面上的數字都是已經發生的紀錄，每一轉的結果仍由遊戲獨立決定</p>
        <p>綜合分數與訊號強度都是排序參考，不代表中獎機率，也不保證獲利</p>
        <p>請依自己的預算設定本金，理性遊玩</p>
      </section>

      {me && (
        <div className="aa-rules-cta">
          {active ? (
            <button type="button" className="aa-cta" onClick={() => onNavigate('recommend')}>
              輸入本金找機台 <ChevronRight aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className="aa-cta" onClick={() => onNavigate('exchange')}>
              用積分開通 <ChevronRight aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
