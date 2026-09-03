// 安装后复制 mitt 的 ESM 产物，供渲染进程无需打包器直接引用
const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '..', 'node_modules', 'mitt', 'dist', 'mitt.mjs');
const destinationDirectory = path.join(__dirname, '..', 'src', 'vendor');
const destination = path.join(destinationDirectory, 'mitt.mjs');

if (!fs.existsSync(source)) {
  console.error('未找到 mitt 产物：' + source);
  process.exit(1);
}

fs.mkdirSync(destinationDirectory, { recursive: true });
fs.copyFileSync(source, destination);
console.log('已拷贝 mitt 运行时到 src/vendor/mitt.mjs');
