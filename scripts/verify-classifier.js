const assert = require('assert');
const { classifyAll } = require('../electron/classifier');
const rules = require('../electron/default-rules.json');

function item(id, name, fullName, ext, target = '') {
  return {
    id,
    name,
    fullName,
    ext,
    shortcutInfo: target ? { target } : null,
  };
}

function classify(items, userState = {}, profiles = {}, preferences = { directoryMode: 'semantic', archiveMode: 'semantic' }) {
  classifyAll(items, {
    rules,
    userState,
    profiles,
    preferences,
    categories: Object.keys(rules),
  });
  return items;
}

function assertCategory(items, id, expected) {
  const actual = items.find(i => i.id === id)?.category;
  assert.strictEqual(actual, expected, `${id}: expected ${expected}, got ${actual}`);
}

{
  const items = classify([
    item('pdf', '测试文档', '测试文档.pdf', '.pdf'),
    item('png', '截图', '截图.png', '.png'),
    item('jpg', '照片', '照片.jpg', '.jpg'),
    item('steam', 'Steam', 'Steam.lnk', '.lnk', 'D:\\Program Files (x86)\\Steam\\steam.exe'),
    item('heybox', '小黑盒', '小黑盒.lnk', '.lnk', 'D:\\Games\\heybox.exe'),
    item('unknown', '完全未知项目', '完全未知项目.zzz', '.zzz'),
  ]);

  assertCategory(items, 'pdf', '办公文档');
  assertCategory(items, 'png', '图片素材');
  assertCategory(items, 'jpg', '图片素材');
  assertCategory(items, 'steam', '游戏');
  assertCategory(items, 'heybox', '游戏');
  assertCategory(items, 'unknown', '未分类');
}

{
  const items = classify([
    item('manual', 'Steam', 'Steam.lnk', '.lnk', 'D:\\Program Files (x86)\\Steam\\steam.exe'),
  ], { manual: '开发工具' });

  assertCategory(items, 'manual', '开发工具');
}

{
  const items = classify([
    item('prior-1', 'Steam', 'Steam.lnk', '.lnk', 'D:\\Program Files (x86)\\Steam\\steam.exe'),
    item('prior-2', 'Epic Games Launcher', 'Epic Games Launcher.lnk', '.lnk', 'D:\\Epic Games\\Launcher.exe'),
    item('prior-3', '5E对战平台', '5E对战平台.lnk', '.lnk', 'D:\\5EClient\\5EClient.exe'),
    item('prior-unknown', '无规则命中文件', '无规则命中文件.custom', '.custom'),
  ]);

  assertCategory(items, 'prior-unknown', '未分类');
}

{
  const profiles = {
    AI软件: {
      keywords: { deepseek: 3, gemini: 2, coder: 2, api: 2 },
      paths: { microsoft: 3, edge: 3, application: 3 },
      exts: { '.lnk': 4 },
      samples: 4,
    },
  };
  const items = classify([
    item('ai-like', 'DeepSeek API', 'DeepSeek API.lnk', '.lnk', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge_proxy.exe'),
    item('ai-unknown', '无关快捷方式', '无关快捷方式.lnk', '.lnk', 'C:\\Other\\Tool.exe'),
  ], {}, profiles);

  assertCategory(items, 'ai-like', 'AI工具');
  assertCategory(items, 'ai-unknown', '未分类');
}

{
  const items = classify([
    item('antigravity', 'Antigravity', 'Antigravity.lnk', '.lnk', 'C:\\Users\\ROG\\AppData\\Local\\Programs\\antigravity\\Antigravity.exe'),
    item('codex', 'Codex++', 'Codex++.lnk', '.lnk', 'D:\\codex++management\\Codex++\\codex-plus-plus.exe'),
    item('vscode', 'Visual Studio Code', 'Visual Studio Code.lnk', '.lnk', 'E:\\VScode\\Microsoft VS Code\\Code.exe'),
    item('devcpp', 'Dev-C++', 'Dev-C++.lnk', '.lnk', 'D:\\dev\\devcpp.exe'),
    item('keil', 'Keil uVision5', 'Keil uVision5.LNK', '.lnk', 'D:\\Keil_v5\\UV4\\UV4.exe'),
    item('mqttx', 'MQTTX', 'MQTTX.lnk', '.lnk', 'D:\\MQTTX\\MQTTX.exe'),
    item('quartus', 'Quartus', 'Quartus.lnk', '.lnk', 'D:\\quartusproject\\quartus\\bin64\\quartus.exe'),
    item('lceda', '嘉立创EDA', '嘉立创EDA(专业版).lnk', '.lnk', 'D:\\Program Files\\lceda-pro\\lceda-pro.exe'),
    item('wechat', '微信', '微信.lnk', '.lnk', 'C:\\Program Files (x86)\\Tencent\\Weixin\\Weixin.exe'),
    item('wemeet', '腾讯会议', '腾讯会议.lnk', '.lnk', 'D:\\Program Files (x86)\\Tencent\\WeMeet\\wemeetapp.exe'),
    item('oopz', 'Oopz', 'Oopz.lnk', '.lnk', 'D:\\oopz\\oopz-runner.exe'),
    item('sumatra', 'SumatraPDF', 'SumatraPDF.lnk', '.lnk', 'D:\\SumatraPDF\\SumatraPDF.exe'),
    item('typora', 'Typora', 'Typora.lnk', '.lnk', 'D:\\Typora\\Typora.exe'),
    item('obsidian', 'Obsidian', 'Obsidian.lnk', '.lnk', 'D:\\Obsidian\\Obsidian.exe'),
    item('markdown', '嵌入式作业', '嵌入式作业.md', '.md'),
    item('baidu', '百度网盘', '百度网盘.lnk', '.lnk', 'D:\\BaiduNetdisk\\BaiduNetdisk.exe'),
    item('thunder', '迅雷', '迅雷.lnk', '.lnk', 'D:\\Thunder Network\\Thunder\\Program\\ThunderStart.exe'),
    item('quark', '夸克', '夸克.lnk', '.lnk', 'D:\\Quark\\quark.exe'),
    item('kdesk', '元气桌面', '元气桌面.lnk', '.lnk', 'D:\\kdesk\\kwallpaper.exe'),
    item('eldenring', 'eldenring', 'eldenring.lnk', '.lnk', 'D:\\ELDEN RING\\eldenring.exe'),
    item('pcl', 'Plain Craft Launcher 2', 'Plain Craft Launcher 2.exe - 快捷方式.lnk', '.lnk', 'E:\\PCL\\Plain Craft Launcher 2.exe'),
    item('leigod', '雷神加速器', '雷神加速器.lnk', '.lnk', 'D:\\leigod\\leigod_launcher.exe'),
    item('modbox', '狩技MOD盒子', '狩技MOD盒子.exe - 快捷方式.lnk', '.lnk', 'D:\\monster mod\\狩技MOD盒子.exe'),
    item('deepseek-web', 'DeepSeek - 探索未至之境', 'DeepSeek - 探索未至之境.lnk', '.lnk', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge_proxy.exe'),
    item('coder-api', 'Coder API', 'Coder API.lnk', '.lnk', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome_proxy.exe'),
    item('wechat-image', '微信图片_20251220162445_51_93', '微信图片_20251220162445_51_93.jpg', '.jpg'),
    item('edge', 'Microsoft Edge', 'Microsoft Edge.lnk', '.lnk', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'),
  ]);

  assertCategory(items, 'antigravity', 'AI工具');
  assertCategory(items, 'codex', 'AI工具');
  assertCategory(items, 'vscode', '开发工具');
  assertCategory(items, 'devcpp', '开发工具');
  assertCategory(items, 'keil', '开发工具');
  assertCategory(items, 'mqttx', '开发工具');
  assertCategory(items, 'quartus', '开发工具');
  assertCategory(items, 'lceda', '开发工具');
  assertCategory(items, 'wechat', '社交通讯');
  assertCategory(items, 'wemeet', '社交通讯');
  assertCategory(items, 'oopz', '社交通讯');
  assertCategory(items, 'sumatra', '文档工具');
  assertCategory(items, 'typora', '文档工具');
  assertCategory(items, 'obsidian', '文档工具');
  assertCategory(items, 'markdown', '办公文档');
  assertCategory(items, 'baidu', '系统工具');
  assertCategory(items, 'thunder', '系统工具');
  assertCategory(items, 'quark', '系统工具');
  assertCategory(items, 'kdesk', '系统工具');
  assertCategory(items, 'eldenring', '游戏');
  assertCategory(items, 'pcl', '游戏');
  assertCategory(items, 'leigod', '游戏');
  assertCategory(items, 'modbox', '游戏');
  assertCategory(items, 'deepseek-web', 'AI工具');
  assertCategory(items, 'coder-api', 'AI工具');
  assertCategory(items, 'wechat-image', '图片素材');
  assertCategory(items, 'edge', '系统工具');
}

{
  const items = classify([
    item('bat', 'mosquitto_start', 'mosquitto_start.bat', '.bat'),
    item('reg', 'desktop', 'desktop.reg', '.reg'),
    item('log', 'texput', 'texput.log', '.log'),
    item('html', 'Embedded_Homework', 'Embedded_Homework.html', '.html'),
    item('folder', '2026物理实验', '2026物理实验', ''),
    item('unknown-pcl', 'PCL', 'PCL.lnk', '.lnk', 'C:\\Other\\pcl.exe'),
  ]);

  assertCategory(items, 'bat', '未分类');
  assertCategory(items, 'reg', '未分类');
  assertCategory(items, 'log', '未分类');
  assertCategory(items, 'html', '未分类');
  assertCategory(items, 'folder', '未分类');
  assertCategory(items, 'unknown-pcl', '未分类');
}

{
  const items = classify([
    item('folder-container', '2026物理实验', '2026物理实验', ''),
    item('archive-container', '资料包', '资料包.zip', '.zip'),
    item('archive-rar', '516黄泼', '516黄泼.rar', '.rar'),
    item('manual-folder', '工程创新', '工程创新', ''),
  ], { 'manual-folder': '学习资料' }, {}, { directoryMode: 'container', archiveMode: 'container' });

  items.find(i => i.id === 'folder-container').isDirectory = true;
  items.find(i => i.id === 'manual-folder').isDirectory = true;
  classifyAll(items, {
    rules,
    userState: { 'manual-folder': '学习资料' },
    profiles: {},
    preferences: { directoryMode: 'container', archiveMode: 'container' },
    categories: Object.keys(rules),
  });

  assertCategory(items, 'folder-container', '文件夹');
  assertCategory(items, 'archive-container', '压缩包');
  assertCategory(items, 'archive-rar', '压缩包');
  assertCategory(items, 'manual-folder', '学习资料');
}

console.log('classifier verification passed');
