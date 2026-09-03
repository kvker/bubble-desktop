// 角色物料验证工具测试
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateMaterial, STATE_KEYS, PROPS, TYPES } = require('../scripts/validate-character');

const VALID = {
  schemaVersion: 1,
  id: 'sample',
  type: 'text',
  style: {
    fontSize: 44,
    fontWeight: 'bold',
    fontFamily: 'sans-serif',
    fill: '#ffffff',
    stroke: { width: 6, color: '#000000' },
    dropShadow: { distance: 3, alpha: 0.4, blur: 3 },
  },
  states: {
    fire: { text: '吹', animation: [{ prop: 'scaleX', type: 'pulse', amp: 0.16, duration: 0.25 }] },
    walk: { text: '走', animation: [{ prop: 'scaleX', type: 'sine', amp: 0.1, freq: 9 }] },
    idle: { text: '静', animation: [{ prop: 'scaleY', type: 'sine', amp: 0.02, freq: 2.2 }] },
  },
};

test('验证工具接受合法物料且不产生错误', () => {
  assert.deepEqual(validateMaterial(JSON.parse(JSON.stringify(VALID))), []);
});

test('状态文字缺失或为空时强制报错', () => {
  const noText = JSON.parse(JSON.stringify(VALID));
  delete noText.states.fire.text;
  assert.ok(validateMaterial(noText).some((e) => e.message.includes('states.fire.text')));

  const emptyText = JSON.parse(JSON.stringify(VALID));
  emptyText.states.walk.text = '   ';
  assert.ok(validateMaterial(emptyText).some((e) => e.message.includes('states.walk.text')));
});

test('状态缺失时报错', () => {
  const partial = JSON.parse(JSON.stringify(VALID));
  delete partial.states.idle;
  const errors = validateMaterial(partial);
  assert.ok(STATE_KEYS.every((k) => k === 'idle' || !errors.some((e) => e.message.includes(`states.${k}`))));
  assert.ok(errors.some((e) => e.message.includes('states.idle')));
});

test('动画条目 prop 与 type 白名单校验', () => {
  const badProp = JSON.parse(JSON.stringify(VALID));
  badProp.states.idle.animation = [{ prop: 'rotate', type: 'sine', amp: 1, freq: 1 }];
  assert.ok(validateMaterial(badProp).some((e) => e.message.includes('prop 无效')));

  const badType = JSON.parse(JSON.stringify(VALID));
  badType.states.walk.animation = [{ prop: 'scaleX', type: 'saw', amp: 1, freq: 1 }];
  assert.ok(validateMaterial(badType).some((e) => e.message.includes('type 无效')));
});

test('sine 必须带 freq、pulse 必须带 duration', () => {
  const noFreq = JSON.parse(JSON.stringify(VALID));
  noFreq.states.walk.animation = [{ prop: 'scaleX', type: 'sine', amp: 0.1 }];
  assert.ok(validateMaterial(noFreq).some((e) => e.message.includes('freq 在 sine 下必须为正数')));

  const noDur = JSON.parse(JSON.stringify(VALID));
  noDur.states.fire.animation = [{ prop: 'scaleX', type: 'pulse', amp: 0.1 }];
  assert.ok(validateMaterial(noDur).some((e) => e.message.includes('duration 在 pulse 下必须为正数')));
});

test('空动画数组报错', () => {
  const noAnim = JSON.parse(JSON.stringify(VALID));
  noAnim.states.idle.animation = [];
  assert.ok(validateMaterial(noAnim).some((e) => e.message.includes('animation 不能为空数组')));
});

test('物料必须声明 text 或 image 类型', () => {
  const noType = JSON.parse(JSON.stringify(VALID));
  delete noType.type;
  assert.ok(validateMaterial(noType).some((e) => e.message.includes('type 必须为 text 或 image')));

  const badType = JSON.parse(JSON.stringify(VALID));
  badType.type = 'video';
  assert.ok(validateMaterial(badType).some((e) => e.message.includes('type 必须为 text 或 image')));
});

function makeImageMaterial(fileExists) {
  const base = {
    schemaVersion: 1,
    id: 'img',
    type: 'image',
    states: {
      fire: { image: './fire.png', animation: [{ prop: 'scaleX', type: 'pulse', amp: 0.16, duration: 0.25 }] },
      walk: { image: './walk.png', animation: [{ prop: 'scaleX', type: 'sine', amp: 0.1, freq: 9 }] },
      idle: { image: './idle.png', animation: [{ prop: 'scaleY', type: 'sine', amp: 0.02, freq: 2.2 }] },
    },
  };
  if (fileExists) return base;
  return base;
}

test('image 类型每状态必须指定单帧图片且文件存在', () => {
  const missing = makeImageMaterial(false);
  const errs = validateMaterial(missing, '/virtual/skin/character.json');
  assert.ok(errs.some((e) => e.message.includes('引用的图片文件不存在')));
});

test('image 类型拒绝 frames 多帧声明', () => {
  const m = makeImageMaterial(true);
  m.states.walk.frames = ['./w0.png', './w1.png'];
  const errs = validateMaterial(m, '/virtual/skin/character.json');
  assert.ok(errs.some((e) => e.message.includes('frames 不被支持')));
});

test('image 类型每状态 image 必填，缺失报错', () => {
  const m = makeImageMaterial(true);
  delete m.states.idle.image;
  const errs = validateMaterial(m, '/virtual/skin/character.json');
  assert.ok(errs.some((e) => e.message.includes('states.idle.image 必填')));
});
