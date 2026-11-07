// 獨立成檔：後台 API 會引用 collector/settings.ts，不能因此在會員站載入 playwright。

export class CollectorError extends Error {
  constructor(
    readonly code: 'CREDENTIALS_INVALID' | 'LOGIN_FAILED' | 'ENTER_GAME_FAILED' | 'SCENE_NOT_READY' | 'ROOM_LIST_FAILED' | 'ROUND_TIMEOUT',
    message: string,
  ) {
    super(message);
  }
}

export interface Credentials {
  casinoUrl: string;
  account: string;
  password: string;
}
