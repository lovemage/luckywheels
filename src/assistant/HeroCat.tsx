import { useEffect, useState } from 'react';

// Hero 吉祥物：金色胖貓，5 種動作輪流播放（每個動作為 16 幀橫向精靈條，public/assets/assistant/cat/）。
// 精靈條每幀尺寸為 2x 像素；顯示時除以 2。切幀時已依身體主幹面積把每一幀縮放到同一個大小、
// 以身體重心置中、腳底貼齊地面，所以換動作或同一動作中貓的大小都一致。

type ActionName = 'sit' | 'lounge' | 'stretch' | 'scratch' | 'coin';

interface Action {
  /** 單幀寬高（精靈條像素，2x） */
  w: number;
  h: number;
  /** 播完 16 幀的秒數 */
  dur: number;
  /** 連續播放幾輪後換動作 */
  loops: number;
}

const ACTIONS: Record<ActionName, Action> = {
  sit: { w: 256, h: 239, dur: 2.6, loops: 2 },
  lounge: { w: 326, h: 215, dur: 3, loops: 2 },
  stretch: { w: 314, h: 283, dur: 2.6, loops: 1 },
  scratch: { w: 264, h: 247, dur: 2, loops: 1 },
  coin: { w: 246, h: 234, dur: 2.4, loops: 2 },
};

const NAMES = Object.keys(ACTIONS) as ActionName[];
const FRAMES = 16;
const src = (n: ActionName) => `/assets/assistant/cat/cat-${n}.webp`;

function nextAction(current: ActionName): ActionName {
  // 每換一次動作，有一半機率回到坐姿當作「休息姿勢」，其餘隨機
  if (current !== 'sit' && Math.random() < 0.5) return 'sit';
  const others = NAMES.filter((n) => n !== current);
  return others[Math.floor(Math.random() * others.length)]!;
}

export function HeroCat() {
  const [action, setAction] = useState<ActionName>('sit');
  const [loop, setLoop] = useState(0);

  // 預先載入所有動作，避免換動作時閃一下
  useEffect(() => {
    for (const n of NAMES) {
      const img = new Image();
      img.src = src(n);
    }
  }, []);

  const a = ACTIONS[action];
  const w = a.w / 2;
  const h = a.h / 2;

  return (
    <div className="aa-cat" aria-hidden="true">
      <div className="aa-cat-frame" style={{ width: w, height: h }}>
        <img
          key={action}
          className="aa-cat-strip"
          src={src(action)}
          alt=""
          width={w * FRAMES}
          height={h}
          draggable={false}
          style={{ animationDuration: `${a.dur}s` }}
          onAnimationIteration={() => {
            if (loop + 1 >= a.loops) {
              setLoop(0);
              setAction(nextAction(action));
            } else {
              setLoop(loop + 1);
            }
          }}
        />
      </div>
    </div>
  );
}
