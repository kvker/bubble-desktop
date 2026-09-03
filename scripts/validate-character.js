// 角色物料 JSON 完整性验证：扫描 skins/，按 type 区分 text/image。
// text：强制每状态显式非空文字；image：强制每状态单帧图片文件存在，拒绝 frames/多帧。
const fs = require('fs');
const path = require('path');

const SKINS_DIR = path.resolve(__dirname, '..', 'skins');
const STATE_KEYS = ['fire', 'walk', 'idle'];
const PROPS = ['scaleX', 'scaleY', 'skewX', 'y'];
const TYPES = ['sine', 'pulse'];
const MATERIAL_TYPES = ['text', 'image'];

function validateMaterial(material, sourcePath) {
  const errors = [];
  if (!material || typeof material !== 'object') {
    return [{ message: '物料必须是对象' }];
  }
  if (material.schemaVersion !== 1) {
    errors.push({ message: `schemaVersion 必须为 1，实际 ${material.schemaVersion}` });
  }
  if (typeof material.id !== 'string' || !material.id.trim()) {
    errors.push({ message: 'id 必填且不能为空字符串' });
  }
  if (!MATERIAL_TYPES.includes(material.type)) {
    errors.push({ message: `type 必须为 ${MATERIAL_TYPES.join(' 或 ')}，实际 ${material.type}` });
  }

  if (material.type === 'text') {
    if (!material.style || typeof material.style !== 'object') {
      errors.push({ message: 'style 必填且为对象（text 类型）' });
    } else {
      if (typeof material.style.fontSize !== 'number' || material.style.fontSize <= 0) {
        errors.push({ message: `style.fontSize 必须是正数，实际 ${material.style.fontSize}` });
      }
      if (typeof material.style.fill !== 'string' || !material.style.fill.trim()) {
        errors.push({ message: `style.fill 必须是颜色字符串，实际 ${material.style.fill}` });
      }
    }
  } else if (material.type === 'image' && typeof sourcePath !== 'string') {
    errors.push({ message: 'image 类型必须提供 sourcePath 以校验图片文件' });
  }

  if (!material.states || typeof material.states !== 'object') {
    errors.push({ message: 'states 必填且为对象' });
  } else {
    for (const key of STATE_KEYS) {
      const state = material.states[key];
      if (!state || typeof state !== 'object') {
        errors.push({ message: `states.${key} 状态缺失` });
        continue;
      }
      if (material.type === 'text') {
        if (typeof state.text !== 'string' || !state.text.trim()) {
          errors.push({ message: `states.${key}.text 必填且不能为空字符串（即使与其它状态相同也必须显式写出）` });
        }
      } else if (material.type === 'image') {
        if (typeof state.image !== 'string' || !state.image.trim()) {
          errors.push({ message: `states.${key}.image 必填且不能为空字符串（每状态一张单帧图）` });
        } else if (sourcePath) {
          const imgPath = path.resolve(path.dirname(sourcePath), state.image);
          if (!fs.existsSync(imgPath)) {
            errors.push({ message: `states.${key}.image 引用的图片文件不存在：${imgPath}` });
          }
        }
        if (state.frames !== undefined) {
          errors.push({ message: `states.${key}.frames 不被支持：image 类型仅支持单帧图` });
        }
      }
      if (!Array.isArray(state.animation)) {
        errors.push({ message: `states.${key}.animation 必须是数组` });
        continue;
      }
      if (state.animation.length === 0) {
        errors.push({ message: `states.${key}.animation 不能为空数组` });
      }
      state.animation.forEach((item, i) => {
        if (!item || typeof item !== 'object') {
          errors.push({ message: `states.${key}.animation[${i}] 必须是对象` });
          return;
        }
        if (!PROPS.includes(item.prop)) {
          errors.push({ message: `states.${key}.animation[${i}].prop 无效：${item.prop}（允许 ${PROPS.join('/')}）` });
        }
        if (!TYPES.includes(item.type)) {
          errors.push({ message: `states.${key}.animation[${i}].type 无效：${item.type}（允许 ${TYPES.join('/')}）` });
        }
        if (typeof item.amp !== 'number' || !Number.isFinite(item.amp)) {
          errors.push({ message: `states.${key}.animation[${i}].amp 必须是有限数值` });
        }
        if (item.type === 'sine' && (typeof item.freq !== 'number' || item.freq <= 0)) {
          errors.push({ message: `states.${key}.animation[${i}].freq 在 sine 下必须为正数` });
        }
        if (item.type === 'pulse' && (typeof item.duration !== 'number' || item.duration <= 0)) {
          errors.push({ message: `states.${key}.animation[${i}].duration 在 pulse 下必须为正数` });
        }
      });
    }
  }
  return errors;
}

function scanSkins(dir = SKINS_DIR) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { files: [], upToDate: false, error: `skins 目录不存在：${dir}` };
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const filePath = path.join(dir, entry.name, 'character.json');
    if (!fs.existsSync(filePath)) {
      results.push({ id: entry.name, file: filePath, ok: false, errors: [{ message: '缺少 character.json' }] });
      continue;
    }
    let material;
    try {
      material = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      results.push({ id: entry.name, file: filePath, ok: false, errors: [{ message: `JSON 解析失败：${e.message}` }] });
      continue;
    }
    const errors = validateMaterial(material, filePath);
    results.push({ id: entry.name, file: filePath, ok: errors.length === 0, errors });
  }
  return { files: results, upToDate: true };
}

function run() {
  const { files, upToDate, error } = scanSkins();
  if (error) {
    console.error(error);
    process.exit(1);
  }
  let failed = 0;
  for (const r of files) {
    if (r.ok) {
      console.log(`PASS  ${r.id}  ${r.file}`);
    } else {
      failed += 1;
      console.error(`FAIL  ${r.id}  ${r.file}`);
      for (const e of r.errors) console.error(`      - ${e.message}`);
    }
  }
  console.log(`\n进度：${files.length - failed}/${files.length} 个物料通过验证`);
  if (!upToDate || failed > 0) process.exit(1);
}

module.exports = { validateMaterial, scanSkins, STATE_KEYS, PROPS, TYPES, MATERIAL_TYPES };

if (require.main === module) run();
