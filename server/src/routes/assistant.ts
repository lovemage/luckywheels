import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../db.js';
import { AppError } from '../errors.js';
import { requireAssistantMember, requireAssistantPass } from '../assistant/access.js';
import { memberAssistantAllowed } from '../assistant/preview.js';
import { getRoomDetail, listGames, listRooms, ROOM_SORTS, TREND_RANGES, type GameView, type TrendRange } from '../assistant/rooms.js';
import { loadScoreBoard } from '../assistant/board.js';
import { toDisplayScore } from '../assistant/scoring.js';
import {
  logRecommendation,
  MultiplierNotAllowedError,
  recommend,
  RECOMMEND_DISCLAIMER,
  thresholdFor,
  tierFor,
} from '../assistant/recommend.js';
import { readDisplaySettings,
  readExchangeAccess,
  MAX_TARGET_MULTIPLIER,
  readFreshnessSettings,
  readRecommendSettings,
  readSignalSettings,
  readTimePlans,
  type FreshnessSettings,
  type RecommendSettings,
} from '../assistant/settings.js';
import { exchangePointsForTime, getPass, presentExchange, presentPlans } from '../assistant/pass.js';
import { currentSignal, roomSignalFor, SIGNAL_DISCLAIMER } from '../assistant/signal.js';

// 數據助手會員端 API（計劃 M1、M3）。
// - /me、兌換、兌換紀錄、推薦設定：登入＋會員條件即可（未開通也要能兌換）
// - 遊戲、房間、推薦、房間訊號：另需使用期限內（403 ASSISTANT_EXPIRED）
// - 曜金訊號（/signal、/signal/refresh）：不需開通，綁定的機台不對會員揭露
// - /api/public/assistant/plans：不需登入（落地頁的兌換說明），旗標關閉（或預覽模式沒有預覽 cookie）時 404

export const assistantRoutes = new Hono();
assistantRoutes.use('/api/assistant/*', ...requireAssistantMember);

const paid = requireAssistantPass;

// 未指定遊戲時用第一個（目前只採集戰神賽特 II）
function pickGame(games: GameView[], code: string | undefined): GameView {
  const game = code ? games.find((g) => g.code === code) : games[0];
  if (!game) throw new AppError('GAME_NOT_FOUND', 'game not found', 404);
  return game;
}

const scoresFor = (now: Date, f: FreshnessSettings, r: RecommendSettings) => async (gameId: string) =>
  (await loadScoreBoard(prisma, gameId, now, f, r.weights, r.premiumPercent)).map;

// ── 使用期限與兌換 ──────────────────────────────────

assistantRoutes.get('/api/public/assistant/plans', async (c) => {
  if (!(await memberAssistantAllowed(c))) throw new AppError('NOT_FOUND', 'not found', 404);
  return c.json({ plans: presentPlans(await readTimePlans(prisma)) });
});

assistantRoutes.get('/api/assistant/me', async (c) => {
  const user = c.get('user');
  const now = new Date();
  const [fresh, pass, plans, display, exchange] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { points: true } }),
    getPass(prisma, user.id, now),
    readTimePlans(prisma),
    readDisplaySettings(prisma),
    readExchangeAccess(prisma),
  ]);
  return c.json({ points: fresh.points, pass, plans: presentPlans(plans), display, exchange, serverTime: now.toISOString() });
});

const ExchangeBody = z.object({
  /** 方案的積分數（方案以積分數識別） */
  points: z.number().int().min(1),
  /** 會員畫面上看到的時數；後台剛好改了方案時回 409，避免換到不是會員看到的內容 */
  expectedHours: z.number().int().min(1).optional(),
});

assistantRoutes.post('/api/assistant/exchange', async (c) => {
  const key = c.req.header('idempotency-key')?.trim();
  if (!key || key.length > 100) throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 'idempotency-key header is required', 400);
  let body: z.infer<typeof ExchangeBody>;
  try { body = ExchangeBody.parse(await c.req.json()); }
  catch { throw new AppError('EXCHANGE_INPUT_INVALID', 'invalid exchange request', 400); }

  const user = c.get('user');
  // 先查重送：方案改過之後，重送同一把 key 仍回原本的結果
  const prior = await prisma.assistantExchange.findUnique({ where: { userId_idempotencyKey: { userId: user.id, idempotencyKey: key } } });
  let result: { exchange: NonNullable<typeof prior>; replayed: boolean };
  if (prior) {
    result = { exchange: prior, replayed: true };
  } else {
    // 開關只擋新兌換；上面的重送仍回原結果，會員不會因關閉而看不到已完成的兌換
    const access = await readExchangeAccess(prisma);
    if (!access.enabled) throw new AppError('EXCHANGE_DISABLED', access.closedMessage, 403);
    const plan = (await readTimePlans(prisma)).find((p) => p.points === body.points);
    if (!plan) throw new AppError('EXCHANGE_PLAN_NOT_FOUND', 'plan not found', 404);
    if (body.expectedHours !== undefined && body.expectedHours !== plan.hours) {
      throw new AppError('EXCHANGE_PLAN_CHANGED', 'plan has changed; please reload', 409);
    }
    result = await exchangePointsForTime(prisma, user.id, plan, key);
  }

  const now = new Date();
  const [fresh, pass] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { points: true } }),
    getPass(prisma, user.id, now),
  ]);
  return c.json({ exchange: presentExchange(result.exchange), replayed: result.replayed, points: fresh.points, pass });
});

assistantRoutes.get('/api/assistant/exchanges', async (c) => {
  const rows = await prisma.assistantExchange.findMany({
    where: { userId: c.get('user').id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return c.json({ items: rows.map(presentExchange) });
});

// ── 遊戲與房間 ─────────────────────────────────────

assistantRoutes.get('/api/assistant/games', paid, async (c) => {
  const now = new Date();
  const items = await listGames(prisma, now, await readFreshnessSettings(prisma));
  return c.json({ items, serverTime: now.toISOString() });
});

const RoomsQuery = z.object({
  game: z.string().min(1).max(60).optional(),
  status: z.enum(['idle', 'busy', 'locked']).optional(),
  q: z.string().trim().regex(/^\d{1,6}$/).optional(),
  sort: z.enum(ROOM_SORTS).default('roomNo'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

// 未開通也能看的精選空台預覽：分數前 5 的空台，房號與房間 id 在伺服器端遮蔽（前端再霧化），
// 不提供真實房號，避免未開通就能直接找到機台。須註冊在 /rooms/:id 之前。
const TEASER_SIZE = 5;
assistantRoutes.get('/api/assistant/rooms/teaser', async (c) => {
  const now = new Date();
  const [freshness, rs] = await Promise.all([readFreshnessSettings(prisma), readRecommendSettings(prisma)]);
  const game = pickGame(await listGames(prisma, now, freshness), c.req.query('game') || undefined);
  const scores = await scoresFor(now, freshness, rs)(game.id);
  const { items } = await listRooms(
    prisma,
    { gameId: game.id, status: 'idle', sort: 'score', page: 1, pageSize: TEASER_SIZE },
    now,
    freshness,
    scores,
  );
  const masked = items.map((r, i) => ({ ...r, id: `teaser-${i + 1}`, roomNo: '8888', masked: true }));
  return c.json({ game, items: masked, total: masked.length, page: 1, pageSize: TEASER_SIZE, masked: true, serverTime: now.toISOString() });
});

assistantRoutes.get('/api/assistant/rooms', paid, async (c) => {
  const raw = c.req.query();
  let query: z.infer<typeof RoomsQuery>;
  try { query = RoomsQuery.parse({ ...raw, q: raw.q || undefined }); }
  catch { throw new AppError('ROOMS_QUERY_INVALID', 'invalid query', 400); }

  const now = new Date();
  const [freshness, rs] = await Promise.all([readFreshnessSettings(prisma), readRecommendSettings(prisma)]);
  const game = pickGame(await listGames(prisma, now, freshness), query.game);
  const scores = await scoresFor(now, freshness, rs)(game.id);

  const { items, total } = await listRooms(
    prisma,
    { gameId: game.id, status: query.status, q: query.q, sort: query.sort, page: query.page, pageSize: query.pageSize },
    now,
    freshness,
    scores,
  );
  return c.json({ game, items, total, page: query.page, pageSize: query.pageSize, serverTime: now.toISOString() });
});

assistantRoutes.get('/api/assistant/rooms/:id', paid, async (c) => {
  const range = c.req.query('range') ?? '24h';
  if (!Object.hasOwn(TREND_RANGES, range)) throw new AppError('ROOMS_QUERY_INVALID', 'range must be 24h or 3d', 400);
  const now = new Date();
  const [freshness, rs] = await Promise.all([readFreshnessSettings(prisma), readRecommendSettings(prisma)]);
  const detail = await getRoomDetail(prisma, c.req.param('id'), now, freshness, scoresFor(now, freshness, rs), range as TrendRange);
  if (!detail) throw new AppError('ROOM_NOT_FOUND', 'room not found', 404);
  return c.json({ ...detail, serverTime: now.toISOString() });
});

// ── 本金推薦 ───────────────────────────────────────

// 前端輸入表單用：各級距可選的最高倍數與門檻
assistantRoutes.get('/api/assistant/recommend/config', async (c) => {
  const s = await readRecommendSettings(prisma);
  return c.json({
    tiers: s.tiers.map((t) => ({
      ...t,
      label: tierFor(t.minPrincipal, s.tiers).label,
      // 各倍數的門檻（顯示分數）；索引 0 為 1 倍
      thresholds: Array.from({ length: t.maxMultiplier }, (_, i) => toDisplayScore(thresholdFor(t, i + 1, s.multiplierStepScore))),
    })),
    multiplierStepScore: s.multiplierStepScore,
    maxMultiplier: MAX_TARGET_MULTIPLIER,
    count: s.count,
    minBetAdvice: `建議單注 ${s.minBetAdvice.toLocaleString('en-US')} 元以上`,
    disclaimer: RECOMMEND_DISCLAIMER,
  });
});

const RecommendBody = z.object({
  game: z.string().min(1).max(60).optional(),
  principal: z.number().int().min(1).max(100_000_000),
  multiplier: z.number().int().min(1).max(MAX_TARGET_MULTIPLIER),
});

assistantRoutes.post('/api/assistant/recommend', paid, async (c) => {
  let body: z.infer<typeof RecommendBody>;
  try { body = RecommendBody.parse(await c.req.json()); }
  catch { throw new AppError('RECOMMEND_INPUT_INVALID', 'principal must be a positive integer and multiplier 1–5', 400); }

  const now = new Date();
  const freshness = await readFreshnessSettings(prisma);
  const game = pickGame(await listGames(prisma, now, freshness), body.game);
  const input = { principal: body.principal, multiplier: body.multiplier };
  try {
    const result = await recommend(prisma, game.id, input, now, freshness, await readRecommendSettings(prisma));
    await logRecommendation(prisma, c.get('user').id, game.id, input, result);
    return c.json({ game, input, ...result, serverTime: now.toISOString() });
  } catch (e) {
    if (e instanceof MultiplierNotAllowedError) {
      throw new AppError('MULTIPLIER_NOT_ALLOWED', `this principal allows up to ${e.maxMultiplier}x`, 422);
    }
    throw e;
  }
});

// ── 訊號 ───────────────────────────────────────────

async function signalFor(c: { get(k: 'user'): { id: string } }, gameCode: string | undefined, refresh: boolean) {
  const now = new Date();
  const [freshness, recommendSettings, signalSettings] = await Promise.all([
    readFreshnessSettings(prisma),
    readRecommendSettings(prisma),
    readSignalSettings(prisma),
  ]);
  const game = pickGame(await listGames(prisma, now, freshness), gameCode);
  const result = await currentSignal(
    { prisma, userId: c.get('user').id, gameId: game.id, now, freshness, recommend: recommendSettings, signal: signalSettings },
    refresh,
  );
  return { game: { code: game.code, name: game.name }, ...result, serverTime: now.toISOString() };
}

// 曜金訊號不需開通：會員看不到綁定的是哪一台（2026-11-09）
assistantRoutes.get('/api/assistant/signal', async (c) => c.json(await signalFor(c, c.req.query('game'), false)));

// 會員按「免遊結束，換一組」
assistantRoutes.post('/api/assistant/signal/refresh', async (c) => c.json(await signalFor(c, c.req.query('game'), true)));

// 房間訊號（Android App 遊戲內浮窗）：會員目前坐的機台的符號門檻；App 讀盤面比對，達標時提醒
const RoomSignalQuery = z.object({ roomNo: z.string().trim().regex(/^\d{1,6}$/), game: z.string().min(1).max(60).optional() });
assistantRoutes.get('/api/assistant/room-signal', paid, async (c) => {
  const parsed = RoomSignalQuery.safeParse(c.req.query());
  if (!parsed.success) throw new AppError('ROOMS_QUERY_INVALID', 'roomNo is required', 400);
  const now = new Date();
  const freshness = await readFreshnessSettings(prisma);
  const game = pickGame(await listGames(prisma, now, freshness), parsed.data.game);
  const room = await prisma.room.findFirst({
    where: { gameId: game.id, roomNo: parsed.data.roomNo },
    select: { id: true, roomNo: true, prev1Spins: true },
  });
  if (!room) throw new AppError('ROOM_NOT_FOUND', 'room not found', 404);
  const { key, symbols } = roomSignalFor(room, now);
  return c.json({ game: { code: game.code, name: game.name }, roomNo: room.roomNo, key, symbols, disclaimer: SIGNAL_DISCLAIMER, serverTime: now.toISOString() });
});
