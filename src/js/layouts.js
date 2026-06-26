    // ========== 布局方案与快照 ==========
    let savedLayouts = { snapshots: [], schemes: [] };
    const selectState = { scheme: { selecting: false, ids: new Set() }, snapshot: { selecting: false, ids: new Set() } };

    function formatLayoutTime(value) {
      if (!value) return '';
      return new Date(value).toLocaleString('zh-CN', { hour12: false });
    }

    async function loadLayouts() {
      const layouts = await window.organizer.listLayouts();
      if (layouts?.error) {
        console.error('读取布局方案返回错误:', layouts.error);
        showToast('读取布局方案异常，已显示空列表: ' + layouts.error);
      }
      savedLayouts = {
        snapshots: Array.isArray(layouts?.snapshots) ? layouts.snapshots : [],
        schemes: Array.isArray(layouts?.schemes) ? layouts.schemes : [],
      };
      return savedLayouts;
    }

    function getLayoutPreviewData(record) {
      const preview = record?.preview || {};
      const items = Array.isArray(preview.items)
        ? preview.items
        : (Array.isArray(record?.layoutData?.items) ? record.layoutData.items : []);
      return {
        grid: preview.grid || record?.grid || null,
        items: items.filter(Boolean),
      };
    }

    function renderLayoutPreviewCanvas(record) {
      const data = getLayoutPreviewData(record);
      const items = data.items;
      if (items.length === 0) {
        return `<div class="empty-state" style="padding:48px;"><p>这条布局没有可预览的坐标数据</p></div>`;
      }

      const grid = data.grid || {};
      const maxGridX = Math.max(...items.map(i => Number.isInteger(i.gridX) ? i.gridX : 0), 0);
      const maxGridY = Math.max(...items.map(i => Number.isInteger(i.gridY) ? i.gridY : 0), 0);
      const cols = Math.max(1, Number(grid.cols) || maxGridX + 1);
      const rows = Math.max(1, Number(grid.rows) || maxGridY + 1);
      const previewBody = document.getElementById('layoutPreviewCanvas');
      const availH = Math.max(220, (previewBody?.clientHeight || 520) - 40);
      const cellH = Math.max(54, Math.floor(availH / rows));
      const iconSize = Math.max(22, Math.min(36, cellH - 34));
      const cellMap = new Map();
      for (const item of items) {
        const gridX = Math.max(0, Math.min(cols - 1, Number.isInteger(item.gridX) ? item.gridX : 0));
        const gridY = Math.max(0, Math.min(rows - 1, Number.isInteger(item.gridY) ? item.gridY : 0));
        const key = `${gridY},${gridX}`;
        if (!cellMap.has(key)) cellMap.set(key, []);
        cellMap.get(key).push(item);
      }

      const renderDefaultIcon = (name) => {
        const isFolderLike = !/\.[^\\/.]+$/.test(name || '');
        const symbol = isFolderLike ? '📁' : '📄';
        const bg = isFolderLike ? '#ca8a04' : '#475569';
        return `<div style="width:${iconSize}px;height:${iconSize}px;border-radius:8px;background:${bg};display:flex;align-items:center;justify-content:center;margin:0 auto 3px;font-size:${Math.max(16, iconSize - 12)}px;box-shadow:0 2px 8px rgba(0,0,0,.25);">${symbol}</div>`;
      };

      const cells = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const stack = cellMap.get(`${y},${x}`) || [];
          const item = stack[0];
          if (!item) {
            cells.push('<div style="border:1px solid rgba(51,65,85,.22);"></div>');
            continue;
          }
          const name = item.name || '';
          const icon = record?.previewIcons?.[item.iconKey];
          const iconHtml = icon
            ? `<img src="${escapeHTMLAttr(icon)}" style="width:${iconSize}px;height:${iconSize}px;object-fit:contain;display:block;margin:0 auto 3px;filter:drop-shadow(0 2px 5px rgba(0,0,0,.35));">`
            : renderDefaultIcon(name);
          const badge = stack.length > 1
            ? `<span style="position:absolute;right:10px;top:6px;background:#f97316;color:white;border-radius:999px;font-size:10px;padding:1px 5px;">+${stack.length - 1}</span>`
            : '';
          cells.push(`<div title="${escapeHTMLAttr(stack.map(i => i.name || '').join('\n'))}" style="position:relative;border:1px solid rgba(51,65,85,.22);padding:4px;text-align:center;color:#e2e8f0;font-size:11px;line-height:13px;text-shadow:0 1px 3px rgba(0,0,0,.9);overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;">
            ${badge}
            ${iconHtml}
            <div style="max-width:96%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(name)}</div>
          </div>`);
        }
      }

      return `<div style="width:100%;border:1px solid #334155;border-radius:12px;background:linear-gradient(135deg,#0f172a,#111827);padding:8px;">
        <div style="display:grid;grid-template-columns:repeat(${cols}, 1fr);grid-template-rows:repeat(${rows}, ${cellH}px);gap:3px;border:1px solid rgba(51,65,85,.65);border-radius:10px;overflow:hidden;background:#111827;">
          ${cells.join('')}
        </div>
      </div>`;
    }

    function openLayoutPreview(type, id) {
      const list = type === 'scheme' ? savedLayouts.schemes : savedLayouts.snapshots;
      const record = (Array.isArray(list) ? list : []).find(item => item.id === id);
      if (!record) { showToast('找不到这条布局记录'); return; }
      document.getElementById('layoutPreviewTitle').textContent = record.name || '布局预览';
      document.getElementById('layoutPreviewMeta').textContent = `${record.itemCount || 0} 项 · ${formatLayoutTime(record.createdAt)}`;
      try {
        document.getElementById('layoutPreviewCanvas').innerHTML = renderLayoutPreviewCanvas(record);
        document.getElementById('layoutPreviewOverlay').classList.add('visible');
      } catch (err) {
        console.error('渲染布局预览失败:', err, record);
        showToast('渲染布局预览失败: ' + err.message);
      }
    }

    function closeLayoutPreview() {
      document.getElementById('layoutPreviewOverlay').classList.remove('visible');
      document.getElementById('layoutPreviewCanvas').innerHTML = '';
    }

    function renderLayoutPreview(record) {
      try {
        const preview = record?.preview || {};
        const items = Array.isArray(preview.items) ? preview.items.filter(Boolean) : [];
      if (items.length === 0) {
        return `<div style="height:96px;border:1px dashed #334155;border-radius:8px;background:#0f172a;margin-bottom:10px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:12px;">暂无预览</div>`;
      }

      const grid = preview.grid || {};
      const maxGridX = Math.max(...items.map(i => Number.isInteger(i.gridX) ? i.gridX : 0), 0);
      const maxGridY = Math.max(...items.map(i => Number.isInteger(i.gridY) ? i.gridY : 0), 0);
      const cols = Math.max(1, Number(grid.cols) || maxGridX + 1);
      const rows = Math.max(1, Number(grid.rows) || maxGridY + 1);
      const points = items.map(item => {
        const x = Math.max(0, Math.min(100, ((Number.isInteger(item.gridX) ? item.gridX : 0) + 0.5) / cols * 100));
        const y = Math.max(0, Math.min(100, ((Number.isInteger(item.gridY) ? item.gridY : 0) + 0.5) / rows * 100));
        return `<span title="${escapeHTMLAttr(item.name || '')}" style="position:absolute;left:${x}%;top:${y}%;width:5px;height:5px;border-radius:50%;background:#60a5fa;box-shadow:0 0 0 1px rgba(15,23,42,.8);transform:translate(-50%,-50%);"></span>`;
      }).join('');
      return `<div style="height:96px;border:1px solid #334155;border-radius:8px;background:linear-gradient(135deg,#0f172a,#111827);margin-bottom:10px;position:relative;overflow:hidden;">
        <div style="position:absolute;inset:8px;border:1px solid rgba(51,65,85,.5);border-radius:6px;background-image:linear-gradient(rgba(51,65,85,.22) 1px, transparent 1px),linear-gradient(90deg, rgba(51,65,85,.22) 1px, transparent 1px);background-size:${Math.max(12, 100 / Math.min(cols, 12))}% ${Math.max(12, 100 / Math.min(rows, 8))}%;">
          ${points}
        </div>
      </div>`;
      } catch (err) {
        console.error('渲染布局预览失败:', err, record);
        return `<div style="height:96px;border:1px dashed #334155;border-radius:8px;background:#0f172a;margin-bottom:10px;display:flex;align-items:center;justify-content:center;color:#f87171;font-size:12px;">预览失败</div>`;
      }
    }

    function renderLayoutRecord(record, type) {
      const safeRecord = record || {};
      const action = type === 'scheme' ? '应用' : '恢复';
      const state = selectState[type];
      const selecting = state.selecting;
      const id = safeRecord.id || '';
      const checked = state.ids.has(id) ? 'checked' : '';
      const checkbox = selecting
        ? `<input type="checkbox" ${checked} onchange="toggleSelectItem('${type}', '${escapeAttr(id)}', this.checked)" style="width:16px;height:16px;cursor:pointer;flex-shrink:0;">`
        : '';
      const renameBtn = type === 'scheme'
        ? `<button class="btn btn-ghost" onclick="renameSavedScheme('${escapeAttr(id)}')">重命名</button>`
        : '';
      const actions = selecting ? '' : `<div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-ghost" onclick="openLayoutPreview('${type}', '${escapeAttr(id)}')">预览</button>
          <button class="btn btn-primary" onclick="restoreSavedLayout('${type}', '${escapeAttr(id)}')">${action}</button>
          ${renameBtn}
          <button class="btn btn-danger" onclick="deleteSavedLayout('${type}', '${escapeAttr(id)}')">删除</button>
        </div>`;
      return `<div style="padding:12px;border:1px solid #334155;border-radius:10px;background:#1e293b;margin-bottom:10px;display:flex;gap:10px;align-items:flex-start;">
        ${checkbox}
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;color:#f8fafc;margin-bottom:4px;">${escapeHTML(safeRecord.name || '未命名布局')}</div>
          ${safeRecord.broken ? `<div style="font-size:12px;color:#f87171;margin-bottom:6px;">记录损坏：${escapeHTML(safeRecord.error || '读取失败')}</div>` : ''}
          <div style="font-size:12px;color:#64748b;margin-bottom:${selecting ? '0' : '10px'};">${safeRecord.itemCount || 0} 项 · ${formatLayoutTime(safeRecord.createdAt)}</div>
          ${actions}
        </div>
      </div>`;
    }

    function renderLayoutRecordSafe(record, type) {
      try {
        return renderLayoutRecord(record || {}, type);
      } catch (err) {
        console.error('渲染布局记录失败:', err, record);
        const id = record?.id || '';
        return `<div style="padding:12px;border:1px solid #7f1d1d;border-radius:10px;background:#1e293b;margin-bottom:10px;">
          <div style="font-weight:700;color:#f8fafc;margin-bottom:4px;">无法渲染的布局记录</div>
          <div style="font-size:12px;color:#f87171;margin-bottom:10px;">渲染失败</div>
          ${id ? `<button class="btn btn-danger" onclick="deleteSavedLayout('${type}', '${escapeAttr(id)}')">删除</button>` : ''}
        </div>`;
      }
    }

    function renderSelectToolbar(type) {
      const state = selectState[type];
      if (!state.selecting) return '';
      const list = type === 'scheme' ? savedLayouts.schemes : savedLayouts.snapshots;
      const total = list.length;
      const count = state.ids.size;
      const allChecked = total > 0 && count === total;
      return `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;padding:8px;border:1px solid #334155;border-radius:8px;background:#0f172a;">
        <button class="btn btn-ghost" onclick="toggleSelectAll('${type}')">${allChecked ? '取消全选' : '全选'}</button>
        <button class="btn btn-danger" onclick="deleteSelectedLayouts('${type}')" ${count === 0 ? 'disabled' : ''}>删除选中(${count})</button>
        <button class="btn btn-danger" onclick="deleteAllLayouts('${type}')" ${total === 0 ? 'disabled' : ''}>全部删除</button>
        <button class="btn btn-ghost" onclick="toggleSelectMode('${type}')">取消</button>
      </div>`;
    }

    function renderLayoutManagerFromCache() {
      const schemes = Array.isArray(savedLayouts?.schemes) ? savedLayouts.schemes : [];
      const snapshots = Array.isArray(savedLayouts?.snapshots) ? savedLayouts.snapshots : [];
      const schemeBtn = document.getElementById('schemeManageBtn');
      const snapshotBtn = document.getElementById('snapshotManageBtn');
      const schemeToolbar = document.getElementById('schemeToolbar');
      const snapshotToolbar = document.getElementById('snapshotToolbar');
      const schemeList = document.getElementById('layoutSchemeList');
      const snapshotList = document.getElementById('layoutSnapshotList');

      if (schemeBtn) schemeBtn.style.display = schemes.length ? '' : 'none';
      if (snapshotBtn) snapshotBtn.style.display = snapshots.length ? '' : 'none';
      if (schemeToolbar) schemeToolbar.innerHTML = '';
      if (snapshotToolbar) snapshotToolbar.innerHTML = '';

      if (schemeList) {
        schemeList.innerHTML = schemes.length
          ? schemes.map(record => renderLayoutRecordSafe(record, 'scheme')).join('')
          : '<div class="empty-state" style="padding:24px;"><p>暂无手动方案</p></div>';
      }
      if (snapshotList) {
        snapshotList.innerHTML = snapshots.length
          ? snapshots.map(record => renderLayoutRecordSafe(record, 'snapshot')).join('')
          : '<div class="empty-state" style="padding:24px;"><p>暂无自动快照</p></div>';
      }
    }

    async function renderLayoutManager() {
      await loadLayouts();
      renderLayoutManagerFromCache();
    }

    function toggleSelectMode(type) {
      const state = selectState[type];
      state.selecting = !state.selecting;
      state.ids.clear();
      const btn = document.getElementById(type === 'scheme' ? 'schemeManageBtn' : 'snapshotManageBtn');
      if (btn) btn.textContent = state.selecting ? '完成' : '管理';
      renderLayoutManager();
    }

    function toggleSelectItem(type, id, checked) {
      const state = selectState[type];
      if (checked) state.ids.add(id); else state.ids.delete(id);
      // 只刷新工具条计数，不重渲染列表，避免打断勾选
      document.getElementById(type === 'scheme' ? 'schemeToolbar' : 'snapshotToolbar').innerHTML = renderSelectToolbar(type);
    }

    function toggleSelectAll(type) {
      const state = selectState[type];
      const list = type === 'scheme' ? savedLayouts.schemes : savedLayouts.snapshots;
      if (state.ids.size === list.length) state.ids.clear();
      else list.forEach(r => state.ids.add(r.id));
      renderLayoutManager();
    }

    async function deleteSelectedLayouts(type) {
      const state = selectState[type];
      const ids = [...state.ids];
      if (ids.length === 0) return;
      if (!confirm(`确定删除选中的 ${ids.length} 条记录吗？`)) return;
      try {
        savedLayouts = await window.organizer.deleteLayouts(type, ids);
        state.ids.clear();
        renderSelectToolbarAfterDelete(type);
        showToast(`已删除 ${ids.length} 条记录`);
      } catch (err) {
        showToast('删除失败: ' + err.message);
      }
    }

    async function deleteAllLayouts(type) {
      const list = type === 'scheme' ? savedLayouts.schemes : savedLayouts.snapshots;
      if (list.length === 0) return;
      const label = type === 'scheme' ? '手动方案' : '自动快照';
      if (!confirm(`确定清空全部${label}（共 ${list.length} 条）吗？此操作不可恢复。`)) return;
      try {
        savedLayouts = await window.organizer.deleteLayouts(type, []);
        selectState[type].ids.clear();
        renderSelectToolbarAfterDelete(type);
        showToast(`已清空全部${label}`);
      } catch (err) {
        showToast('删除失败: ' + err.message);
      }
    }

    // 删除后列表可能为空，退出勾选模式并重渲染
    function renderSelectToolbarAfterDelete(type) {
      const list = type === 'scheme' ? savedLayouts.schemes : savedLayouts.snapshots;
      if (list.length === 0) {
        selectState[type].selecting = false;
        const btn = document.getElementById(type === 'scheme' ? 'schemeManageBtn' : 'snapshotManageBtn');
        if (btn) btn.textContent = '管理';
      }
      renderLayoutManager();
    }

    async function openLayoutManager() {
      document.getElementById('layoutOverlay').classList.add('visible');
      try {
        await loadLayouts();
      } catch (err) {
        showToast('读取布局方案失败: ' + err.message);
        return;
      }
      try {
        renderLayoutManagerFromCache();
      } catch (err) {
        console.error('渲染布局方案失败:', err);
        showToast('渲染布局方案失败: ' + err.message);
      }
    }

    function closeLayoutManager() {
      document.getElementById('layoutOverlay').classList.remove('visible');
      // 关闭时重置勾选状态，下次打开回到普通视图
      selectState.scheme.selecting = false; selectState.scheme.ids.clear();
      selectState.snapshot.selecting = false; selectState.snapshot.ids.clear();
      document.getElementById('schemeManageBtn').textContent = '管理';
      document.getElementById('snapshotManageBtn').textContent = '管理';
    }

    async function createManualSnapshot() {
      try {
        const result = await window.organizer.createLayoutSnapshot({ source: 'manual', name: '手动快照 ' + formatLayoutTime(new Date().toISOString()) });
        showToast(result && result.skipped ? '桌面布局未变化，已有相同快照' : '已保存当前桌面快照');
        await renderLayoutManager();
      } catch (err) {
        showToast('保存快照失败: ' + err.message);
      }
    }

    function getLatestSnapshot() {
      return [...(savedLayouts.snapshots || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
    }

    async function quickRestoreLatestLayout() {
      try {
        await loadLayouts();
        const snapshot = getLatestSnapshot();
        if (!snapshot) { showToast('暂无可恢复的布局快照'); return; }
        await restoreSavedLayout('snapshot', snapshot.id);
      } catch (err) {
        showToast('恢复失败: ' + err.message);
      }
    }

    async function restoreSavedLayout(type, id) {
      const label = type === 'scheme' ? '应用该布局方案' : '恢复该布局快照';
      if (!confirm(`${label}前会保存当前桌面快照，恢复期间请不要操作鼠标。是否继续？`)) return;
      try {
        // 先读取当前桌面图标真实像素坐标（IFolderView2 COM 方案）
        let currentPositions = [];
        try {
          const posData = await window.organizer.readDesktopPositions();
          if (posData && posData.icons) {
            const workW = posData.workArea?.width || posData.desktop?.width || 1920;
            const workH = posData.workArea?.height || posData.desktop?.height || 1080;
            currentPositions = posData.icons
              .filter(i => i.name && i.x != null && i.y != null && i.x > 0 && i.y > 0 && i.x < workW && i.y < workH)
              .map(i => ({ name: i.name, x: Math.round(i.x), y: Math.round(i.y) }));
          }
        } catch (e) {
          console.warn('读取当前位置失败:', e);
        }

        // 隐藏窗口让 PowerShell 操作桌面
        await window.organizer.hideWindow();
        await new Promise(r => setTimeout(r, 500));

        try {
          const result = await window.organizer.restoreLayout({ type, id, createSnapshotBeforeRestore: true, currentPositions });
          showToast(result?.ok ? '布局已恢复' : '恢复完成，请检查桌面');
        } catch (err) {
          showToast('恢复失败: ' + err.message);
        }

        // 恢复窗口
        await window.organizer.showWindow();
        await renderLayoutManager().catch(() => {});
        await rescan();
      } catch (err) {
        await window.organizer.showWindow();
        showToast('恢复失败: ' + err.message);
      }
    }

    async function deleteSavedLayout(type, id) {
      if (!confirm('确定删除这条布局记录吗？')) return;
      try {
        savedLayouts = await window.organizer.deleteLayout(type, id);
        await renderLayoutManager();
        showToast('已删除布局记录');
      } catch (err) {
        showToast('删除失败: ' + err.message);
      }
    }

    async function renameSavedScheme(id) {
      const name = await promptText('重命名布局方案', '请输入新的方案名');
      if (name === null) return;
      try {
        await window.organizer.renameLayoutScheme(id, name);
        await renderLayoutManager();
        showToast('已重命名方案');
      } catch (err) {
        showToast('重命名失败: ' + err.message);
      }
    }

    async function savePreviewAsScheme() {
      if (!previewLayout) { showToast('没有可保存的布局预览'); return; }
      const name = await promptText('保存布局方案', '请输入布局方案名');
      if (name === null) return;
      try {
        await window.organizer.saveLayoutScheme({
          name,
          grid: { cols: previewLayout._gridCols || 10, rows: previewLayout._gridRows || 12 },
          layoutData: { ...previewLayout, _spacingX: getDesktopGridMeta(currentData)?.spacingX, _spacingY: getDesktopGridMeta(currentData)?.spacingY },
        });
        showToast(`已保存布局方案「${name.trim()}」`);
        await loadLayouts().catch(() => {});
      } catch (err) {
        showToast('保存方案失败: ' + err.message);
      }
    }

    function buildCustomPreviewLayout() {
      const entries = customZones
        .filter(z => z.items.length > 0)
        .map(z => [z.name, z.items]);
      const cols = getDesktopGridMeta(currentData)?.cols || 10;
      const rows = getDesktopGridMeta(currentData)?.rows || 12;
      return buildBlockPreviewLayout(entries, cols, rows, 'vertical').layout;
    }

    async function saveCustomAsScheme() {
      const name = await promptText('保存布局方案', '请输入布局方案名');
      if (name === null) return;
      try {
        const layout = buildCustomPreviewLayout();
        await window.organizer.saveLayoutScheme({
          name,
          grid: { cols: layout._gridCols || 10, rows: layout._gridRows || 12 },
          layoutData: { ...layout, _spacingX: getDesktopGridMeta(currentData)?.spacingX, _spacingY: getDesktopGridMeta(currentData)?.spacingY },
        });
        showToast(`已保存布局方案「${name.trim()}」`);
      } catch (err) {
        showToast('保存方案失败: ' + err.message);
      }
    }

