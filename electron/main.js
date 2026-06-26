const { app, BrowserWindow, ipcMain, globalShortcut, Menu } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { scanDesktop, showInExplorer, openFile, DESKTOP_PATHS } = require('./scanner');
const { classifyAll, setItemCategory, removeItemCategory, loadRules, saveRules, loadCategories, saveCategories, updateCategoryProfile } = require('./classifier');
const { createTray, destroyTray } = require('./tray');
const { generatePlan, packItems } = require('./organizer');

let mainWindow = null;

const CONFIG_DIR = path.join(os.homedir(), '.desktop-organizer');
const CONSENT_FILE = path.join(CONFIG_DIR, 'consent.json');
const ONBOARDING_FILE = path.join(CONFIG_DIR, 'onboarding.json');
const LAYOUTS_FILE = path.join(CONFIG_DIR, 'layouts.json');
const GRID_CONFIG_FILE = path.join(CONFIG_DIR, 'grid-config.json');
const CONSENT_VERSION = 1;
const ONBOARDING_VERSION = 1;

function getResourcePath(...segments) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', ...segments);
  }
  return path.join(__dirname, '..', ...segments);
}

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadConsent() {
  ensureConfigDir();
  if (!fs.existsSync(CONSENT_FILE)) return null;
  return JSON.parse(fs.readFileSync(CONSENT_FILE, 'utf-8'));
}

function hasValidConsent() {
  const consent = loadConsent();
  return !!consent && consent.accepted === true && Number(consent.version) >= CONSENT_VERSION;
}

function saveConsent() {
  ensureConfigDir();
  const consent = {
    accepted: true,
    version: CONSENT_VERSION,
    acceptedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
  };
  fs.writeFileSync(CONSENT_FILE, JSON.stringify(consent, null, 2), 'utf-8');
  return consent;
}

function getConsentStatus() {
  const consent = loadConsent();
  return {
    accepted: hasValidConsent(),
    version: consent?.version || 0,
    requiredVersion: CONSENT_VERSION,
    acceptedAt: consent?.acceptedAt || null,
  };
}

function requireConsent() {
  if (!hasValidConsent()) {
    throw new Error('需要先同意用户条款与隐私说明后才能扫描桌面');
  }
}

function getEmptyLayouts() {
  return { version: 1, updatedAt: null, snapshots: [], schemes: [] };
}

function loadLayouts() {
  ensureConfigDir();
  if (!fs.existsSync(LAYOUTS_FILE)) return getEmptyLayouts();
  const data = JSON.parse(fs.readFileSync(LAYOUTS_FILE, 'utf-8'));
  return {
    version: 1,
    updatedAt: data.updatedAt || null,
    snapshots: Array.isArray(data.snapshots) ? data.snapshots : [],
    schemes: Array.isArray(data.schemes) ? data.schemes : [],
  };
}

function saveLayouts(layouts) {
  ensureConfigDir();
  const data = {
    version: 1,
    updatedAt: new Date().toISOString(),
    snapshots: Array.isArray(layouts.snapshots) ? layouts.snapshots : [],
    schemes: Array.isArray(layouts.schemes) ? layouts.schemes : [],
  };
  fs.writeFileSync(LAYOUTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  return data;
}

function createLayoutId(prefix) {
  return `${prefix}_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 8)}`;
}

function countLayoutItems(layoutData) {
  if (!layoutData || typeof layoutData !== 'object') return 0;
  if (Array.isArray(layoutData.items)) return layoutData.items.length;
  return Object.entries(layoutData).reduce((sum, [key, value]) => {
    if (key.startsWith('_') || !Array.isArray(value)) return sum;
    return sum + value.length;
  }, 0);
}

function getLayoutPreviewItems(layoutData) {
  if (!layoutData || typeof layoutData !== 'object') return [];
  if (Array.isArray(layoutData.items)) return layoutData.items;
  return Object.entries(layoutData).flatMap(([key, value]) => {
    if (key.startsWith('_') || !Array.isArray(value)) return [];
    return value;
  });
}

function isUsablePreviewIcon(icon) {
  return typeof icon === 'string' && icon.startsWith('data:image/') && icon.length <= 100 * 1024;
}

function buildIconLookup(desktopItems) {
  const map = new Map();
  for (const item of Array.isArray(desktopItems) ? desktopItems : []) {
    if (!isUsablePreviewIcon(item.icon)) continue;
    for (const key of [item.fullName, item.name, path.basename(item.path || '')]) {
      if (key && !map.has(key)) map.set(key, item.icon);
    }
  }
  return map;
}

function attachPreviewIcons(layoutData, desktopItems) {
  const items = getLayoutPreviewItems(layoutData);
  const iconLookup = buildIconLookup(desktopItems);
  const previewIcons = {};
  const iconKeys = new Map();
  let iconCount = 0;

  for (const item of items) {
    const icon = isUsablePreviewIcon(item.icon)
      ? item.icon
      : iconLookup.get(item.name) || iconLookup.get(item.fullName);
    if (!icon) continue;
    let key = iconKeys.get(icon);
    if (!key) {
      if (iconCount >= 300) continue;
      key = `i${++iconCount}`;
      iconKeys.set(icon, key);
      previewIcons[key] = icon;
    }
    item.iconKey = key;
    delete item.icon;
  }

  return previewIcons;
}

function getLayoutPreview(record) {
  const items = getLayoutPreviewItems(record?.layoutData);
  return {
    grid: record?.grid || null,
    items: items.filter(Boolean).map(item => ({
      name: item.name || '',
      gridX: Number.isInteger(item.gridX) ? item.gridX : 0,
      gridY: Number.isInteger(item.gridY) ? item.gridY : 0,
      pixelX: Number.isFinite(item.pixelX) ? Math.round(item.pixelX) : null,
      pixelY: Number.isFinite(item.pixelY) ? Math.round(item.pixelY) : null,
      iconKey: item.iconKey || null,
    })),
  };
}

function getLayoutSummary(record) {
  return {
    id: record.id,
    type: record.type,
    name: record.name,
    source: record.source || null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt || null,
    itemCount: record.itemCount || countLayoutItems(record.layoutData),
    preview: getLayoutPreview(record),
    previewIcons: record.previewIcons || {},
  };
}

function getSafeLayoutSummary(record, index, collectionName) {
  try {
    return getLayoutSummary(record || {});
  } catch (err) {
    console.error(`[layouts] summary failed: ${collectionName}[${index}]`, err);
    return {
      id: record?.id || `${collectionName}_${index}`,
      type: record?.type || (collectionName === 'snapshots' ? 'snapshot' : 'scheme'),
      name: record?.name || '损坏的布局记录',
      source: record?.source || null,
      createdAt: record?.createdAt || null,
      updatedAt: record?.updatedAt || null,
      itemCount: 0,
      preview: { grid: null, items: [] },
      broken: true,
      error: err?.message || '读取失败',
    };
  }
}

function listLayoutSummaries() {
  const layouts = loadLayouts();
  return {
    snapshots: (Array.isArray(layouts.snapshots) ? layouts.snapshots : []).map((record, index) => getSafeLayoutSummary(record, index, 'snapshots')),
    schemes: (Array.isArray(layouts.schemes) ? layouts.schemes : []).map((record, index) => getSafeLayoutSummary(record, index, 'schemes')),
  };
}

function getLayoutCollection(layouts, type) {
  if (type === 'snapshot') return layouts.snapshots;
  if (type === 'scheme') return layouts.schemes;
  throw new Error('未知布局类型');
}

function findLayoutRecord(layouts, type, id) {
  const collection = getLayoutCollection(layouts, type);
  const record = collection.find(item => item.id === id);
  if (!record) throw new Error('找不到布局记录');
  return record;
}

function getSnapshotName(source) {
  const label = source === 'before-restore' ? '恢复前快照' : '整理前快照';
  const text = new Date().toLocaleString('zh-CN', { hour12: false });
  return `${label} ${text}`;
}

async function readDesktopLayoutPositions() {
  const posData = await readDesktopPositionsViaUIA().catch(() => readDesktopIconPositions());
  const rawIcons = Array.isArray(posData?.icons) ? posData.icons : [];
  const icons = rawIcons.some(icon => Number.isInteger(icon.gridX) && Number.isInteger(icon.gridY))
    ? rawIcons
    : enrichGridCoords(rawIcons, posData);
  const grid = inferDesktopGrid(posData, icons);
  const items = icons
    .filter(icon => icon.name && Number.isFinite(icon.x) && Number.isFinite(icon.y))
    .map(icon => ({
      name: icon.name,
      gridX: Number.isInteger(icon.gridX) ? icon.gridX : 0,
      gridY: Number.isInteger(icon.gridY) ? icon.gridY : 0,
      pixelX: Math.round(icon.x),
      pixelY: Math.round(icon.y),
    }))
    .sort((a, b) => a.gridY - b.gridY || a.gridX - b.gridX || a.name.localeCompare(b.name, 'zh-CN'));

  return { grid, layoutData: { _mode: 'absolute', items } };
}

// 计算布局指纹：只看真实布局内容，忽略 id/name/createdAt
function computeLayoutFingerprint(layoutData) {
  const items = Array.isArray(layoutData?.items) ? layoutData.items : [];
  const normalized = items
    .map(item => ({
      name: item.fullName || item.name || '',
      gridX: Number.isInteger(item.gridX) ? item.gridX : 0,
      gridY: Number.isInteger(item.gridY) ? item.gridY : 0,
      pixelX: Number.isFinite(item.pixelX) ? Math.round(item.pixelX) : 0,
      pixelY: Number.isFinite(item.pixelY) ? Math.round(item.pixelY) : 0,
    }))
    .filter(item => item.name)
    .sort((a, b) => a.name.localeCompare(b.name)); // 按 name 排序，避免顺序不同导致误判
  return JSON.stringify(normalized);
}

async function createLayoutSnapshot(payload = {}) {
  const source = payload.source || 'manual';
  const captured = await readDesktopLayoutPositions();
  let desktopItems = [];
  try {
    desktopItems = await scanDesktop();
  } catch (err) {
    console.warn('[layouts] 读取预览图标失败:', err.message);
  }
  const previewIcons = attachPreviewIcons(captured.layoutData, desktopItems);
  const createdAt = new Date().toISOString();
  const record = {
    id: createLayoutId('snap'),
    type: 'snapshot',
    name: payload.name || getSnapshotName(source),
    source,
    createdAt,
    itemCount: countLayoutItems(captured.layoutData),
    grid: captured.grid,
    layoutData: captured.layoutData,
    previewIcons,
    fingerprint: computeLayoutFingerprint(captured.layoutData),
  };

  const layouts = loadLayouts();
  // 只和最近一条快照比对，布局没变就跳过，不重复记录
  const latest = layouts.snapshots[0];
  if (latest && latest.fingerprint === record.fingerprint) {
    return { ...getLayoutSummary(latest), skipped: true, duplicateOf: latest.id };
  }
  layouts.snapshots.unshift(record);
  layouts.snapshots = layouts.snapshots
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20);
  saveLayouts(layouts);
  return getLayoutSummary(record);
}

function normalizeSchemeLayout(layoutData) {
  const items = [];
  const grouped = {};
  const spacingX = toPositiveInt(layoutData?._spacingX) || 115;
  const spacingY = toPositiveInt(layoutData?._spacingY) || 147;
  const startX = toPositiveInt(layoutData?._startX) || 20;
  const startY = toPositiveInt(layoutData?._startY) || 2;
  for (const [category, value] of Object.entries(layoutData || {})) {
    if (category.startsWith('_') || !Array.isArray(value)) continue;
    grouped[category] = value.map(item => {
      const gridX = Number.isInteger(item.gridX) ? item.gridX : 0;
      const gridY = Number.isInteger(item.gridY) ? item.gridY : 0;
      return {
        name: item.fullName || item.name,
        fullName: item.fullName || item.name,
        icon: item.icon || null,
        category,
        gridX,
        gridY,
        pixelX: Number.isFinite(item.pixelX) ? Math.round(item.pixelX) : startX + gridX * spacingX + spacingX / 2,
        pixelY: Number.isFinite(item.pixelY) ? Math.round(item.pixelY) : startY + gridY * spacingY + spacingY / 2,
      };
    }).filter(item => item.name);
    items.push(...grouped[category]);
  }
  return { grouped, absolute: { _mode: 'absolute', items } };
}

function saveLayoutScheme(payload = {}) {
  const name = String(payload.name || '').trim();
  if (!name) throw new Error('方案名不能为空');
  if (name.length > 40) throw new Error('方案名不能超过 40 个字');

  const normalized = normalizeSchemeLayout(payload.layoutData);
  const itemCount = countLayoutItems(normalized.absolute);
  if (itemCount === 0) throw new Error('布局方案不能为空');

  const now = new Date().toISOString();
  const previewIcons = attachPreviewIcons(normalized.absolute, []);
  const record = {
    id: createLayoutId('scheme'),
    type: 'scheme',
    name,
    createdAt: now,
    updatedAt: now,
    itemCount,
    grid: payload.grid || null,
    groups: normalized.grouped,
    layoutData: normalized.absolute,
    previewIcons,
  };

  const layouts = loadLayouts();
  layouts.schemes.unshift(record);
  saveLayouts(layouts);
  return getLayoutSummary(record);
}

function renameLayoutScheme(id, name) {
  const nextName = String(name || '').trim();
  if (!nextName) throw new Error('方案名不能为空');
  if (nextName.length > 40) throw new Error('方案名不能超过 40 个字');
  const layouts = loadLayouts();
  const record = findLayoutRecord(layouts, 'scheme', id);
  record.name = nextName;
  record.updatedAt = new Date().toISOString();
  saveLayouts(layouts);
  return getLayoutSummary(record);
}

function deleteLayoutRecord(type, id) {
  return deleteLayoutRecords(type, [id]);
}

// 批量删除：一次过滤、只写一次盘。ids 为空时清空整个分区
function deleteLayoutRecords(type, ids) {
  const layouts = loadLayouts();
  const list = Array.isArray(ids) ? ids : [];
  const removeAll = list.length === 0;
  const idSet = new Set(list);
  if (type === 'snapshot') {
    layouts.snapshots = removeAll ? [] : layouts.snapshots.filter(item => !idSet.has(item.id));
  } else if (type === 'scheme') {
    layouts.schemes = removeAll ? [] : layouts.schemes.filter(item => !idSet.has(item.id));
  } else {
    throw new Error('未知布局类型');
  }
  saveLayouts(layouts);
  return listLayoutSummaries();
}

async function restoreLayout(payload = {}) {
  const layouts = loadLayouts();
  const type = payload.type;
  const record = findLayoutRecord(layouts, type, payload.id);
  let preRestoreSnapshot = null;
  if (payload.createSnapshotBeforeRestore) {
    preRestoreSnapshot = await createLayoutSnapshot({ source: 'before-restore' });
  }
  const output = await repositionDesktopIcons(record.layoutData, payload.currentPositions);
  return { ok: true, output, preRestoreSnapshot };
}

function loadOnboarding() {
  ensureConfigDir();
  if (!fs.existsSync(ONBOARDING_FILE)) return null;
  return JSON.parse(fs.readFileSync(ONBOARDING_FILE, 'utf-8'));
}

function getOnboardingStatus() {
  const onboarding = loadOnboarding();
  const completed = !!onboarding && onboarding.completed === true && Number(onboarding.version) >= ONBOARDING_VERSION;
  return {
    completed,
    skipped: !!onboarding?.skipped,
    version: onboarding?.version || 0,
    requiredVersion: ONBOARDING_VERSION,
    completedAt: onboarding?.completedAt || null,
  };
}

function completeOnboarding(payload = {}) {
  ensureConfigDir();
  const onboarding = {
    completed: true,
    skipped: !!payload.skipped,
    version: ONBOARDING_VERSION,
    completedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
  };
  fs.writeFileSync(ONBOARDING_FILE, JSON.stringify(onboarding, null, 2), 'utf-8');
  return onboarding;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '桌面整理',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 调用 PowerShell 重排桌面图标
// currentPositions: [{name, x, y}] 当前桌面图标坐标
function repositionDesktopIcons(layoutData, currentPositions) {
  return new Promise((resolve, reject) => {
    const psScript = getResourcePath('electron', 'desktop-reposition.ps1');
    const payload = { ...layoutData, currentPositions: currentPositions || [] };
    const jsonStr = JSON.stringify(payload);

    // 调试日志
    const itemCount = Array.isArray(payload.items) ? payload.items.length : 0;
    const posCount = Array.isArray(payload.currentPositions) ? payload.currentPositions.length : 0;
    console.log(`[reposition] mode=${payload._mode} items=${itemCount} positions=${posCount}`);
    if (itemCount > 0) {
      console.log('[reposition] first item:', JSON.stringify(payload.items[0]));
    }
    if (posCount > 0) {
      console.log('[reposition] first pos:', JSON.stringify(payload.currentPositions[0]));
    }

    execFile('powershell.exe', [
      '-STA',
      '-ExecutionPolicy', 'Bypass',
      '-File', psScript,
      '-LayoutJson', jsonStr,
    ], { timeout: 60000 }, (err, stdout, stderr) => {
      console.log('[reposition] PS output:', stdout);
      if (stderr) console.error('[reposition stderr]', stderr);
      if (err) {
        const output = stdout || stderr || err.message;
        reject(new Error(output));
        return;
      }
      resolve(stdout);
    });
  });
}

// 调用 PowerShell 读取桌面图标位置（Registry 方案，备用）
function readDesktopIconPositions() {
  return new Promise((resolve, reject) => {
    const psScript = getResourcePath('electron', 'read-desktop-icons.ps1');
    execFile('powershell.exe', [
      '-ExecutionPolicy', 'Bypass',
      '-File', psScript,
    ], { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (e) {
        reject(new Error('解析桌面图标数据失败: ' + stdout));
      }
    });
  });
}

// 调用 PowerShell 读取桌面图标真实像素位置（UI Automation 方案）
function readDesktopPositionsViaUIA() {
  return new Promise((resolve, reject) => {
    const psScript = getResourcePath('electron', 'read-desktop-positions.ps1');
    execFile('powershell.exe', [
      '-STA', '-ExecutionPolicy', 'Bypass',
      '-File', psScript,
    ], { timeout: 20000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (e) {
        reject(new Error('解析桌面位置数据失败: ' + stdout));
      }
    });
  });
}

function inferGridPositions(values) {
  const sorted = [...new Set(values.filter(v => Number.isFinite(v)))].sort((a, b) => a - b);
  if (sorted.length === 0) return { positions: [], indexMap: new Map(), step: 0 };
  if (sorted.length === 1) return { positions: sorted, indexMap: new Map([[sorted[0], 0]]), step: 0 };

  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap > 0) gaps.push(gap);
  }
  // 用最小正间隔作为步长（相邻图标最近距离=真实单格间距）
  // 中位数容易被空列（大间隔）拉高，导致格数偏少
  const step = gaps.length > 0 ? Math.min(...gaps) : 1;

  const positions = [];
  const start = sorted[0];
  const end = sorted[sorted.length - 1];
  for (let value = start; value <= end + step * 0.3; value += step) {
    positions.push(Math.round(value));
  }

  const indexMap = new Map();
  for (const value of sorted) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < positions.length; i++) {
      const dist = Math.abs(value - positions[i]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    indexMap.set(value, bestIdx);
  }

  return { positions, indexMap, step };
}

function toPositiveInt(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.round(num) : 0;
}

function estimateGridCount(size, spacing) {
  const safeSize = Number(size);
  const safeSpacing = Number(spacing);
  if (!Number.isFinite(safeSize) || !Number.isFinite(safeSpacing) || safeSpacing <= 0) return 0;
  const raw = safeSize / safeSpacing;
  const whole = Math.floor(raw);
  return whole + (raw - whole >= 0.4 ? 1 : 0);
}

function inferDesktopGrid(posData, icons) {
  const safeIcons = Array.isArray(icons) ? icons : [];
  const xGrid = inferGridPositions(safeIcons.map(icon => icon.x));
  const yGrid = inferGridPositions(safeIcons.map(icon => icon.y));
  const workArea = posData?.workArea || posData?.desktop || {};
  const workW = toPositiveInt(workArea.width) || 1920;
  const workH = toPositiveInt(workArea.height) || 1080;

  // 优先使用用户校准的网格配置（手动输入的列/行数）
  const gridConfig = loadGridConfig();
  if (gridConfig?.calibrated === true && gridConfig.cols > 0 && gridConfig.rows > 0) {
    const spacingX = Math.floor(workW / gridConfig.cols);
    const spacingY = Math.floor(workH / gridConfig.rows);
    return {
      cols: gridConfig.cols,
      rows: gridConfig.rows,
      spacingX,
      spacingY,
      workAreaWidth: workW,
      workAreaHeight: workH,
    };
  }

  // 未校准时的 fallback：优先用实际图标间距，再用脚本返回值
  const psGridCols = toPositiveInt(posData?.gridCols);
  const psGridRows = toPositiveInt(posData?.gridRows);
  const psSpacingX = toPositiveInt(posData?.spacing?.x) || toPositiveInt(posData?.spacingX);
  const psSpacingY = toPositiveInt(posData?.spacing?.y) || toPositiveInt(posData?.spacingY);

  const inferredCols = xGrid.positions.length;
  const inferredRows = yGrid.positions.length;

  const cols = psGridCols > 0 ? Math.max(psGridCols, inferredCols) : Math.max(inferredCols, 1);
  const rows = psGridRows > 0 ? Math.max(psGridRows, inferredRows) : Math.max(inferredRows, 1);
  const spacingX = toPositiveInt(xGrid.step) || psSpacingX || 80;
  const spacingY = toPositiveInt(yGrid.step) || psSpacingY || 100;

  return {
    cols,
    rows,
    spacingX,
    spacingY,
    workAreaWidth: workW,
    workAreaHeight: workH,
  };
}

function enrichGridCoords(icons, posData) {
  if (!Array.isArray(icons) || icons.length === 0) return icons || [];

  const xGrid = inferGridPositions(icons.map(icon => icon.x));
  const yGrid = inferGridPositions(icons.map(icon => icon.y));

  return icons.map(icon => ({
    ...icon,
    gridX: Number.isFinite(icon.x) && xGrid.positions.length > 0 ? (xGrid.indexMap.get(icon.x) ?? 0) : 0,
    gridY: Number.isFinite(icon.y) && yGrid.positions.length > 0 ? (yGrid.indexMap.get(icon.y) ?? 0) : 0,
    hasPosition: true,
  }));
}

function loadGridConfig() {
  ensureConfigDir();
  if (!fs.existsSync(GRID_CONFIG_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(GRID_CONFIG_FILE, 'utf-8'));
  } catch (err) {
    return null;
  }
}

function saveGridConfig(cols, rows) {
  ensureConfigDir();
  const config = {
    cols: Number(cols),
    rows: Number(rows),
    calibrated: true,
    calibratedAt: new Date().toISOString(),
  };
  fs.writeFileSync(GRID_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  return config;
}

function getGridConfigStatus() {
  const config = loadGridConfig();
  return {
    calibrated: config?.calibrated === true,
    cols: config?.cols || null,
    rows: config?.rows || null,
  };
}

function registerIPC() {
  ipcMain.handle('get-consent-status', () => getConsentStatus());

  ipcMain.handle('accept-consent', () => saveConsent());

  ipcMain.handle('get-onboarding-status', () => getOnboardingStatus());

  ipcMain.handle('complete-onboarding', (e, payload) => completeOnboarding(payload));

  ipcMain.handle('get-grid-config-status', () => getGridConfigStatus());

  ipcMain.handle('save-grid-config', (e, { cols, rows }) => saveGridConfig(cols, rows));

  ipcMain.handle('scan-desktop', async () => {
    requireConsent();
    const items = await scanDesktop();
    const classified = classifyAll(items);
    const fs = require('fs');
    const logFile = path.join(require('os').homedir(), '.desktop-organizer', 'scan-debug.log');
    fs.writeFileSync(logFile, `[${new Date().toISOString()}] scan-desktop called, ${Object.values(classified).flat().length} items\n`, 'utf8');

    // 优先用 IFolderView2 读取真实像素位置，失败则回退 Registry
    let positionMap = {};
    let desktopGrid = null;
    try {
      const posData = await readDesktopPositionsViaUIA();
      if (posData && posData.icons && posData.icons.length > 0) {
        const enrichedIcons = enrichGridCoords(posData.icons, posData);
        desktopGrid = inferDesktopGrid(posData, enrichedIcons);
        fs.appendFileSync(logFile, `IFolderView2: ${enrichedIcons.length} icons, grid=${desktopGrid.cols}x${desktopGrid.rows}, spacing=${desktopGrid.spacingX}x${desktopGrid.spacingY}\n`, 'utf8');
        for (const icon of enrichedIcons) {
          positionMap[icon.name] = icon;
        }
      }
    } catch (err) {
      fs.appendFileSync(logFile, `IFolderView2 failed: ${err.message}\n`, 'utf8');
      try {
        const posData = await readDesktopIconPositions();
        if (posData && posData.icons) {
          desktopGrid = inferDesktopGrid(posData, posData.icons);
          fs.appendFileSync(logFile, `Registry fallback: ${posData.icons.length} icons, grid=${desktopGrid.cols}x${desktopGrid.rows}, spacing=${desktopGrid.spacingX}x${desktopGrid.spacingY}\n`, 'utf8');
          for (const icon of posData.icons) {
            positionMap[icon.name] = icon;
          }
        }
      } catch (err2) {
        fs.appendFileSync(logFile, `Registry also failed: ${err2.message}\n`, 'utf8');
      }
    }
    fs.appendFileSync(logFile, `positionMap size: ${Object.keys(positionMap).length}\n`, 'utf8');

    // 给每个 item 注入位置信息
    for (const categoryItems of Object.values(classified)) {
      for (const item of categoryItems) {
        const pos = positionMap[item.fullName];
        if (pos) {
          item.gridX = pos.gridX;
          item.gridY = pos.gridY;
          item.pixelX = pos.x;
          item.pixelY = pos.y;
          item.hasPosition = true;
        } else {
          item.hasPosition = false;
        }
      }
    }

    if (desktopGrid) {
      classified._desktopGrid = desktopGrid;
    }

    return classified;
  });


  ipcMain.handle('set-category', async (e, itemId, category, item) => {
    setItemCategory(itemId, category, item);
  });

  ipcMain.handle('remove-category', (e, itemId) => {
    removeItemCategory(itemId);
  });

  ipcMain.handle('show-in-explorer', (e, filePath) => {
    showInExplorer(filePath);
  });

  ipcMain.handle('open-file', (e, filePath) => {
    openFile(filePath);
  });

  ipcMain.handle('get-rules', () => {
    return loadRules();
  });

  ipcMain.handle('save-rules', (e, rules) => {
    saveRules(rules);
  });

  ipcMain.handle('get-categories', () => {
    return loadCategories();
  });

  ipcMain.handle('save-categories', (e, categories) => {
    saveCategories(categories);
  });

  // 读取桌面图标位置（Registry 方案）
  ipcMain.handle('read-desktop-icons', async () => {
    return await readDesktopIconPositions();
  });

  // 读取桌面图标真实像素位置（IFolderView2 COM 方案）
  ipcMain.handle('read-desktop-positions', async () => {
    return await readDesktopPositionsViaUIA();
  });

  // 布局方案与快照
  ipcMain.handle('list-layouts', () => {
    try {
      return listLayoutSummaries();
    } catch (err) {
      console.error('[layouts] list-layouts failed:', err);
      return { snapshots: [], schemes: [], error: err?.message || '读取布局失败' };
    }
  });

  ipcMain.handle('create-layout-snapshot', async (e, payload) => {
    return await createLayoutSnapshot(payload);
  });

  ipcMain.handle('save-layout-scheme', (e, payload) => {
    return saveLayoutScheme(payload);
  });

  ipcMain.handle('rename-layout-scheme', (e, id, name) => {
    return renameLayoutScheme(id, name);
  });

  ipcMain.handle('delete-layout', (e, type, id) => {
    return deleteLayoutRecord(type, id);
  });

  ipcMain.handle('delete-layouts', (e, type, ids) => {
    return deleteLayoutRecords(type, ids);
  });

  ipcMain.handle('restore-layout', async (e, payload) => {
    return await restoreLayout(payload);
  });

  // 整理桌面
  ipcMain.handle('generate-plan', (e, classifiedData) => {
    return generatePlan(classifiedData, DESKTOP_PATHS[0]);
  });


  ipcMain.handle('pack-items', async (e, packPlan) => {
    const results = await packItems(packPlan);
    for (const result of results || []) {
      const targetCategory = result.targetCategory || result.category;
      for (const folderPath of result.folders || []) {
        const folderName = path.basename(folderPath);
        setItemCategory(folderPath, targetCategory, {
          id: folderPath,
          name: folderName,
          fullName: folderName,
          path: folderPath,
          isDirectory: true,
          isFile: false,
          isShortcut: false,
          ext: '',
        });
      }
    }
    return results;
  });

  ipcMain.handle('reposition-desktop', async (e, layoutData, currentPositions) => {
    return await repositionDesktopIcons(layoutData, currentPositions);
  });

  // 隐藏/显示窗口（整理桌面时需要隐藏 Electron 窗口）
  ipcMain.handle('hide-window', async () => {
    if (mainWindow) mainWindow.hide();
  });
  ipcMain.handle('show-window', async () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  registerIPC();
  createWindow();

  // 设置应用菜单（含刷新）
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '刷新页面',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow && mainWindow.reload(),
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  if (mainWindow) {
    createTray(mainWindow);
  }

  try {
    globalShortcut.register('Super+Shift+D', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
  } catch (err) {
    console.warn('全局快捷键注册失败:', err.message);
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  destroyTray();
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Windows 上保持托盘运行
});
