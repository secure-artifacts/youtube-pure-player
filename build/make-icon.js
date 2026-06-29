// 生成 Windows 多尺寸 icon.ico 与 256x256 icon.png
const path = require('path');
const sharp = require('sharp');
const pngToIcoMod = require('png-to-ico');
const pngToIco = pngToIcoMod.default || pngToIcoMod;
const fs = require('fs');

const SRC = path.join(__dirname, 'icon-source.png');
const SIZES = [256, 128, 64, 48, 32, 16];

(async () => {
  const buffers = [];
  for (const size of SIZES) {
    buffers.push(await sharp(SRC).resize(size, size, { fit: 'contain' }).png().toBuffer());
  }
  // 256 的 png 也单独输出，供窗口图标等使用
  fs.writeFileSync(path.join(__dirname, 'icon.png'), buffers[0]);
  const ico = await pngToIco(buffers);
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), ico);
  console.log('icon.ico / icon.png 生成完成');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
