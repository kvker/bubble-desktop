// 玩法事件契约：只定义跨自治功能共享的事实事件
import mitt from '../vendor/mitt.mjs';

export const GAMEPLAY_EVENTS = Object.freeze({
  starCollected: 'star:collected',
  scoreChanged: 'score:changed',
});

export function createGameplayEvents() {
  return mitt();
}
