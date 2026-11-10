import { ChevronRight } from 'lucide-react';
import type { AssistantMe } from '../../api/assistant.js';
import type { AssistantView } from '../AssistantApp.js';
import { InkTitle } from '../InkTitle.js';
import { OpenPassButton } from '../OpenPassButton.js';
import { ATG_SYMBOLS } from '../atgSymbols.js';

// 曜金規則：說明畫面上的數字怎麼看、助手怎麼排序。未開通也能看（讓會員先了解助手能提供什麼）。
// 措辭維持中立：數字是已發生的紀錄，不暗示中獎機率、預測或保證獲利。
// 只說明數字代表什麼、怎麼看，不放計算公式與試算範例。

interface Metric {
  id: string;
  name: string;
  weight: string;
  meaning: string;
  points: string[];
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

/** 訊號會用到的盤面符號：高分符號 4 種、Scatter 2 種（都算大圖）、寶石 5 種 */
const SIGNAL_SYMBOL_ROWS: { label: string; keys: (keyof typeof ATG_SYMBOLS)[] }[] = [
  { label: '高分符號', keys: ['eye', 'cobra', 'bow', 'sickle'] },
  { label: 'Scatter', keys: ['scarab', 'scarab_color'] },
  { label: '寶石', keys: ['gem_yellow', 'gem_red', 'gem_purple', 'gem_blue', 'gem_green'] },
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
        <a href="#aa-rule-roomsig">房間訊號</a>
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
        </section>
      ))}

      <section id="aa-rule-score" className="aa-rule" aria-labelledby="aa-rule-score-title">
        <div className="aa-section-head">
          <InkTitle id="aa-rule-score-title" className="aa-display" text="助手怎麼排序" height={32} />
        </div>
        <ul className="aa-reasons aa-rule-points">
          <li>四項數字各自換算成在同遊戲中的排名，再依比重合成綜合分數</li>
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
        <p className="aa-rule-weight">首頁精選空台 TOP 5 下方 · 不需開通 · 一次一組</p>
        <p className="aa-rule-meaning">曜金訊號是上方 TOP 5 其中一台的房間訊號（第 1 組），不公開是哪一台；逐台用房間訊號查房號，對得上的就是那台</p>
        {SIGNAL_SYMBOL_ROWS.map((row) => (
          <ul key={row.label} className="aa-rule-metals" data-count={row.keys.length} aria-label={`訊號符號：${row.label}`}>
            {row.keys.map((k) => (
              <li key={k}>
                <img src={ATG_SYMBOLS[k].img} alt="" width="48" height="48" loading="lazy" />
                <span>{ATG_SYMBOLS[k].name}</span>
              </li>
            ))}
          </ul>
        ))}
        <ul className="aa-reasons aa-rule-points">
          <li>每組訊號由大圖（高分符號或甲蟲、彩甲）加上寶石組成，例如「眼睛 = 3、紫寶石 ≥ 5」或「甲蟲 = 2、彩甲 = 1、藍寶石 ≥ 5」；大圖要剛好相等，寶石達到以上即可</li>
          <li>訊號強度由對應機台的綜合分數換算，分數越高，強度越高</li>
          <li>對應的機台有人入座、開過免費遊戲、今日 RTP 明顯變動、資料停止更新、掉出 TOP 5，或到了隔天，系統會自動換一組新的訊號，並在畫面上說明原因</li>
          <li>未開通時看不到 TOP 5 的房號，開通後才能逐台查房間訊號</li>
          <li>同一台機台同時對應的訊號數有上限，避免太多會員擠進同一台</li>
        </ul>
      </section>

      <section id="aa-rule-roomsig" className="aa-rule" aria-labelledby="aa-rule-roomsig-title">
        <div className="aa-section-head">
          <h2 id="aa-rule-roomsig-title" className="aa-display">房間訊號</h2>
        </div>
        <p className="aa-rule-weight">開通後使用 · 每台每天 5 組</p>
        <p className="aa-rule-meaning">抓連續多日數據分析，每天更新前七天單一房間數據，推薦當天最適合的訊號；每台每天 5 組，所有會員看到的相同</p>
        <ul className="aa-reasons aa-rule-points">
          <li>坐上機台後查房號（Android App 會自動帶入），每轉結束時盤面上的大圖（高分符號、甲蟲、彩甲）數量剛好相等（=）、寶石數量達到以上（≥），就是訊號達標，可買免遊</li>
          <li>免遊結束後可按「免遊結束，換下一組」看同一台的下一組；按錯可以回上一組</li>
          <li>網頁版會記得上次查的房號與組數，在遊戲和助手之間切換時不用重新輸入</li>
          <li>隔天，或系統偵測到這台自然開出免遊時，整串 5 組會換新，從第 1 組開始</li>
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
            <OpenPassButton me={me} className="aa-cta" onClick={() => onNavigate('exchange')}>
              用積分開通 <ChevronRight aria-hidden="true" />
            </OpenPassButton>
          )}
        </div>
      )}
    </div>
  );
}
