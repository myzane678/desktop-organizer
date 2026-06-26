    // ========== 全局状态 ==========
    let currentData = {};
    let currentView = 'grid';
    let draggedItem = null;
    let consentAccepted = false;
    let onboardingCompleted = false;
    let onboardingPromptShown = false;
    let tutorialStepIndex = 0;
    let tutorialManualMode = false;

    const tutorialSteps = [
      {
        selector: '.topbar-actions',
        title: '搜索和切换视图',
        text: '用搜索框快速找到文件；网格、列表和桌面视图可以从不同角度查看分类结果。',
      },
      {
        selector: '#gridView .category-card:first-child',
        view: 'grid',
        title: '分类卡片',
        text: '扫描后，桌面项目会按用途自动分组。每张卡片代表一个分类，右上角显示数量。',
      },
      {
        selector: '#gridView .category-card:first-child .category-header',
        view: 'grid',
        title: '拖拽调整分类',
        text: '把文件拖到其他分类标题上，可以手动修正分类。系统会记住你的选择，并用于后续分类参考。',
      },
      {
        selector: '#gridView .file-item:first-child',
        view: 'grid',
        title: '右键菜单和恢复自动分类',
        text: '右键文件可以打开、定位、移动到其他分类；手动分类后，也可以恢复自动分类。',
      },
      {
        selector: 'button[onclick="previewOrganize()"]',
        title: '整理前先预览',
        text: '点击整理桌面会先打开布局预览。确认前不会真正重排桌面图标。',
      },
      {
        selector: 'button[onclick="openCustom()"]',
        title: '自定义整理',
        text: '如果自动布局不符合习惯，可以创建分区、拖入文件，并预览自己的桌面布局。',
      },
      {
        selector: '#statsText',
        title: '自动分类会持续学习',
        text: '自动分类会结合默认规则、快捷方式目标、文件类型和你的手动调整。遇到不准的分类，拖拽或右键修正即可。',
      },
      {
        selector: '[data-tour="help"]',
        title: '随时重新查看',
        text: '教程完成后不会自动弹出。需要时可以从帮助入口重新打开。',
      },
    ];

    // 分类颜色映射
    const categoryColors = {
      '开发工具': '#8b5cf6',
      '社交通讯': '#10b981',
      '影音娱乐': '#f59e0b',
      '办公文档': '#3b82f6',
      '图片素材': '#ec4899',
      '压缩工具': '#6366f1',
      '游戏': '#ef4444',
      '系统工具': '#14b8a6',
      '未分类': '#64748b',
    };

    const preferredCategoryOrder = ['文件夹', '压缩包', '图片素材', '办公文档'];

    function compareCategories(a, b) {
      const ia = preferredCategoryOrder.indexOf(a[0]);
      const ib = preferredCategoryOrder.indexOf(b[0]);
      if (ia !== -1 || ib !== -1) {
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      }
      return 0;
    }

    function getCategoryEntries(data) {
      return Object.entries(data || {})
        .filter(([key, items]) => !key.startsWith('_') && Array.isArray(items))
        .sort(compareCategories);
    }

    function getCategoryNames(data) {
      return getCategoryEntries(data).map(([key]) => key);
    }

    function countCategoryItems(data) {
      return getCategoryEntries(data).reduce((sum, [, items]) => sum + items.length, 0);
    }

    function getDesktopGridMeta(data) {
      const meta = data && data._desktopGrid;
      if (!meta) return null;
      const cols = Number(meta.cols);
      const rows = Number(meta.rows);
      if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= 0) return null;
      const spacingX = Number(meta.spacingX);
      const spacingY = Number(meta.spacingY);
      return {
        cols,
        rows,
        spacingX: Number.isFinite(spacingX) && spacingX > 0 ? spacingX : null,
        spacingY: Number.isFinite(spacingY) && spacingY > 0 ? spacingY : null,
        workAreaWidth: Number(meta.workAreaWidth) || null,
        workAreaHeight: Number(meta.workAreaHeight) || null,
      };
    }

    function inferAxisFromPositions(values, fallbackSpacing, fallbackStart = 0) {
      const positions = [...new Set(values.filter(v => Number.isFinite(v)).map(v => Math.round(v)))].sort((a, b) => a - b);
      const gapCounts = new Map();
      for (let i = 1; i < positions.length; i++) {
        const gap = positions[i] - positions[i - 1];
        if (gap > 0) gapCounts.set(gap, (gapCounts.get(gap) || 0) + 1);
      }
      const spacing = gapCounts.size > 0
        ? [...gapCounts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
        : (fallbackSpacing || 1);
      const start = positions.length > 0 ? positions[0] : fallbackStart;
      return { positions, spacing, start };
    }

    function getAxisPosition(axis, index) {
      return Math.round(axis.start + index * axis.spacing);
    }

