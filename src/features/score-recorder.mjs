// 后台计分记录器：独立订阅星星事实，维护进程内总分并上报跨进程持久化
import { GAMEPLAY_EVENTS } from './gameplay-events.mjs';

export function mountScoreRecorder({ events, reportScore }) {
  let score = 0;

  const handleStarCollected = ({ value }) => {
    if (!Number.isFinite(value)) return;
    score += value;
    events.emit(GAMEPLAY_EVENTS.scoreChanged, { score, delta: value });
    if (!reportScore) return;
    try {
      reportScore(value);
    } catch {
      // 上报失败不影响进程内计分与得分变化事件流
    }
  };

  events.on(GAMEPLAY_EVENTS.starCollected, handleStarCollected);

  return {
    getScore: () => score,
    destroy() {
      events.off(GAMEPLAY_EVENTS.starCollected, handleStarCollected);
    },
  };
}
