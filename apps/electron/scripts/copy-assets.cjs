const fs = require('node:fs');
const path = require('node:path');

const assets = [
  {
    src: path.join(__dirname, '../main/loading.html'),
    dest: path.join(__dirname, '../dist-electron/main/loading.html'),
  },
  {
    src: path.join(__dirname, '../main/update-available-dialog.html'),
    dest: path.join(__dirname, '../dist-electron/main/update-available-dialog.html'),
  },
  {
    src: path.join(__dirname, '../main/update-progress-dialog.html'),
    dest: path.join(__dirname, '../dist-electron/main/update-progress-dialog.html'),
  },
  {
    src: path.join(__dirname, '../../../public/logo.png'),
    dest: path.join(__dirname, '../dist-electron/main/logo.png'),
  },
];

for (const asset of assets) {
  fs.mkdirSync(path.dirname(asset.dest), { recursive: true });
  fs.copyFileSync(asset.src, asset.dest);
}
