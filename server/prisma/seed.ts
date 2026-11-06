import { prisma } from '../src/db.js';

export const SETTINGS_KEYS = {
  pointThresholds: 'pointThresholds',
  spinDurationMs: 'spinDurationMs',
  minDrawsBeforeWin: 'minDrawsBeforeWin',
  cooldownDrawsAfterWin: 'cooldownDrawsAfterWin',
  // 後台是否顯示「會員待審核」提示（側邊欄／會員列表頁籤數字、列表紅點）；
  // 純粹控制提示是否顯示，不影響審核流程本身（新會員仍會卡在 pending，仍需手動核准）。
  pendingApprovalAlertEnabled: 'pendingApprovalAlertEnabled',
  payoutCapEnabled: 'payoutCapEnabled',
  payoutCapRatio: 'payoutCapRatio',
  costControlEnabled: 'costControlEnabled',
  costControlInterval: 'costControlInterval',
  rulesText: 'rulesText',
  winTitleText: 'winTitleText',
  winRedemptionText: 'winRedemptionText',
  consolationPrizeId: 'consolationPrizeId',
  // 首頁外觀：會員前台 logo 與背景圖（空字串＝使用前端內建預設圖）
  homeLogoUrl: 'homeLogoUrl',
  homeBackgroundUrl: 'homeBackgroundUrl',
  // 首頁底部：中獎跑馬燈、底部導航是否預設收合（收合時以向上箭頭展開）
  // 首頁廣告彈窗：開關、圖片（上傳時轉 WebP）、點擊連結（空字串＝不可點擊）
  adPopupEnabled: 'adPopupEnabled',
  adPopupImageUrl: 'adPopupImageUrl',
  adPopupLinkUrl: 'adPopupLinkUrl',
  winTickerEnabled: 'winTickerEnabled',
  bottomNavCollapsible: 'bottomNavCollapsible',
  // 跑馬燈展示名單（暖場用）：開關 + JSON [{ memberId, rankLabel }]；
  // 金額依同名獎項的 cashAmount 即時帶入，找不到獎項或金額為 0 的會略過。
  winTickerDemoEnabled: 'winTickerDemoEnabled',
  winTickerDemoEntries: 'winTickerDemoEntries',
  // 數據助手 ATG 採集：每輪間隔（分鐘；測試期 10、正式 20）、每輪輪流抓取細項的機台數。
  // 機台歷史資料固定只保存 3 天（業主規定，不開放設定）。
  atgCollectIntervalMinutes: 'atgCollectIntervalMinutes',
  atgDetailBatchSize: 'atgDetailBatchSize',
  // 數據助手房間資料的逾時門檻（秒）：列表層（狀態、今日 RTP）每輪都更新；細項層（未開轉數、下注額等）
  // 輪流抓取，本來就比較舊，門檻另計。逾時的房間不顯示狀態、不參與推薦（計劃 1.5）。
  assistantDataMaxAgeSeconds: 'assistantDataMaxAgeSeconds',
  assistantDetailMaxAgeSeconds: 'assistantDetailMaxAgeSeconds',
  // 數據助手綜合分數與本金推薦（計劃 M3 草案）。權重 JSON：{unopened, todayRtp, thirtyDayRtp, todayBet}，會自動正規化。
  // 級距 JSON：[{minPrincipal, minScore, maxMultiplier}]，第一筆 minPrincipal 必須為 0、依金額遞增。
  // 門檻 = 級距 minScore +（目標倍數 − 1）× assistantMultiplierStepScore。
  assistantScoreWeights: 'assistantScoreWeights',
  assistantRecommendTiers: 'assistantRecommendTiers',
  assistantMultiplierStepScore: 'assistantMultiplierStepScore',
  assistantRecommendCount: 'assistantRecommendCount',
  assistantMinBetAdvice: 'assistantMinBetAdvice',
  assistantPremiumPercent: 'assistantPremiumPercent',
  // 本金推薦分散：從符合門檻的前 N 間空台中挑選；近 M 分鐘已推薦過的房間優先避開（0＝不避開）。
  assistantRecommendPoolSize: 'assistantRecommendPoolSize',
  assistantRecommendAvoidMinutes: 'assistantRecommendAvoidMinutes',
  // 數據助手會員端顯示文字（後台可改）：頂列 Logo 名稱、首頁精選空台區塊標題。
  // 文字與預設相同時前端顯示金色墨水字圖；改成其他文字則以文字呈現。
  assistantBrandName: 'assistantBrandName',
  assistantTopTitle: 'assistantTopTitle',
  // 數據助手訊號：綁定房間最低分數、今日 RTP 變動換組門檻（百分點）、每間房同時有效訊號上限、
  // 會員手動換組冷卻（秒）、訊號強度 % 的上下限（由綁定房間分數換算）。
  assistantSignalMinScore: 'assistantSignalMinScore',
  assistantSignalRtpChangePoints: 'assistantSignalRtpChangePoints',
  assistantSignalMaxPerRoom: 'assistantSignalMaxPerRoom',
  assistantSignalRefreshCooldownSeconds: 'assistantSignalRefreshCooldownSeconds',
  assistantSignalStrengthMin: 'assistantSignalStrengthMin',
  assistantSignalStrengthMax: 'assistantSignalStrengthMax',
  // 數據助手使用期限兌換方案 JSON：[{points, hours}]（積分與輪盤共用 User.points）。
  // 前台介紹頁與兌換頁的文案由這份方案動態產生。
  assistantTimePlans: 'assistantTimePlans',
  // 積分兌換／用積分開通的總開關（預設關閉）與關閉時顯示給會員的提示文字
  assistantExchangeEnabled: 'assistantExchangeEnabled',
  assistantExchangeClosedMessage: 'assistantExchangeClosedMessage',
  // System totals — maintained atomically inside the draw transaction
  // (replaces SUM(User) aggregation; addresses Codex finding B1/D1).
  totalDrawCount: 'totalDrawCount',
  totalPayoutAmount: 'totalPayoutAmount',
  totalPointsBurned: 'totalPointsBurned',
} as const;

export const DEFAULT_THRESHOLDS = [
  { points: 6, draws: 1 },
  { points: 15, draws: 3 },
  { points: 25, draws: 5 },
  { points: 35, draws: 7 },
  { points: 48, draws: 10 },
];

export const DEFAULT_WIN_TICKER_DEMO_ENTRIES = [
  { memberId: 'star617806', rankLabel: '四獎' },
  { memberId: 'mm352917', rankLabel: '三獎' },
  { memberId: 'kk654803', rankLabel: '五獎' },
  { memberId: 'lu898644', rankLabel: '五獎' },
  { memberId: 'go189161', rankLabel: '二獎' },
  { memberId: 'lu854485', rankLabel: '五獎' },
  { memberId: 'ab253640', rankLabel: '四獎' },
  { memberId: 'kk820307', rankLabel: '四獎' },
  { memberId: 'hy374014', rankLabel: '五獎' },
  { memberId: 'mm446930', rankLabel: '四獎' },
  { memberId: 'jx812935', rankLabel: '五獎' },
  { memberId: 'zz11149', rankLabel: '五獎' },
  { memberId: 'go825292', rankLabel: '三獎' },
  { memberId: 'go865038', rankLabel: '頭獎' },
  { memberId: 'star701367', rankLabel: '三獎' },
  { memberId: 'tw989835', rankLabel: '五獎' },
  { memberId: 'win620750', rankLabel: '四獎' },
  { memberId: 'star844949', rankLabel: '四獎' },
  { memberId: 'cc50280', rankLabel: '五獎' },
  { memberId: 'lu594451', rankLabel: '四獎' },
  { memberId: 'cc795668', rankLabel: '四獎' },
  { memberId: 'lu930532', rankLabel: '三獎' },
  { memberId: 'jx635763', rankLabel: '三獎' },
  { memberId: 'ace948284', rankLabel: '二獎' },
  { memberId: 'hy741679', rankLabel: '五獎' },
  { memberId: 'hy595858', rankLabel: '五獎' },
  { memberId: 'vip451112', rankLabel: '五獎' },
  { memberId: 'jx874970', rankLabel: '四獎' },
  { memberId: 'hy669291', rankLabel: '五獎' },
  { memberId: 'ab380146', rankLabel: '五獎' },
];

export const DEFAULT_SETTINGS: Record<string, string> = {
  [SETTINGS_KEYS.pointThresholds]: JSON.stringify(DEFAULT_THRESHOLDS),
  [SETTINGS_KEYS.spinDurationMs]: '4300',
  [SETTINGS_KEYS.minDrawsBeforeWin]: '0',
  [SETTINGS_KEYS.cooldownDrawsAfterWin]: '0',
  [SETTINGS_KEYS.pendingApprovalAlertEnabled]: 'false',
  [SETTINGS_KEYS.payoutCapEnabled]: 'false',
  [SETTINGS_KEYS.payoutCapRatio]: '0.45',
  [SETTINGS_KEYS.costControlEnabled]: 'false',
  [SETTINGS_KEYS.costControlInterval]: '3',
  [SETTINGS_KEYS.rulesText]: [
    '單抽消耗 6 積分、連抽消耗 48 積分，結果由伺服器判定。',
    '中獎時會產生 Redemption 隨機碼，將碼截圖傳給管理員兌換彩金。',
    '積分由管理員後台派發，會員不可自行修改。',
  ].join('\n'),
  [SETTINGS_KEYS.winTitleText]: '恭喜中獎',
  [SETTINGS_KEYS.winRedemptionText]: '請將兌換碼截圖傳送給代理以進行領取。',
  [SETTINGS_KEYS.consolationPrizeId]: '',
  [SETTINGS_KEYS.homeLogoUrl]: '',
  [SETTINGS_KEYS.homeBackgroundUrl]: '',
  [SETTINGS_KEYS.adPopupEnabled]: 'false',
  [SETTINGS_KEYS.adPopupImageUrl]: '',
  [SETTINGS_KEYS.adPopupLinkUrl]: '',
  [SETTINGS_KEYS.winTickerEnabled]: 'true',
  [SETTINGS_KEYS.bottomNavCollapsible]: 'true',
  // 此站已正式營運：展示名單預設關閉，由後台自行開啟。
  [SETTINGS_KEYS.winTickerDemoEnabled]: 'false',
  [SETTINGS_KEYS.winTickerDemoEntries]: JSON.stringify(DEFAULT_WIN_TICKER_DEMO_ENTRIES),
  [SETTINGS_KEYS.atgCollectIntervalMinutes]: '10',
  [SETTINGS_KEYS.atgDetailBatchSize]: '1000',
  [SETTINGS_KEYS.assistantDataMaxAgeSeconds]: '1800',
  [SETTINGS_KEYS.assistantDetailMaxAgeSeconds]: '10800',
  [SETTINGS_KEYS.assistantScoreWeights]: JSON.stringify({ unopened: 35, todayRtp: 25, thirtyDayRtp: 20, todayBet: 20 }),
  [SETTINGS_KEYS.assistantRecommendTiers]: JSON.stringify([
    { minPrincipal: 0, minScore: 60, maxMultiplier: 2 },
    { minPrincipal: 5000, minScore: 70, maxMultiplier: 3 },
    { minPrincipal: 10000, minScore: 80, maxMultiplier: 5 },
  ]),
  [SETTINGS_KEYS.assistantMultiplierStepScore]: '3',
  [SETTINGS_KEYS.assistantRecommendCount]: '5',
  [SETTINGS_KEYS.assistantMinBetAdvice]: '10',
  [SETTINGS_KEYS.assistantPremiumPercent]: '5',
  [SETTINGS_KEYS.assistantRecommendPoolSize]: '50',
  [SETTINGS_KEYS.assistantRecommendAvoidMinutes]: '15',
  [SETTINGS_KEYS.assistantBrandName]: '曜金數據助手',
  [SETTINGS_KEYS.assistantTopTitle]: '精選空台 TOP 5',
  [SETTINGS_KEYS.assistantSignalMinScore]: '70',
  [SETTINGS_KEYS.assistantSignalRtpChangePoints]: '5',
  [SETTINGS_KEYS.assistantSignalMaxPerRoom]: '2',
  [SETTINGS_KEYS.assistantSignalRefreshCooldownSeconds]: '30',
  [SETTINGS_KEYS.assistantSignalStrengthMin]: '30',
  [SETTINGS_KEYS.assistantSignalStrengthMax]: '90',
  [SETTINGS_KEYS.assistantTimePlans]: JSON.stringify([
    { points: 1, hours: 3 },
    { points: 2, hours: 8 },
    { points: 3, hours: 24 },
  ]),
  [SETTINGS_KEYS.assistantExchangeEnabled]: 'false',
  [SETTINGS_KEYS.assistantExchangeClosedMessage]: '系統正在測試中',
  [SETTINGS_KEYS.totalDrawCount]: '0',
  [SETTINGS_KEYS.totalPayoutAmount]: '0',
  [SETTINGS_KEYS.totalPointsBurned]: '0',
};

const PRIZES = [
  { rankLabel: '頭獎', name: '最高彩金', cashAmount: 10000, weight: 2,                    segmentColor: '#d92b3a', wheelPosition: 0 },
  { rankLabel: '二獎', name: '彩金',     cashAmount: 5000,  weight: 6,                    segmentColor: '#ec8a26', wheelPosition: 1 },
  { rankLabel: '三獎', name: '彩金',     cashAmount: 1000,  weight: 14,                   segmentColor: '#c98612', wheelPosition: 2 },
  { rankLabel: '四獎', name: '彩金',     cashAmount: 500,   weight: 22,                   segmentColor: '#38a86e', wheelPosition: 3 },
  { rankLabel: '五獎', name: '彩金',     cashAmount: 100,   weight: 26,                   segmentColor: '#2e7cd9', wheelPosition: 4 },
  { rankLabel: '六獎', name: '謝謝參加', cashAmount: 0,     weight: 30, isConsolation: true, segmentColor: '#9b3eb8', wheelPosition: 5 },
];

async function main() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: {} });
  }
  if ((await prisma.prize.count()) === 0) {
    for (const p of PRIZES) await prisma.prize.create({ data: { ...p, stock: 9999 } });
    const consolation = await prisma.prize.findFirst({ where: { isConsolation: true } });
    if (consolation) {
      await prisma.appSetting.update({
        where: { key: SETTINGS_KEYS.consolationPrizeId },
        data: { value: consolation.id },
      });
    }
  } else {
    // Re-enable any prize that was disabled (e.g. by integration tests that
    // exercise the enabled=false path). Doesn't touch other fields so admin
    // edits to weight / stock / cashAmount survive.
    await prisma.prize.updateMany({ where: { enabled: false }, data: { enabled: true } });
  }
  console.log('seed done');
}

if (process.argv[1]?.endsWith('seed.ts')) {
  main().finally(() => prisma.$disconnect());
}
