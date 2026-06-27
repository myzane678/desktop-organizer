const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, shell } = require('electron');

function getResourcePath(...segments) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', ...segments);
  }
  return path.join(__dirname, '..', ...segments);
}

// 桌面路径：同时扫描用户桌面和公开桌面
const DESKTOP_PATHS = [
  path.join(os.homedir(), 'Desktop'),
  path.join(os.homedir(), '桌面'),
  'C:\\Users\\Public\\Desktop',
];

// 通过 SHGetKnownFolderPath 获取真实桌面路径（首选：处理 OneDrive 任意盘符/已知文件夹重定向）
function getKnownDesktopPath() {
  try {
    const { execFileSync } = require('child_process');
    // 内联 C# 调用 shell32!SHGetKnownFolderPath(FOLDERID_Desktop)，用 -EncodedCommand 规避多行转义
    const script = [
      "$ProgressPreference='SilentlyContinue'",
      "$cs=@'",
      'using System;',
      'using System.Runtime.InteropServices;',
      'public static class KF {',
      '  [DllImport("shell32.dll")]',
      '  public static extern int SHGetKnownFolderPath([MarshalAs(UnmanagedType.LPStruct)] Guid id, uint flags, IntPtr token, out IntPtr path);',
      '  public static string Desktop() {',
      '    Guid g = new Guid("B4BFCC3A-DB2C-424C-B029-7FE99A87C641");',
      '    IntPtr p; int hr = SHGetKnownFolderPath(g, 0, IntPtr.Zero, out p);',
      '    if (hr != 0) return "";',
      '    string s = Marshal.PtrToStringUni(p); Marshal.FreeCoTaskMem(p); return s;',
      '  }',
      '}',
      "'@",
      'Add-Type -TypeDefinition $cs',
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8',
      '[KF]::Desktop()',
    ].join('\n');
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const out = execFileSync('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded,
    ], { encoding: 'utf8', timeout: 8000, windowsHide: true }).trim();
    return out || null;
  } catch {
    return null;
  }
}

// 从注册表读取真实桌面路径（兜底：展开 %USERPROFILE% 等环境变量）
function getRegistryDesktopPath() {
  try {
    const { execSync } = require('child_process');
    const psCmd = "$ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; $p=(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders' -EA SilentlyContinue).Desktop; if($p){[Environment]::ExpandEnvironmentVariables($p)}";
    const out = execSync('powershell.exe -NoProfile -Command "' + psCmd + '"', {
      encoding: 'utf8', timeout: 5000, windowsHide: true,
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

// 解析顺序：SHGetKnownFolderPath（首选）→ 注册表（兜底）→ 默认拼接路径
for (const resolver of [getKnownDesktopPath, getRegistryDesktopPath]) {
  const real = resolver();
  if (real && fs.existsSync(real) && !DESKTOP_PATHS.includes(real)) {
    DESKTOP_PATHS.unshift(real);
    break;
  }
}

/**
 * 读取 .lnk 快捷方式的目标路径
 * 使用 windows-shortcuts 包解析
 */
function readShortcut(lnkPath) {
  return new Promise((resolve) => {
    try {
      const ws = require('windows-shortcuts');
      ws.query(lnkPath, (err, info) => {
        if (err) {
          resolve({ target: null, args: null, icon: null });
          return;
        }
        resolve({
          target: info.target || null,
          args: info.args || null,
          icon: info.icon || null,
          workingDir: info.workingDir || null,
        });
      });
    } catch {
      resolve({ target: null, args: null, icon: null });
    }
  });
}

/**
 * 批量提取文件图标（Shell API，比 Electron nativeImage 更可靠）
 */
function extractIconsBatch(filePaths) {
  const diagnostics = { requested: filePaths.length, batches: 0, failedBatches: 0, extracted: 0, errors: [] };
  if (filePaths.length === 0) return { icons: {}, diagnostics };
  const { execFileSync } = require('child_process');
  const psScript = getResourcePath('electron', 'extract-icons.ps1');
  const mapped = {};
  const batchSize = 25;

  for (let i = 0; i < filePaths.length; i += batchSize) {
    const batch = filePaths.slice(i, i + batchSize);
    diagnostics.batches++;
    try {
      const jsonPaths = JSON.stringify(batch.map(p => p.replace(/\\/g, '/')));
      const out = execFileSync('powershell.exe', [
        '-STA', '-ExecutionPolicy', 'Bypass',
        '-File', psScript,
        '-Paths', jsonPaths,
      ], { encoding: 'utf8', timeout: 30000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
      const result = JSON.parse(out.trim() || '{}');
      for (const [k, v] of Object.entries(result)) {
        mapped[k.replace(/\//g, '\\')] = v;
      }
    } catch (err) {
      diagnostics.failedBatches++;
      diagnostics.errors.push(err.message);
      console.warn('提取桌面图标失败:', err.message);
    }
  }

  diagnostics.extracted = Object.keys(mapped).length;
  return { icons: mapped, diagnostics };
}

/**
 * 获取文件图标（Electron 内置，备用）
 */
async function getFileIcon(filePath) {
  try {
    const { nativeImage } = require('electron');
    const icon = await nativeImage.createThumbnailFromPath(filePath, { width: 64, height: 64 });
    return icon.toDataURL();
  } catch {
    return null;
  }
}

/**
 * 扫描单个桌面路径
 */
async function scanPath(desktopPath) {
  const items = [];

  let entries;
  try {
    entries = fs.readdirSync(desktopPath, { withFileTypes: true });
  } catch (err) {
    console.error('无法读取路径:', desktopPath, err.message);
    return items;
  }

  for (const entry of entries) {
    const fullPath = path.join(desktopPath, entry.name);
    const ext = path.extname(entry.name).toLowerCase();
    const name = entry.name;

    if (name === 'desktop.ini') continue;

    const item = {
      id: fullPath,
      name: path.parse(name).name,
      fullName: name,
      path: fullPath,
      ext: ext,
      isDirectory: entry.isDirectory(),
      isShortcut: ext === '.lnk',
      isFile: entry.isFile(),
      category: '未分类',
      shortcutInfo: null,
      icon: null,
    };

    if (item.isShortcut) {
      item.shortcutInfo = await readShortcut(fullPath);
    }

    items.push(item);
  }

  return items;
}

/**
 * 扫描所有桌面路径并合并去重
 */
async function scanDesktop() {
  const seen = new Set();
  const items = [];

  for (const desktopPath of DESKTOP_PATHS) {
    if (!fs.existsSync(desktopPath)) continue;
    const pathItems = await scanPath(desktopPath);
    for (const item of pathItems) {
      if (!seen.has(item.fullName)) {
        seen.add(item.fullName);
        items.push(item);
      }
    }
  }

  // 批量提取图标（Shell API，比 Electron nativeImage 更可靠）
  const filePaths = items.filter(i => !i.isDirectory).map(i => i.path);
  const iconResult = extractIconsBatch(filePaths);
  const iconMap = iconResult.icons || {};
  for (const item of items) {
    item.icon = iconMap[item.path] || null;
  }
  Object.defineProperty(items, '_iconDiagnostics', {
    value: iconResult.diagnostics,
    enumerable: false,
  });
  return items;
}

/**
 * 在资源管理器中打开文件/文件夹所在位置
 */
function showInExplorer(filePath) {
  shell.showItemInFolder(filePath);
}

/**
 * 启动文件/程序
 */
function openFile(filePath) {
  shell.openPath(filePath);
}

module.exports = {
  scanDesktop,
  showInExplorer,
  openFile,
  DESKTOP_PATHS,
};
