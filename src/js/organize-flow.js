    // ========== 整理桌面流程 ==========
    let previewLayout = null;
    let previewDragItem = null;
    let previewLayoutDirection = 'vertical';
    // 每个分类已建好的收纳文件夹：{ [category]: [{ name, memberKeys: [...] }, ...] }
    let previewPackPlan = {};
    // 正在新建中的文件夹草稿，同一时刻只允许一个分类处于草稿态：null | { category, selection: { [key]: true } }
    let previewPackDraft = null;
    let previewPackBaseLayouts = {};
    // 记录收纳面板每个分类的 <details> 展开状态，避免重渲染后被折叠
    let previewPackOpen = {};

    function getPackKey(category, item) {
      return `${category}::${item.id || item.path || item.fullName}`;
    }

    // 某分类下已被任意已建文件夹收纳的成员 key 集合
    function getPackedKeys(category) {
      const set = new Set();
      for (const folder of previewPackPlan[category] || []) {
        for (const key of folder.memberKeys || []) set.add(key);
      }
      return set;
    }

    function buildPackFolderItem(sourceCat, targetCat, folderName, items) {
      return {
        id: `pack-folder::${sourceCat}::${folderName}`,
        name: folderName,
        fullName: folderName,
        path: '',
        isDirectory: true,
        icon: null,
        // category 决定预览布局落在哪个分区；sourceCategory 是成员实际所在分类
        category: targetCat,
        hasPosition: true,
        packedItems: items.map(item => ({ ...item })),
        isPackFolder: true,
        ext: '',
        isShortcut: false,
        isFile: false,
        shortcutInfo: null,
        sourceCategory: sourceCat,
      };
    }

    function buildPreviewSourceEntries(data) {
      const catEntries = getCategoryEntries(data);
      // 收纳后落定的文件夹图标，按"目标分区"归集；目标分区不存在时回退到来源分区
      const validCats = new Set(catEntries.map(([cat]) => cat));
      const foldersByTarget = new Map();
      const visibleByCat = new Map();

      for (const [cat, items] of catEntries) {
        const keyToItem = new Map();
        for (const item of items) keyToItem.set(getPackKey(cat, item), item);

        const packedKeys = getPackedKeys(cat);
        // 留在桌面（未被任何已建文件夹收纳）的项
        visibleByCat.set(cat, items.filter(item => !packedKeys.has(getPackKey(cat, item))));

        for (const folder of previewPackPlan[cat] || []) {
          const members = (folder.memberKeys || [])
            .map(key => keyToItem.get(key))
            .filter(Boolean)
            .map(item => ({ ...item, category: cat }));
          if (members.length === 0) continue;
          let target = folder.targetCategory || cat;
          if (!validCats.has(target)) target = cat; // 目标分区已不存在则回退来源
          const folderItem = buildPackFolderItem(cat, target, folder.name, members);
          if (!foldersByTarget.has(target)) foldersByTarget.set(target, []);
          foldersByTarget.get(target).push(folderItem);
        }
      }

      const entries = [];
      for (const [cat] of catEntries) {
        const blockItems = [...(visibleByCat.get(cat) || []), ...(foldersByTarget.get(cat) || [])];
        if (blockItems.length > 0) entries.push([cat, blockItems]);
      }
      return entries;
    }

    function getPackedPreviewCount() {
      let count = 0;
      for (const folders of Object.values(previewPackPlan)) {
        for (const folder of folders) count += (folder.memberKeys || []).length;
      }
      return count;
    }

    function hasPreviewPackPlan() {
      return Object.values(previewPackPlan).some(folders => folders && folders.length > 0);
    }

    function clonePreviewLayout(layout) {
      const cloned = {};
      for (const [key, value] of Object.entries(layout || {})) {
        cloned[key] = Array.isArray(value) ? value.map(item => ({ ...item })) : value;
      }
      return cloned;
    }

    function capturePackOpenState() {
      document.querySelectorAll('[data-pack-section]').forEach(el => {
        previewPackOpen[el.dataset.packSection] = el.open;
      });
    }

    // 可作为收纳文件夹"归属分区"的目标分类（图标会显示在该分区里）
    const PACK_FOLDER_TARGET = '文件夹';
    // 该分类是否能提供"移动到文件夹分区"选项：自身不是文件夹分区，且数据里存在文件夹分区
    function canRetargetToFolder(category) {
      return category !== PACK_FOLDER_TARGET && Array.isArray(currentData[PACK_FOLDER_TARGET]);
    }

    // 开始在某分类新建文件夹：进入草稿态，自动展开该分类。targetCategory 默认归属源分区
    function startPackDraft(category) {
      capturePackOpenState();
      previewPackDraft = { category, selection: {}, targetCategory: category };
      previewPackOpen[category] = true;
      refreshPackPanel();
    }

    // 草稿态下切换收纳文件夹归属分区：源分区 ↔ 文件夹分区
    function setDraftTarget(toFolder) {
      if (!previewPackDraft) return;
      const cat = previewPackDraft.category;
      previewPackDraft.targetCategory = toFolder && canRetargetToFolder(cat) ? PACK_FOLDER_TARGET : cat;
      refreshPackPanel();
    }

    // 已建文件夹切换归属分区
    function toggleFolderTarget(category, folderIndex) {
      capturePackOpenState();
      const folder = (previewPackPlan[category] || [])[folderIndex];
      if (!folder) return;
      const current = folder.targetCategory || category;
      folder.targetCategory = current === PACK_FOLDER_TARGET ? category : PACK_FOLDER_TARGET;
      previewOrganize();
    }

    function cancelPackDraft() {
      capturePackOpenState();
      previewPackDraft = null;
      refreshPackPanel();
    }

    // 草稿态下勾选/取消单项
    function toggleDraftItem(itemId, checked) {
      if (!previewPackDraft) return;
      const cat = previewPackDraft.category;
      const item = (currentData[cat] || []).find(i => (i.id || i.path || i.fullName) === itemId);
      if (!item) return;
      const key = getPackKey(cat, item);
      if (checked) previewPackDraft.selection[key] = true;
      else delete previewPackDraft.selection[key];
      refreshPackPanel();
    }

    // 草稿态下全选/全不选（仅针对尚未被收纳的可选项）
    function setDraftSelectAll(checked) {
      if (!previewPackDraft) return;
      const cat = previewPackDraft.category;
      const packedKeys = getPackedKeys(cat);
      previewPackDraft.selection = {};
      if (checked) {
        for (const item of currentData[cat] || []) {
          const key = getPackKey(cat, item);
          if (!packedKeys.has(key)) previewPackDraft.selection[key] = true;
        }
      }
      refreshPackPanel();
    }

    // 确认草稿：校验勾选数和重名，命名后落定为一个文件夹
    async function confirmPackDraft() {
      if (!previewPackDraft) return;
      const cat = previewPackDraft.category;
      const memberKeys = Object.keys(previewPackDraft.selection);
      if (memberKeys.length === 0) {
        showToast('请先勾选要收纳的图标');
        return;
      }
      const existingNames = (previewPackPlan[cat] || []).map(f => f.name);
      let suggest = '新建文件夹';
      let n = 1;
      while (existingNames.includes(suggest)) suggest = `新建文件夹 (${++n})`;

      while (true) {
        const name = await promptText('文件夹命名', '请输入文件夹名称', suggest);
        if (name === null) return; // 取消则保留草稿态，用户可继续调整
        const trimmed = name.trim();
        if (!trimmed) { showToast('文件夹名称不能为空'); continue; }
        if (existingNames.includes(trimmed)) {
          showToast(`「${trimmed}」已存在，请换一个名称`);
          suggest = trimmed;
          continue;
        }
        capturePackOpenState();
        if (!previewPackPlan[cat]) previewPackPlan[cat] = [];
        previewPackPlan[cat].push({
          name: trimmed,
          memberKeys,
          targetCategory: previewPackDraft.targetCategory || cat,
          restoreLayout: clonePreviewLayout(previewLayout),
        });
        previewPackDraft = null;
        previewOrganize();
        return;
      }
    }

    function removePackFolder(category, folderIndex) {
      capturePackOpenState();
      const folders = previewPackPlan[category];
      if (!folders || !folders[folderIndex]) return;
      const restoreLayout = folders[folderIndex].restoreLayout;
      folders.splice(folderIndex, 1);
      if (folders.length === 0) delete previewPackPlan[category];
      if (!hasPreviewPackPlan() && restoreLayout) {
        previewLayout = clonePreviewLayout(restoreLayout);
        previewPackBaseLayouts[previewLayoutDirection] = clonePreviewLayout(restoreLayout);
        renderLayoutPreview();
        openPreview();
        return;
      }
      previewOrganize();
    }

    async function renamePackFolder(category, folderIndex) {
      const folders = previewPackPlan[category];
      if (!folders || !folders[folderIndex]) return;
      const folder = folders[folderIndex];
      const otherNames = folders.filter((_, i) => i !== folderIndex).map(f => f.name);
      while (true) {
        const name = await promptText('文件夹命名', '请输入文件夹名称', folder.name);
        if (name === null) return;
        const trimmed = name.trim();
        if (!trimmed) { showToast('文件夹名称不能为空'); continue; }
        if (otherNames.includes(trimmed)) {
          showToast(`「${trimmed}」已存在，请换一个名称`);
          continue;
        }
        capturePackOpenState();
        folder.name = trimmed;
        previewOrganize();
        return;
      }
    }

    // 只重渲染收纳面板，不触发整页桌面重排（草稿态勾选时用，避免闪烁与状态丢失）
    function refreshPackPanel() {
      const host = document.getElementById('packPanelHost');
      if (host) host.innerHTML = renderPackPanel();
    }

    let packPanelDelegationBound = false;
    function ensurePackPanelDelegation() {
      if (packPanelDelegationBound) return;
      const root = document.getElementById('previewBody');
      if (!root) return;
      // 草稿态复选框走 change（onclick 在 label 包裹下时机不稳）
      root.addEventListener('change', (e) => {
        const draftItem = e.target.closest('[data-pack-action="draft-item"]');
        if (draftItem) {
          if (draftItem.dataset.packId == null) return;
          toggleDraftItem(draftItem.dataset.packId, draftItem.checked);
          return;
        }
        const draftTarget = e.target.closest('[data-pack-action="draft-target"]');
        if (draftTarget) {
          setDraftTarget(draftTarget.checked);
          return;
        }
      });
      // 按钮走 click，按 data-pack-action 分发
      root.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-pack-action]');
        if (!btn || btn.tagName !== 'BUTTON') return;
        const action = btn.dataset.packAction;
        const cat = btn.dataset.packCat;
        const idx = btn.dataset.packIndex != null ? parseInt(btn.dataset.packIndex, 10) : null;
        if (action === 'new-folder') { startPackDraft(cat); }
        else if (action === 'draft-confirm') { confirmPackDraft(); }
        else if (action === 'draft-cancel') { cancelPackDraft(); }
        else if (action === 'draft-select-all') { setDraftSelectAll(true); }
        else if (action === 'draft-clear-all') { setDraftSelectAll(false); }
        else if (action === 'toggle-target') { toggleFolderTarget(cat, idx); }
        else if (action === 'rename-folder') { renamePackFolder(cat, idx); }
        else if (action === 'remove-folder') { removePackFolder(cat, idx); }
      });
      // <details> toggle 不冒泡，用捕获相位采集展开状态
      root.addEventListener('toggle', (e) => {
        const target = e.target;
        if (!target || !target.dataset || target.dataset.packSection == null) return;
        previewPackOpen[target.dataset.packSection] = target.open;
      }, true);
      packPanelDelegationBound = true;
    }

    function renderPackPanel() {
      const entries = getCategoryEntries(currentData).filter(([, items]) => items.length > 0);
      if (entries.length === 0) return '';
      const sections = entries.map(([cat, items]) => {
        const folders = previewPackPlan[cat] || [];
        const packedKeys = getPackedKeys(cat);
        const isDrafting = previewPackDraft && previewPackDraft.category === cat;
        const openAttr = previewPackOpen[cat] ? ' open' : '';

        // 已建文件夹列表
        const folderListHtml = folders.length === 0 ? '' : `
          <div style="display:flex;flex-direction:column;gap:4px;margin:6px 0;">
            ${folders.map((f, i) => {
              const tgt = f.targetCategory || cat;
              const atFolder = tgt === PACK_FOLDER_TARGET;
              const targetBtn = canRetargetToFolder(cat)
                ? `<button class="btn btn-ghost" data-pack-action="toggle-target" data-pack-cat="${escapeHTMLAttr(cat)}" data-pack-index="${i}" title="切换文件夹归属分区">归属：${escapeHTML(atFolder ? PACK_FOLDER_TARGET : cat)}</button>`
                : '';
              return `
              <div style="display:flex;align-items:center;gap:8px;background:#0b1220;border:1px solid #1e293b;border-radius:6px;padding:4px 8px;">
                <span style="color:#cbd5e1;font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📁 ${escapeHTML(f.name)}（${(f.memberKeys || []).length}）</span>
                ${targetBtn}
                <button class="btn btn-ghost" data-pack-action="rename-folder" data-pack-cat="${escapeHTMLAttr(cat)}" data-pack-index="${i}">改名</button>
                <button class="btn btn-ghost" data-pack-action="remove-folder" data-pack-cat="${escapeHTMLAttr(cat)}" data-pack-index="${i}">删除</button>
              </div>`;
            }).join('')}
          </div>`;

        let bodyHtml;
        if (isDrafting) {
          // 草稿态：显示可选项（排除已被收纳的）+ 确认/取消
          const selectableItems = items.filter(item => !packedKeys.has(getPackKey(cat, item)) && !item.isPackFolder);
          const selectedCount = Object.keys(previewPackDraft.selection).length;
          const itemHtml = selectableItems.map(item => {
            const itemId = item.id || item.path || item.fullName;
            const checked = previewPackDraft.selection[getPackKey(cat, item)] ? 'checked' : '';
            return `<label style="display:flex;align-items:center;gap:6px;color:#94a3b8;font-size:12px;min-width:150px;max-width:220px;">
              <input type="checkbox" ${checked} data-pack-action="draft-item" data-pack-id="${escapeHTMLAttr(itemId)}">
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(item.fullName || item.name)}</span>
            </label>`;
          }).join('');
          bodyHtml = `
            <div style="display:flex;gap:8px;margin:8px 0;flex-wrap:wrap;align-items:center;">
              <button class="btn btn-ghost" data-pack-action="draft-select-all">全选</button>
              <button class="btn btn-ghost" data-pack-action="draft-clear-all">全不选</button>
              <button class="btn btn-primary" data-pack-action="draft-confirm">确认（已选 ${selectedCount}）</button>
              <button class="btn btn-ghost" data-pack-action="draft-cancel">取消</button>
            </div>
            ${canRetargetToFolder(cat) ? `
            <label style="display:flex;align-items:center;gap:6px;color:#94a3b8;font-size:12px;margin:0 0 8px;">
              <input type="checkbox" data-pack-action="draft-target" ${previewPackDraft.targetCategory === PACK_FOLDER_TARGET ? 'checked' : ''}>
              <span>把文件夹放到「${escapeHTML(PACK_FOLDER_TARGET)}」分区（默认留在「${escapeHTML(cat)}」分区）</span>
            </label>` : ''}
            <div style="display:flex;flex-wrap:wrap;gap:8px;max-height:160px;overflow:auto;">${itemHtml || '<span style="color:#64748b;font-size:12px;">该分类没有可收纳的图标了</span>'}</div>`;
        } else {
          // 非草稿态：只显示「新建文件夹」入口（草稿被其他分类占用时禁用）
          const draftBusy = previewPackDraft && previewPackDraft.category !== cat;
          const disabledAttr = draftBusy ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : '';
          bodyHtml = `
            <div style="display:flex;gap:8px;margin:8px 0;flex-wrap:wrap;align-items:center;">
              <button class="btn btn-primary" data-pack-action="new-folder" data-pack-cat="${escapeHTMLAttr(cat)}" ${disabledAttr}>+ 新建文件夹</button>
              ${draftBusy ? '<span style="color:#64748b;font-size:12px;">请先完成当前分类的新建</span>' : ''}
            </div>`;
        }

        return `<details data-pack-section="${escapeHTMLAttr(cat)}"${openAttr} style="background:#111827;border:1px solid #334155;border-radius:8px;padding:8px;">
          <summary style="color:#cbd5e1;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:8px;">
            <span>${escapeHTML(cat)}</span><span style="color:#64748b;">文件夹 ${folders.length} 个 · 共 ${items.length} 项</span>
          </summary>
          ${folderListHtml}
          ${bodyHtml}
        </details>`;
      }).join('');
      return `<div style="margin-top:12px;background:#0f172a;border:1px solid #334155;border-radius:10px;padding:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;">
          <div>
            <div style="color:#e2e8f0;font-size:13px;font-weight:600;">收纳到文件夹</div>
            <div style="color:#64748b;font-size:12px;margin-top:2px;">点「新建文件夹」后勾选要收纳的图标，确认并命名即可。同一分类可建多个文件夹。</div>
          </div>
          <div style="color:#94a3b8;font-size:12px;white-space:nowrap;">已收纳 ${getPackedPreviewCount()} 项</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;">${sections}</div>
      </div>`;
    }

    async function applyPreviewPacking() {
      const plan = [];
      const keyToSource = {};
      for (const [cat, items] of getCategoryEntries(currentData)) {
        for (const item of items) keyToSource[getPackKey(cat, item)] = item;
      }
      for (const [cat, folders] of Object.entries(previewPackPlan)) {
        for (const folder of folders) {
          const items = (folder.memberKeys || [])
            .map(key => keyToSource[key])
            .filter(Boolean)
            .map(item => ({ name: item.fullName, source: item.path }));
          if (items.length > 0) {
            plan.push({ category: cat, folderName: folder.name, targetCategory: folder.targetCategory || cat, items });
          }
        }
      }
      if (plan.length === 0) return [];
      return await window.organizer.packItems(plan);
    }

    function buildBlockPreviewLayout(entries, gridCols, totalRows, direction = 'vertical', options = {}) {
      const cats = entries.filter(([, items]) => items.length > 0);
      const layout = {};
      const N = cats.length;
      let finalRows = totalRows;

      if (N > 0 && direction === 'horizontal') {
        const cols = gridCols;
        const heights = cats.map(([, items]) => Math.max(1, Math.ceil(items.length / cols)));
        const totalHeight = heights.reduce((s, h) => s + h, 0);
        const surplus = totalRows - totalHeight;
        const walls = Array(Math.max(0, N - 1)).fill(0);
        let topPadding = 0;
        if (surplus >= N - 1) {
          for (let i = 0; i < N - 1; i++) walls[i] = 1;
          topPadding = Math.floor((surplus - (N - 1)) / 2);
        } else if (surplus > 0) {
          const pairScores = [];
          for (let i = 0; i < N - 1; i++) {
            const upperCount = cats[i][1].length;
            const lowerCount = cats[i + 1][1].length;
            pairScores.push({ index: i, score: upperCount + lowerCount });
          }
          pairScores.sort((a, b) => b.score - a.score);
          for (let i = 0; i < surplus; i++) walls[pairScores[i].index] = 1;
        }

        const startRows = [];
        let cursor = topPadding;
        for (let i = 0; i < N; i++) {
          startRows.push(cursor);
          cursor += heights[i] + (i < N - 1 ? walls[i] : 0);
        }

        let maxRow = 0;
        for (let i = 0; i < N; i++) {
          const [cat, items] = cats[i];
          const sr = startRows[i];
          layout[cat] = items.map((item, j) => {
            const localRow = Math.floor(j / cols);
            const localCol = j % cols;
            const r = sr + localRow;
            maxRow = Math.max(maxRow, r);
            const laid = {
              ...item,
              gridX: localCol,
              gridY: r,
              hasPosition: true,
              category: cat,
              originalCategory: item.originalCategory || item.category || cat,
            };
            if (options.spacingX && options.spacingY) {
              laid.pixelX = localCol * options.spacingX + 21;
              laid.pixelY = r * options.spacingY + 2;
            }
            return laid;
          });
        }
        finalRows = Math.max(totalRows, maxRow + 1);
      } else if (N > 0) {
        const rows = totalRows;
        const widths = cats.map(([, items]) => Math.max(1, Math.ceil(items.length / rows)));
        const totalWidth = widths.reduce((s, w) => s + w, 0);
        const surplus = gridCols - totalWidth;
        const walls = Array(Math.max(0, N - 1)).fill(0);
        let leftPadding = 0;
        if (surplus >= N - 1) {
          for (let i = 0; i < N - 1; i++) walls[i] = 1;
          leftPadding = Math.floor((surplus - (N - 1)) / 2);
        } else if (surplus > 0) {
          const pairScores = [];
          for (let i = 0; i < N - 1; i++) {
            const leftCount = cats[i][1].length;
            const rightCount = cats[i + 1][1].length;
            pairScores.push({ index: i, score: leftCount + rightCount });
          }
          pairScores.sort((a, b) => b.score - a.score);
          for (let i = 0; i < surplus; i++) walls[pairScores[i].index] = 1;
        }

        const startCols = [];
        let cursor = leftPadding;
        for (let i = 0; i < N; i++) {
          startCols.push(cursor);
          cursor += widths[i] + (i < N - 1 ? walls[i] : 0);
        }

        let maxRow = 0;
        for (let i = 0; i < N; i++) {
          const [cat, items] = cats[i];
          const sc = startCols[i];
          const width = widths[i];
          const hasWallAfter = i < N - 1 && walls[i] === 1;
          const gapRows = (!hasWallAfter && width > 1) ? Math.min(3, Math.floor(rows / 3)) : 0;

          layout[cat] = items.map((item, j) => {
            const localCol = Math.floor(j / rows);
            const localRow = j % rows;
            const isLastCol = localCol === width - 1;
            const r = isLastCol && gapRows > 0 ? localRow + gapRows : localRow;
            const c = sc + localCol;
            maxRow = Math.max(maxRow, r);
            const laid = {
              ...item,
              gridX: c,
              gridY: r,
              hasPosition: true,
              category: cat,
              originalCategory: item.originalCategory || item.category || cat,
            };
            if (options.spacingX && options.spacingY) {
              laid.pixelX = c * options.spacingX + 21;
              laid.pixelY = r * options.spacingY + 2;
            }
            return laid;
          });
        }
        finalRows = Math.max(rows, maxRow + 1);
      }

      layout._gridCols = gridCols;
      layout._gridRows = finalRows;
      layout._direction = direction;
      return { layout, cats };
    }

    async function previewOrganize() {
      const data = getCategoryEntries(currentData).length > 0 ? currentData : null;
      if (!data) { showToast('请先扫描桌面'); return; }

      let desktopGrid = getDesktopGridMeta(currentData);
      if (!desktopGrid) {
        try {
          const posData = await window.organizer.readDesktopIcons();
          const cols = Number(posData?.gridCols);
          const rows = Number(posData?.gridRows);
          if (Number.isFinite(cols) && cols > 0 && Number.isFinite(rows) && rows > 0) {
            desktopGrid = { cols, rows };
          }
        } catch (err) {
          console.warn('读取实时桌面网格失败:', err);
        }
      }

      const sourceEntries = buildPreviewSourceEntries(data);
      const hasPackPlan = hasPreviewPackPlan();
      const baseKey = previewLayoutDirection;
      if (!hasPackPlan && previewPackBaseLayouts[baseKey]) {
        previewLayout = clonePreviewLayout(previewPackBaseLayouts[baseKey]);
        dumpLayoutDiagnostics({ desktopGrid, gridCols: previewLayout._gridCols, totalRows: previewLayout._gridRows, cats: getCategoryEntries(data).filter(([, items]) => items.length > 0) });
        renderLayoutPreview();
        openPreview();
        return;
      }

      // 收集所有图标
      const allItems = [];
      for (const [cat, items] of sourceEntries) {
        for (const item of items) {
          allItems.push({ ...item, category: cat });
        }
      }

      const posItems = allItems.filter(i => i.hasPosition);
      let gridCols = desktopGrid?.cols || 10;
      let totalRows = desktopGrid?.rows || 12;

      if (!desktopGrid) {
        const gridItems = posItems.filter(i => Number.isInteger(i.gridX) && Number.isInteger(i.gridY));
        if (gridItems.length > 0) {
          gridCols = Math.max(1, Math.max(...gridItems.map(i => i.gridX)) + 1);
          totalRows = Math.max(1, Math.max(...gridItems.map(i => i.gridY)) + 1);
        } else {
          const pixelItems = posItems.filter(i => Number.isFinite(i.pixelX) && Number.isFinite(i.pixelY));
          if (pixelItems.length > 0) {
            const xs = [...new Set(pixelItems.map(i => i.pixelX))].sort((a, b) => a - b);
            const ys = [...new Set(pixelItems.map(i => i.pixelY))].sort((a, b) => a - b);
            gridCols = Math.max(1, xs.length);
            totalRows = Math.max(1, ys.length);
          }
        }
      }

      // 分块放置：竖向按分类列块排布，横向按分类行块排布
      const built = buildBlockPreviewLayout(sourceEntries, gridCols, totalRows, previewLayoutDirection);
      const cats = built.cats;
      previewLayout = built.layout;
      if (!hasPackPlan) previewPackBaseLayouts[baseKey] = clonePreviewLayout(previewLayout);

      dumpLayoutDiagnostics({ desktopGrid, gridCols, totalRows, cats });

      renderLayoutPreview();
      openPreview();
    }

    // 诊断：记录每次 previewOrganize 的布局输入与产出，便于对比"打包/拆包前后布局漂移"问题。
    // 在控制台执行 window.__layoutDiag 可查看最近若干次快照，__layoutDiagDiff() 对比最近两次。
    let __layoutDiagLog = [];
    window.__layoutDiag = __layoutDiagLog;
    function dumpLayoutDiagnostics({ desktopGrid, gridCols, totalRows, cats }) {
      const positions = {};
      for (const [cat, items] of Object.entries(previewLayout)) {
        if (cat.startsWith('_')) continue;
        positions[cat] = items.map(it => ({
          name: it.fullName,
          x: it.gridX,
          y: it.gridY,
          pack: !!it.isPackFolder,
        }));
      }
      const snapshot = {
        t: new Date().toISOString(),
        direction: previewLayoutDirection,
        desktopGridSource: desktopGrid ? 'cached/live' : 'inferred',
        gridCols,
        totalRows,
        finalGridRows: previewLayout._gridRows,
        catOrder: cats.map(([c, items]) => `${c}(${items.length})`),
        packPlan: JSON.parse(JSON.stringify(previewPackPlan)),
        positions,
      };
      __layoutDiagLog.push(snapshot);
      if (__layoutDiagLog.length > 10) __layoutDiagLog.shift();
      console.groupCollapsed(`[layout] #${__layoutDiagLog.length} ${snapshot.direction} ${gridCols}×${totalRows} 分类:[${snapshot.catOrder.join(', ')}]`);
      console.log('grid来源:', snapshot.desktopGridSource, '| _gridRows:', snapshot.finalGridRows);
      console.log('packPlan:', snapshot.packPlan);
      console.table(Object.entries(positions).flatMap(([cat, arr]) =>
        arr.map(p => ({ cat, name: p.name, x: p.x, y: p.y, pack: p.pack }))));
      console.groupEnd();
    }

    // 对比最近两次快照，列出位置发生变化的图标
    window.__layoutDiagDiff = function () {
      const n = __layoutDiagLog.length;
      if (n < 2) { console.log('快照不足两次'); return; }
      const a = __layoutDiagLog[n - 2];
      const b = __layoutDiagLog[n - 1];
      console.log(`对比 #${n - 1} → #${n}`);
      if (a.catOrder.join() !== b.catOrder.join()) {
        console.warn('分类顺序/数量变化:', a.catOrder, '→', b.catOrder);
      }
      if (a.gridCols !== b.gridCols || a.totalRows !== b.totalRows) {
        console.warn('网格尺寸变化:', `${a.gridCols}×${a.totalRows}`, '→', `${b.gridCols}×${b.totalRows}`);
      }
      const posOf = (snap) => {
        const m = new Map();
        for (const arr of Object.values(snap.positions)) {
          for (const p of arr) m.set(p.name, p);
        }
        return m;
      };
      const ma = posOf(a), mb = posOf(b);
      const moved = [];
      for (const [name, pa] of ma) {
        const pb = mb.get(name);
        if (!pb) { moved.push({ name, change: '消失', from: `${pa.x},${pa.y}` }); continue; }
        if (pa.x !== pb.x || pa.y !== pb.y) {
          moved.push({ name, change: '移动', from: `${pa.x},${pa.y}`, to: `${pb.x},${pb.y}` });
        }
      }
      for (const [name, pb] of mb) {
        if (!ma.has(name)) moved.push({ name, change: '新增', to: `${pb.x},${pb.y}` });
      }
      if (moved.length === 0) console.log('两次布局完全一致 ✅');
      else console.table(moved);
      return moved;
    };

    function renderLayoutPreview() {
      const body = document.getElementById('previewBody');
      // 只计算真正的分区数据，跳过 _gridCols/_gridRows 等元数据
      const totalItems = Object.entries(previewLayout)
        .filter(([k]) => !k.startsWith('_'))
        .reduce((s, [, arr]) => s + arr.length, 0);

      const cols = previewLayout._gridCols || 10;
      const rows = previewLayout._gridRows || 12;

      // 收集所有有位置的图标
      const allItems = [];
      for (const [cat, items] of Object.entries(previewLayout)) {
        if (cat.startsWith('_')) continue;
        for (const item of items) {
          if (item.hasPosition) {
            allItems.push({ ...item, category: cat });
          }
        }
      }

      const cellMap = {};
      for (const item of allItems) {
        const c = Math.max(0, Math.min(cols - 1, Number.isInteger(item.gridX) ? item.gridX : 0));
        const r = Math.max(0, Math.min(rows - 1, Number.isInteger(item.gridY) ? item.gridY : 0));
        const key = `${r},${c}`;
        if (!cellMap[key]) cellMap[key] = [];
        cellMap[key].push(item);
      }

      const usedCats = [...new Set(allItems.map(i => i.category))];

      // 预览网格高度基于实际内容区，22×10 时也要完整显示
      const reservedSpace = 64;
      const legendRows = Math.max(1, Math.ceil(Math.max(usedCats.length, 1) / 8));
      const legendHeight = legendRows * 28 + 36;
      const availH = Math.max(160, body.clientHeight - reservedSpace - legendHeight);
      const cellH = Math.max(70, Math.floor(availH / rows));
      let html = `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},${cellH}px);gap:3px;background:#1a2332;border:1px solid #334155;border-radius:8px;padding:8px;width:100%;">`;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const items = cellMap[`${r},${c}`];
          const cellCat = items && items.length > 0 ? items[0].category : '';
          html += `<div data-cat="${escapeAttr(cellCat)}" data-row="${r}" data-col="${c}"
            ondragover="event.preventDefault();this.style.outline='2px solid #3b82f6'"
            ondragleave="this.style.outline=''"
            ondrop="previewDropOnCell(event,'${escapeAttr(cellCat)}');this.style.outline=''"
            style="background:#0f172a;border-radius:4px;display:flex;align-items:center;justify-content:center;min-height:0;overflow:hidden;">`;
          if (items && items.length > 0) {
            const item = items[0];
            const color = categoryColors[item.category] || '#64748b';
            const maxLen = 8;
            const name = item.name.length > maxLen ? item.name.slice(0, maxLen - 1) + '…' : item.name;
            const iconImg = item.icon
              ? `<img src="${item.icon}" style="width:44px;height:44px;object-fit:contain;">`
              : `<span style="font-size:28px;">${item.isDirectory ? '📁' : '📄'}</span>`;
            const extraBadge = items.length > 1
              ? `<span style="position:absolute;top:2px;right:2px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:${color};color:#fff;font-size:11px;line-height:18px;text-align:center;">+${items.length - 1}</span>`
              : '';

            html += `<div draggable="true" data-name="${escapeAttr(item.fullName)}"
              ondragstart="previewIconDragStart(event)" ondragend="previewIconDragEnd(event)"
              style="position:relative;width:96%;height:90%;border-radius:4px;background:${color}20;border:1px solid ${color}40;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;"
              title="${escapeAttr(items.map(i => i.fullName).join('\n'))}">
              ${extraBadge}
              ${iconImg}
              <span style="font-size:13px;color:#cbd5e1;text-align:center;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:94%;">${escapeHTML(name)}</span>
            </div>`;
          }
          html += '</div>';
        }
      }
      html += '</div>';

      html += '<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:10px;">';
      for (const cat of usedCats) {
        const color = categoryColors[cat] || '#64748b';
        html += `<span draggable="false"
          ondragover="event.preventDefault();this.style.outline='2px solid ${color}'"
          ondragleave="this.style.outline=''"
          ondrop="previewDropOnCell(event,'${escapeAttr(cat)}');this.style.outline=''"
          style="font-size:12px;color:#94a3b8;display:flex;align-items:center;gap:5px;padding:3px 8px;border-radius:4px;cursor:default;">
          <span style="width:10px;height:10px;border-radius:2px;background:${color};"></span>${escapeHTML(cat)}</span>`;
      }
      html += '</div>';
      html += `<div id="packPanelHost">${renderPackPanel()}</div>`;
      html += '<p style="text-align:center;color:#64748b;font-size:12px;margin-top:8px;">拖拽图标在分类之间调整，确认后重排桌面</p>';

      body.innerHTML = html;
      ensurePackPanelDelegation();
      document.getElementById('previewStats').textContent = `共 ${totalItems} 个文件 · ${cols} 列 × ${rows} 行`;
    }

    // 预览内拖拽
    function previewIconDragStart(e) {
      previewDragItem = { name: e.currentTarget.dataset.name };
      e.currentTarget.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
    }

    function previewIconDragEnd(e) {
      e.currentTarget.style.opacity = '1';
      previewDragItem = null;
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    }

    function previewDropOnCell(e, targetCat) {
      e.preventDefault();
      e.stopPropagation();
      if (!previewDragItem) return;
      const dragName = previewDragItem.name;
      if (!dragName) return;

      // 找到并移除被拖动的图标
      let draggedItem = null;
      for (const [cat, items] of Object.entries(previewLayout)) {
        if (cat.startsWith('_')) continue;
        const idx = items.findIndex(i => i.fullName === dragName || i.name === dragName);
        if (idx !== -1) {
          draggedItem = items.splice(idx, 1)[0];
          break;
        }
      }
      if (!draggedItem) return;

      draggedItem.originalCategory = draggedItem.originalCategory || draggedItem.category;
      draggedItem.category = targetCat;

      // 如果是从格子拖放，放到目标格子位置
      const r = parseInt(e.currentTarget.dataset.row);
      const c = parseInt(e.currentTarget.dataset.col);
      if (!isNaN(r) && !isNaN(c)) {
        draggedItem.gridX = c;
        draggedItem.gridY = r;
        draggedItem.hasPosition = true;
      } else {
        // 从图例拖放，放到目标分类的末尾位置
        const targetItems = previewLayout[targetCat] || [];
        const lastItem = targetItems[targetItems.length - 1];
        if (lastItem && Number.isInteger(lastItem.gridX) && Number.isInteger(lastItem.gridY)) {
          draggedItem.gridX = lastItem.gridX + 1;
          draggedItem.gridY = lastItem.gridY;
          if (draggedItem.gridX >= (previewLayout._gridCols || 10)) {
            draggedItem.gridX = 0;
            draggedItem.gridY = Math.min(draggedItem.gridY + 1, (previewLayout._gridRows || 12) - 1);
          }
        } else {
          draggedItem.gridX = 0;
          draggedItem.gridY = 0;
        }
        draggedItem.hasPosition = true;
      }

      if (!previewLayout[targetCat]) previewLayout[targetCat] = [];
      previewLayout[targetCat].push(draggedItem);

      for (const cat of Object.keys(previewLayout)) {
        if (cat.startsWith('_')) continue;
        if (previewLayout[cat].length === 0 && cat !== '未分类') delete previewLayout[cat];
      }

      renderLayoutPreview();
      previewDragItem = null;
    }

    function previewDragOver(e) {
      e.preventDefault();
      e.currentTarget.classList.add('drag-over');
    }

    function previewDragLeave(e) {
      e.currentTarget.classList.remove('drag-over');
    }

    function previewDrop(e, targetCategory) {
      e.preventDefault();
      e.currentTarget.classList.remove('drag-over');
      if (!previewDragItem) return;

      let movedItem = null;
      for (const [cat, items] of Object.entries(previewLayout)) {
        if (cat.startsWith('_')) continue;
        const idx = items.findIndex(i => i.fullName === previewDragItem.name || i.name === previewDragItem.name);
        if (idx !== -1) { movedItem = items.splice(idx, 1)[0]; break; }
      }
      if (!movedItem) return;

      movedItem.originalCategory = movedItem.originalCategory || movedItem.category;
      movedItem.category = targetCategory;
      if (!previewLayout[targetCategory]) previewLayout[targetCategory] = [];
      previewLayout[targetCategory].push(movedItem);

      for (const cat of Object.keys(previewLayout)) {
        if (cat.startsWith('_')) continue;
        if (previewLayout[cat].length === 0 && cat !== '未分类') delete previewLayout[cat];
      }
      renderLayoutPreview();
    }

    function openPreview() {
      updatePreviewDirectionButton();
      document.getElementById('previewOverlay').classList.add('visible');
    }

    function updatePreviewDirectionButton() {
      const btn = document.getElementById('layoutDirectionBtn');
      if (!btn) return;
      btn.textContent = previewLayoutDirection === 'vertical' ? '切换为横向排列' : '切换为竖向排列';
    }

    async function togglePreviewDirection() {
      previewLayoutDirection = previewLayoutDirection === 'vertical' ? 'horizontal' : 'vertical';
      await previewOrganize();
    }

    function closePreview() {
      document.getElementById('previewOverlay').classList.remove('visible');
      previewLayout = null;
      previewPackBaseLayouts = {};
    }

    function getPreviewPackFolderNames(layout) {
      const names = [];
      for (const [cat, items] of Object.entries(layout || {})) {
        if (cat.startsWith('_')) continue;
        for (const item of items) {
          if (item.isPackFolder) names.push(item.fullName || item.name);
        }
      }
      return [...new Set(names.filter(Boolean))];
    }

    async function readCurrentDesktopPositions() {
      const posData = await window.organizer.readDesktopPositions();
      const icons = Array.isArray(posData?.icons) ? posData.icons : [];
      return icons
        .filter(i => i.name && Number.isFinite(i.x) && Number.isFinite(i.y))
        .map(i => ({ name: i.name, x: Math.round(i.x), y: Math.round(i.y) }));
    }

    async function waitForDesktopIcons(names, timeoutMs = 3000) {
      const expected = new Set(names || []);
      const start = Date.now();
      let latest = [];
      if (expected.size === 0) return latest;

      while (Date.now() - start < timeoutMs) {
        latest = await readCurrentDesktopPositions();
        const visible = new Set(latest.map(i => i.name));
        let ready = true;
        for (const name of expected) {
          if (!visible.has(name)) { ready = false; break; }
        }
        if (ready) return latest;
        await new Promise(r => setTimeout(r, 200));
      }

      console.warn('[confirmOrganize] 等待桌面图标刷新超时:', [...expected]);
      return latest;
    }

    async function confirmOrganize() {
      console.log('[confirmOrganize] 开始, previewLayout=', !!previewLayout);
      if (!previewLayout) { console.warn('[confirmOrganize] previewLayout 为空，直接返回'); return; }
      let committedLayout = clonePreviewLayout(previewLayout);
      const packFolderNames = getPreviewPackFolderNames(committedLayout);

      const btn = document.getElementById('confirmBtn');
      btn.textContent = '整理中...';
      btn.disabled = true;

      try {
        console.log('[confirmOrganize] 创建快照...');
        await window.organizer.createLayoutSnapshot({ source: 'before-organize' });
        console.log('[confirmOrganize] 快照完成，同步分类...');

        for (const [cat, items] of Object.entries(committedLayout)) {
          if (cat.startsWith('_')) continue;
          for (const item of items) {
            if (item.isPackFolder) continue;
            const originalCategory = item.originalCategory || item.category;
            if (cat !== originalCategory) {
              await window.organizer.setCategory(item.id, cat, item);
            }
          }
        }
        console.log('[confirmOrganize] 分类同步完成，构建布局...');

        const packResult = await applyPreviewPacking();
        if (packResult.length > 0) {
          const packSummary = packResult.map(r => `${r.category}:${r.moved}/${(r.moved || 0) + (r.failed || 0)}`).join(', ');
          console.log('[confirmOrganize] 收纳完成:', packSummary);
          try {
            const postPackData = await window.organizer.scanDesktop();
            const grid = getDesktopGridMeta(currentData) || getDesktopGridMeta(postPackData);
            const entries = getCategoryEntries(postPackData).filter(([, items]) => items.length > 0);
            const rebuilt = buildBlockPreviewLayout(entries, grid?.cols || committedLayout._gridCols || 10, grid?.rows || committedLayout._gridRows || 12, previewLayoutDirection);
            committedLayout = rebuilt.layout;
            console.log('[confirmOrganize] 已按收纳后的分类重建布局');
          } catch (err) {
            console.warn('[confirmOrganize] 收纳后重建布局失败，继续使用原预览布局:', err);
          }
        }

        console.log('[confirmOrganize] 读取当前位置...');
        let currentPositions = [];
        try {
          currentPositions = packResult.length > 0
            ? await waitForDesktopIcons(packFolderNames)
            : await readCurrentDesktopPositions();
          console.log('[confirmOrganize] currentPositions=', currentPositions.length);
        } catch (e) {
          console.error('[confirmOrganize] 读取当前位置失败:', e);
        }

        // 构建 absolute 模式的目标布局（含 pixelX/pixelY）
        const gridMeta = getDesktopGridMeta(currentData);
        const xAxis = inferAxisFromPositions(currentPositions.map(i => i.x), gridMeta?.spacingX || 115, 20);
        const yAxis = inferAxisFromPositions(currentPositions.map(i => i.y), gridMeta?.spacingY || 147, 2);

        const layoutData = { _mode: 'absolute', items: [] };
        for (const [cat, items] of Object.entries(committedLayout)) {
          if (cat.startsWith('_')) continue;
          for (const item of items) {
            const targetItem = { name: item.fullName };
            if (item.gridX != null && item.gridY != null) {
              targetItem.pixelX = getAxisPosition(xAxis, item.gridX);
              targetItem.pixelY = getAxisPosition(yAxis, item.gridY);
            }
            layoutData.items.push(targetItem);
          }
        }
        console.log('[confirmOrganize] 布局构建完成，items=', layoutData.items.length);

        console.log('[confirmOrganize] 隐藏窗口...');
        // 隐藏窗口，让 PowerShell 操作桌面
        closePreview();
        closeCustom();
        await window.organizer.hideWindow();
        await new Promise(r => setTimeout(r, 500));

        console.log('[confirmOrganize] 调用 repositionDesktop...');
        console.log('[confirmOrganize] 调用 repositionDesktop...');
        try {
          const result = await window.organizer.repositionDesktop(layoutData, currentPositions);
          console.log('[reposition result]', result);
          if (result && result.includes('COMPLETED')) {
            // 提取关键信息显示
            const moved = (result.match(/moved (\d+) icons/) || [])[1] || '?';
            const listed = (result.match(/LISTVIEW: (\S+)/) || [])[1] || 'none';
            showToast(`已移动 ${moved} 个图标 (ListView:${listed})`);
          } else {
            showToast('重排完成: ' + (result || '').substring(0, 100));
          }
        } catch (err) {
          console.error('[confirmOrganize] repositionDesktop 失败:', err);
          showToast('重排失败: ' + err.message);
        }

        console.log('[confirmOrganize] 恢复窗口...');
        // 恢复窗口
        await window.organizer.showWindow();
        await rescan();
      } catch (err) {
        console.error('[confirmOrganize] 外层 catch:', err);
        await window.organizer.showWindow();
        showToast('整理失败: ' + err.message);
      }

      btn.textContent = '确认整理';
      btn.disabled = false;
      console.log('[confirmOrganize] 完成');
    }

