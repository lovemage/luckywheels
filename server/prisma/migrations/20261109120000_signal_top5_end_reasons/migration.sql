-- 曜金訊號改為綁 TOP5 空台、符號用房間訊號：新增「掉出 TOP5」「台北換日」兩個換組原因
ALTER TYPE "AssistantSignalEndReason" ADD VALUE 'left_top';
ALTER TYPE "AssistantSignalEndReason" ADD VALUE 'day_changed';
