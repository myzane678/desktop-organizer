const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('organizer', {
  // 用户条款与隐私同意
  getConsentStatus: () => ipcRenderer.invoke('get-consent-status'),
  acceptConsent: () => ipcRenderer.invoke('accept-consent'),

  // 新手引导
  getOnboardingStatus: () => ipcRenderer.invoke('get-onboarding-status'),
  completeOnboarding: (state) => ipcRenderer.invoke('complete-onboarding', state),

  // 桌面网格校准
  getGridConfigStatus: () => ipcRenderer.invoke('get-grid-config-status'),
  saveGridConfig: (config) => ipcRenderer.invoke('save-grid-config', config),

  // 扫描桌面并获取分类结果
  scanDesktop: () => ipcRenderer.invoke('scan-desktop'),

  // 手动设置文件分类
  setCategory: (itemId, category, item) => ipcRenderer.invoke('set-category', itemId, category, item),

  // 移除手动分类
  removeCategory: (itemId) => ipcRenderer.invoke('remove-category', itemId),

  // 在资源管理器中显示
  showInExplorer: (filePath) => ipcRenderer.invoke('show-in-explorer', filePath),

  // 打开文件
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),

  // 规则管理
  getRules: () => ipcRenderer.invoke('get-rules'),
  saveRules: (rules) => ipcRenderer.invoke('save-rules', rules),

  // 分类管理
  getCategories: () => ipcRenderer.invoke('get-categories'),
  saveCategories: (categories) => ipcRenderer.invoke('save-categories', categories),

  // 整理桌面
  generatePlan: (classifiedData) => ipcRenderer.invoke('generate-plan', classifiedData),
  executePlan: (plan) => ipcRenderer.invoke('execute-plan', plan),
  packItems: (packPlan) => ipcRenderer.invoke('pack-items', packPlan),
  repositionDesktop: (layoutData, currentPositions) => ipcRenderer.invoke('reposition-desktop', layoutData, currentPositions),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  showWindow: () => ipcRenderer.invoke('show-window'),
  readDesktopIcons: () => ipcRenderer.invoke('read-desktop-icons'),
  readDesktopPositions: () => ipcRenderer.invoke('read-desktop-positions'),

  // 布局方案与快照
  listLayouts: () => ipcRenderer.invoke('list-layouts'),
  createLayoutSnapshot: (payload) => ipcRenderer.invoke('create-layout-snapshot', payload),
  saveLayoutScheme: (payload) => ipcRenderer.invoke('save-layout-scheme', payload),
  renameLayoutScheme: (id, name) => ipcRenderer.invoke('rename-layout-scheme', id, name),
  deleteLayout: (type, id) => ipcRenderer.invoke('delete-layout', type, id),
  deleteLayouts: (type, ids) => ipcRenderer.invoke('delete-layouts', type, ids),
  restoreLayout: (payload) => ipcRenderer.invoke('restore-layout', payload),

  // 监听主进程消息
  onTriggerRescan: (callback) => {
    ipcRenderer.on('trigger-rescan', () => callback());
  },
});
