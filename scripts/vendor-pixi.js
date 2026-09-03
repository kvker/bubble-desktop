// 安装后把 Pixi 的 ESM 产物拷贝到 src/vendor，供渲染进程直接以 <script type="module"> 引入，无需打包器
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'pixi.js', 'dist', 'pixi.mjs');
const destDir = path.join(__dirname, '..', 'src', 'vendor');
const dest = path.join(destDir, 'pixi.mjs');

if (!fs.existsSync(src)) {
  console.error('未找到 pixi.js 产物：' + src);
  process.exit(1);
}
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('已拷贝 Pixi 运行时到 src/vendor/pixi.mjs');
