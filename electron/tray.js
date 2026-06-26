const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');

let tray = null;

/**
 * 创建系统托盘
 */
function createTray(mainWindow) {
  // 创建一个 16x16 的托盘图标（纯色方块，后续可替换为 .ico 文件）
  const icon = nativeImage.createEmpty();

  tray = new Tray(createTrayIcon());
  tray.setToolTip('桌面整理');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: '重新扫描桌面',
      click: () => {
        mainWindow.show();
        mainWindow.webContents.send('trigger-rescan');
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // 单击托盘图标显示窗口
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return tray;
}

/**
 * 生成托盘图标（简单绘制）
 */
function createTrayIcon() {
  const { nativeImage } = require('electron');
  // 16x16 的蓝色方块作为临时图标
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      // 绘制一个简单的桌面图标形状
      const inBorder = x < 2 || x >= size - 2 || y < 2 || y >= size - 2;
      const inInner = x >= 4 && x < size - 4 && y >= 4 && y < size - 4;

      if (inBorder) {
        canvas[idx] = 59;      // R
        canvas[idx + 1] = 130;  // G
        canvas[idx + 2] = 246;  // B
        canvas[idx + 3] = 255;  // A
      } else if (inInner) {
        canvas[idx] = 96;       // R
        canvas[idx + 1] = 165;  // G
        canvas[idx + 2] = 250;  // B
        canvas[idx + 3] = 255;  // A
      } else {
        canvas[idx] = 0;
        canvas[idx + 1] = 0;
        canvas[idx + 2] = 0;
        canvas[idx + 3] = 0;
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

/**
 * 销毁托盘
 */
function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { createTray, destroyTray };
