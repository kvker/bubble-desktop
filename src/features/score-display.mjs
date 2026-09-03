// 开发态得分显示器：只呈现记录器发布的分数变化
import { Text } from '../vendor/pixi.mjs';
import { GAMEPLAY_EVENTS } from './gameplay-events.mjs';

export function mountScoreDisplay({ layer, events, x }) {
  const view = new Text({
    text: '得分：0',
    style: {
      fill: 0xffe066,
      fontSize: 18,
      fontWeight: 'bold',
      stroke: { color: 0x000000, width: 3, join: 'round' },
      dropShadow: { color: 0x000000, alpha: 0.45, blur: 2, distance: 2 },
    },
  });
  view.anchor.set(0.5, 0);
  view.position.set(x, 14);
  layer.addChild(view);

  const handleScoreChanged = ({ score }) => {
    view.text = `得分：${score}`;
  };
  events.on(GAMEPLAY_EVENTS.scoreChanged, handleScoreChanged);

  return {
    destroy() {
      events.off(GAMEPLAY_EVENTS.scoreChanged, handleScoreChanged);
      layer.removeChild(view);
      view.destroy();
    },
  };
}
