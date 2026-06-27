    // ========== 自定义整理 ==========
    let customZones = [];
    let customUnassigned = [];
    let customSelectedUnassigned = new Set();
    let customSelectedByZone = {};
    let customMoveTargetZoneIdx = 0;
    const zoneColors = ['#8b5cf6','#10b981','#f59e0b','#3b82f6','#ec4899','#6366f1','#ef4444','#14b8a6','#f97316','#06b6d4'];

    function openCustom() {
      const data = getCategoryEntries(currentData).length > 0 ? currentData : null;
      if (!data) { showToast('请先扫描桌面'); return; }

      // 把所有文件放入未分配列表
      customUnassigned = [];
      for (const [, items] of getCategoryEntries(data)) {
        for (const item of items) {
          customUnassigned.push({ ...item });
        }
      }

      // 创建默认分区（从自动分类的结果初始化）
      customZones = [];
      const assignedIds = new Set();
      let ci = 0;
      for (const [cat, items] of getCategoryEntries(data)) {
        if (items.length === 0) continue;
        const zoneItems = items.map(i => ({ ...i, originalCategory: i.originalCategory || i.category || cat }));
        zoneItems.forEach(i => assignedIds.add(i.fullName));
        customZones.push({
          name: cat,
          color: zoneColors[ci % zoneColors.length],
          items: zoneItems,
        });
        ci++;
      }

      // 从未分配列表中移除已分配的文件
      customUnassigned = customUnassigned.filter(i => !assignedIds.has(i.fullName));
      customSelectedUnassigned = new Set();
      customSelectedByZone = {};

      renderCustomFiles();
      renderCustomZones();
      renderCustomPreview();
      document.getElementById('customOverlay').style.display = 'flex';

      // 搜索过滤
      document.getElementById('customSearch').oninput = (e) => {
        renderCustomFiles(e.target.value.trim().toLowerCase());
      };
    }

    function closeCustom() {
      document.getElementById('customOverlay').style.display = 'none';
    }

    function getCustomSearchFilter() {
      return document.getElementById('customSearch')?.value.trim().toLowerCase() || '';
    }

    function refreshCustomLayout() {
      if (customZones.length === 0) customMoveTargetZoneIdx = 0;
      else if (customMoveTargetZoneIdx >= customZones.length) customMoveTargetZoneIdx = customZones.length - 1;
      else if (customMoveTargetZoneIdx < 0) customMoveTargetZoneIdx = 0;
      renderCustomFiles(getCustomSearchFilter());
      renderCustomZones();
      renderCustomPreview();
    }

    function getCustomZoneSelection(zoneIdx) {
      if (!customSelectedByZone[zoneIdx]) customSelectedByZone[zoneIdx] = new Set();
      return customSelectedByZone[zoneIdx];
    }

    function clearCustomSelectionForItems(items) {
      const names = new Set(items.map(i => i.fullName));
      for (const name of names) customSelectedUnassigned.delete(name);
      for (const selected of Object.values(customSelectedByZone)) {
        for (const name of names) selected.delete(name);
      }
    }

    function toggleCustomUnassignedSelection(fullName, checked) {
      if (checked) customSelectedUnassigned.add(fullName);
      else customSelectedUnassigned.delete(fullName);
      renderCustomFiles(getCustomSearchFilter());
    }

    function toggleCustomZoneSelection(zoneIdx, fullName, checked) {
      const selected = getCustomZoneSelection(zoneIdx);
      if (checked) selected.add(fullName);
      else selected.delete(fullName);
      renderCustomZones();
    }

    function moveSelectedUnassignedToZone(zoneIdx) {
      const zone = customZones[zoneIdx];
      if (!zone) { showToast('请选择目标分区'); return; }
      const selected = customSelectedUnassigned;
      if (selected.size === 0) { showToast('请先勾选要移入的图标'); return; }

      const moved = customUnassigned.filter(i => selected.has(i.fullName));
      if (moved.length === 0) { showToast('没有可移入的图标'); return; }
      customUnassigned = customUnassigned.filter(i => !selected.has(i.fullName));
      zone.items.push(...moved);
      clearCustomSelectionForItems(moved);
      showToast(`已移入 ${moved.length} 个图标到「${zone.name}」`);
      refreshCustomLayout();
    }

    function removeSelectedFromZone(zoneIdx) {
      const zone = customZones[zoneIdx];
      if (!zone) return;
      const selected = getCustomZoneSelection(zoneIdx);
      if (selected.size === 0) { showToast('请先勾选要移出的图标'); return; }

      const moved = zone.items.filter(i => selected.has(i.fullName));
      if (moved.length === 0) { showToast('没有可移出的图标'); return; }
      zone.items = zone.items.filter(i => !selected.has(i.fullName));
      customUnassigned.push(...moved);
      clearCustomSelectionForItems(moved);
      showToast(`已从「${zone.name}」移出 ${moved.length} 个图标`);
      refreshCustomLayout();
    }

    function moveCustomZone(zoneIdx, direction) {
      const targetIdx = zoneIdx + direction;
      if (targetIdx < 0 || targetIdx >= customZones.length) return;
      [customZones[zoneIdx], customZones[targetIdx]] = [customZones[targetIdx], customZones[zoneIdx]];
      const currentSelected = customSelectedByZone[zoneIdx];
      customSelectedByZone[zoneIdx] = customSelectedByZone[targetIdx] || new Set();
      customSelectedByZone[targetIdx] = currentSelected || new Set();
      customMoveTargetZoneIdx = targetIdx;
      renderCustomZones();
      renderCustomPreview();
    }

    function getCustomZoneOptions(selectedIdx = 0) {
      return customZones.map((zone, zi) => `<option value="${zi}" ${zi === selectedIdx ? 'selected' : ''}>${escapeHTML(zone.name)}</option>`).join('');
    }

    function renderCustomFiles(filter = '') {
      const el = document.getElementById('customFileList');
      const items = filter
        ? customUnassigned.filter(i => i.name.toLowerCase().includes(filter) || i.fullName.toLowerCase().includes(filter))
        : customUnassigned;
      const selectedCount = customSelectedUnassigned.size;
      const toolbar = customUnassigned.length > 0 ? `<div style="width:100%;display:flex;align-items:center;gap:6px;margin-bottom:6px;padding:6px;background:#111827;border:1px solid #334155;border-radius:6px;">
        <span style="color:#94a3b8;font-size:11px;white-space:nowrap;">已选择 ${selectedCount} 个</span>
        <select id="customMoveTarget" onchange="customMoveTargetZoneIdx = parseInt(this.value)" style="background:#0f172a;border:1px solid #334155;border-radius:4px;color:#e2e8f0;font-size:11px;padding:3px 6px;min-width:120px;outline:none;" ${customZones.length === 0 ? 'disabled' : ''}>${getCustomZoneOptions(customMoveTargetZoneIdx)}</select>
        <button onclick="customMoveTargetZoneIdx = parseInt(document.getElementById('customMoveTarget').value);moveSelectedUnassignedToZone(customMoveTargetZoneIdx)" style="background:#3b82f6;border:1px solid #60a5fa;color:white;cursor:pointer;font-size:11px;padding:3px 8px;border-radius:4px;" ${selectedCount === 0 || customZones.length === 0 ? 'disabled' : ''}>移入分区</button>
      </div>` : '';

      const itemsHtml = items.map(item => {
        const checked = customSelectedUnassigned.has(item.fullName) ? 'checked' : '';
        const iconImg = item.icon
          ? `<img src="${item.icon}" style="width:28px;height:28px;object-fit:contain;">`
          : `<span style="font-size:18px;">${item.isDirectory ? '📁' : '📄'}</span>`;
        return `<div draggable="true" data-name="${escapeAttr(item.fullName)}"
          ondragstart="customDragStart(event)"
          ondragend="customDragEnd(event)"
          style="width:80px;padding:6px;border-radius:6px;background:#1e293b;border:1px solid #334155;display:flex;flex-direction:column;align-items:center;gap:2px;cursor:grab;font-size:9px;color:#cbd5e1;text-align:center;position:relative;"
          title="${escapeAttr(item.fullName)}">
          <input type="checkbox" ${checked} onclick="event.stopPropagation()" onchange="toggleCustomUnassignedSelection(this.closest('[data-name]').dataset.name,this.checked)"
            style="position:absolute;top:3px;left:3px;width:13px;height:13px;accent-color:#3b82f6;cursor:pointer;">
          ${iconImg}
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:72px;">${escapeHTML(item.name.length > 8 ? item.name.slice(0,7) + '…' : item.name)}</span>
        </div>`;
      }).join('');

      el.innerHTML = toolbar + itemsHtml;

      if (items.length === 0) {
        el.innerHTML = toolbar + '<div style="color:#64748b;font-size:12px;padding:20px;text-align:center;width:100%;">所有文件已分配到分区中</div>';
      }
    }

    function renderCustomZones() {
      const el = document.getElementById('customZones');
      el.innerHTML = customZones.map((zone, zi) => {
        const selectedCount = getCustomZoneSelection(zi).size;
        const itemsHtml = zone.items.map(item => {
          const checked = getCustomZoneSelection(zi).has(item.fullName) ? 'checked' : '';
          const iconImg = item.icon
            ? `<img src="${item.icon}" style="width:22px;height:22px;object-fit:contain;">`
            : `<span style="font-size:14px;">${item.isDirectory ? '📁' : '📄'}</span>`;
          return `<div draggable="true" data-name="${escapeAttr(item.fullName)}" data-zone="${zi}"
            ondragstart="customDragFromZone(event)"
            ondragend="customDragEnd(event)"
            style="width:60px;padding:3px;border-radius:4px;background:${zone.color}15;border:1px solid ${zone.color}30;display:flex;flex-direction:column;align-items:center;gap:1px;cursor:grab;font-size:8px;color:#cbd5e1;text-align:center;position:relative;"
            title="${escapeAttr(item.fullName)}">
            <input type="checkbox" ${checked} onclick="event.stopPropagation()" onchange="toggleCustomZoneSelection(${zi},this.closest('[data-name]').dataset.name,this.checked)"
              style="position:absolute;top:2px;left:2px;width:12px;height:12px;accent-color:${zone.color};cursor:pointer;">
            ${iconImg}
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:56px;">${escapeHTML(item.name.length > 6 ? item.name.slice(0,5) + '…' : item.name)}</span>
          </div>`;
        }).join('');

        return `<div style="margin-bottom:8px;border:1px solid ${zone.color}40;border-radius:8px;background:#1e293b;overflow:hidden;"
          ondragover="event.preventDefault();this.style.borderColor='${zone.color}'"
          ondragleave="this.style.borderColor='${zone.color}40'"
          ondrop="customDropToZone(event,${zi});this.style.borderColor='${zone.color}40'">
          <div style="padding:6px 10px;display:flex;align-items:center;gap:8px;background:${zone.color}15;">
            <div style="width:10px;height:10px;border-radius:3px;background:${zone.color};flex-shrink:0;"></div>
            <input value="${escapeAttr(zone.name)}" onchange="renameCustomZone(${zi},this.value)"
              style="background:transparent;border:none;color:#f1f5f9;font-size:13px;font-weight:600;outline:none;flex:1;min-width:0;">
            <span style="color:#64748b;font-size:11px;">${zone.items.length}</span>
            <button onclick="moveCustomZone(${zi},-1)" title="上移分区" style="background:${zone.color}20;border:1px solid ${zone.color}40;color:#e2e8f0;cursor:pointer;font-size:10px;padding:2px 6px;border-radius:4px;" ${zi === 0 ? 'disabled' : ''}>↑</button>
            <button onclick="moveCustomZone(${zi},1)" title="下移分区" style="background:${zone.color}20;border:1px solid ${zone.color}40;color:#e2e8f0;cursor:pointer;font-size:10px;padding:2px 6px;border-radius:4px;" ${zi === customZones.length - 1 ? 'disabled' : ''}>↓</button>
            ${selectedCount > 0 ? `<button onclick="removeSelectedFromZone(${zi})" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#fecaca;cursor:pointer;font-size:10px;padding:2px 6px;border-radius:4px;">移出所选 ${selectedCount}</button>` : ''}
            <div style="position:relative;display:inline-block;">
              <button onclick="toggleBatchMenu(this)" style="background:${zone.color}30;border:1px solid ${zone.color}50;color:#e2e8f0;cursor:pointer;font-size:10px;padding:2px 6px;border-radius:4px;">批量移入 ▾</button>
              <div class="batch-menu" style="display:none;background:#1e293b;border:1px solid #334155;border-radius:6px;padding:4px;z-index:9999;min-width:120px;max-height:240px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.4);">
                <div class="batch-item" onclick="batchMoveToZone(${zi},'folder')" style="padding:4px 8px;font-size:11px;color:#e2e8f0;cursor:pointer;border-radius:3px;">📁 所有文件夹</div>
                <div class="batch-item" onclick="batchMoveToZone(${zi},'shortcut')" style="padding:4px 8px;font-size:11px;color:#e2e8f0;cursor:pointer;border-radius:3px;">🔗 所有快捷方式</div>
                <div class="batch-item" onclick="batchMoveToZone(${zi},'image')" style="padding:4px 8px;font-size:11px;color:#e2e8f0;cursor:pointer;border-radius:3px;">🖼️ 所有图片</div>
                <div class="batch-item" onclick="batchMoveToZone(${zi},'document')" style="padding:4px 8px;font-size:11px;color:#e2e8f0;cursor:pointer;border-radius:3px;">📄 所有文档</div>
                <div class="batch-item" onclick="batchMoveToZone(${zi},'archive')" style="padding:4px 8px;font-size:11px;color:#e2e8f0;cursor:pointer;border-radius:3px;">📦 所有压缩包</div>
                <div class="batch-item" onclick="batchMoveToZone(${zi},'all')" style="padding:4px 8px;font-size:11px;color:#f59e0b;cursor:pointer;border-radius:3px;border-top:1px solid #334155;margin-top:2px;padding-top:6px;">⚡ 移入所有未分配</div>
              </div>
            </div>
            ${zone.items.length > 0 ? `<div style="position:relative;display:inline-block;">
              <button onclick="toggleBatchMenu(this)" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#e2e8f0;cursor:pointer;font-size:10px;padding:2px 6px;border-radius:4px;">一键移出 ▾</button>
              <div class="batch-menu" style="display:none;background:#1e293b;border:1px solid #334155;border-radius:6px;padding:4px;z-index:9999;min-width:120px;max-height:240px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.4);">
                <div class="batch-item" onclick="batchRemoveFromZone(${zi},'folder')" style="padding:4px 8px;font-size:11px;color:#e2e8f0;cursor:pointer;border-radius:3px;">📁 文件夹</div>
                <div class="batch-item" onclick="batchRemoveFromZone(${zi},'shortcut')" style="padding:4px 8px;font-size:11px;color:#e2e8f0;cursor:pointer;border-radius:3px;">🔗 快捷方式</div>
                <div class="batch-item" onclick="batchRemoveFromZone(${zi},'image')" style="padding:4px 8px;font-size:11px;color:#e2e8f0;cursor:pointer;border-radius:3px;">🖼️ 图片</div>
                <div class="batch-item" onclick="batchRemoveFromZone(${zi},'document')" style="padding:4px 8px;font-size:11px;color:#e2e8f0;cursor:pointer;border-radius:3px;">📄 文档</div>
                <div class="batch-item" onclick="batchRemoveFromZone(${zi},'archive')" style="padding:4px 8px;font-size:11px;color:#e2e8f0;cursor:pointer;border-radius:3px;">📦 压缩包</div>
                <div class="batch-item" onclick="batchRemoveFromZone(${zi},'all')" style="padding:4px 8px;font-size:11px;color:#ef4444;cursor:pointer;border-radius:3px;border-top:1px solid #334155;margin-top:2px;padding-top:6px;">⚡ 移出全部</div>
              </div>
            </div>` : ''}
            <button onclick="removeCustomZone(${zi})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px;padding:0 2px;">×</button>
          </div>
          <div style="padding:6px;display:flex;flex-wrap:wrap;gap:4px;min-height:40px;">
            ${itemsHtml || '<span style="color:#475569;font-size:10px;padding:4px;">拖入文件或使用批量移入</span>'}
          </div>
        </div>`;
      }).join('');
    }

    function renderCustomPreview() {
    }


    let customDragSource = null; // { zone: index or 'unassigned', name: fullName }

    function customDragStart(e) {
      customDragSource = { zone: 'unassigned', name: e.currentTarget.dataset.name };
      e.dataTransfer.effectAllowed = 'move';
      e.currentTarget.style.opacity = '0.4';
    }

    function customDragFromZone(e) {
      customDragSource = { zone: parseInt(e.currentTarget.dataset.zone), name: e.currentTarget.dataset.name };
      e.dataTransfer.effectAllowed = 'move';
      e.currentTarget.style.opacity = '0.4';
    }

    function customDragEnd(e) {
      e.currentTarget.style.opacity = '1';
      customDragSource = null;
    }

    function customDropToZone(e, targetZoneIdx) {
      e.preventDefault();
      if (!customDragSource) return;
      const { zone: srcZone, name } = customDragSource;

      // 找到并移除
      let item = null;
      if (srcZone === 'unassigned') {
        const idx = customUnassigned.findIndex(i => i.fullName === name);
        if (idx !== -1) item = customUnassigned.splice(idx, 1)[0];
      } else {
        const idx = customZones[srcZone].items.findIndex(i => i.fullName === name);
        if (idx !== -1) item = customZones[srcZone].items.splice(idx, 1)[0];
      }
      if (!item) return;

      customZones[targetZoneIdx].items.push(item);
      clearCustomSelectionForItems([item]);
      customDragSource = null;

      refreshCustomLayout();
    }

    // 从未分配列表拖到分区（通过分区 ondrop 处理）
    // 从分区拖回未分配列表（放到文件列表区域）
    document.addEventListener('DOMContentLoaded', () => {
      const fileList = document.getElementById('customFileList');
      if (fileList) {
        fileList.addEventListener('dragover', (e) => e.preventDefault());
        fileList.addEventListener('drop', (e) => {
          e.preventDefault();
          if (!customDragSource || customDragSource.zone === 'unassigned') return;
          const item = customZones[customDragSource.zone].items.splice(
            customZones[customDragSource.zone].items.findIndex(i => i.fullName === customDragSource.name), 1
          )[0];
          if (item) {
            customUnassigned.push(item);
            clearCustomSelectionForItems([item]);
          }
          customDragSource = null;
          refreshCustomLayout();
        });
      }
    });

    function addCustomZone() {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;';
      overlay.innerHTML = `
        <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;width:320px;">
          <div style="color:#f1f5f9;font-size:16px;font-weight:600;margin-bottom:16px;">新建分区</div>
          <input id="_zoneNameInput" type="text" placeholder="请输入分区名称" autofocus
            style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:10px 12px;color:#e2e8f0;font-size:14px;outline:none;font-family:inherit;">
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
            <button id="_zoneNameCancel" class="btn btn-ghost">取消</button>
            <button id="_zoneNameOk" class="btn btn-primary">确定</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const input = overlay.querySelector('#_zoneNameInput');
      input.focus();
      const close = () => overlay.remove();
      overlay.querySelector('#_zoneNameCancel').onclick = close;
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
      const confirm = () => {
        const name = input.value.trim();
        if (!name) return;
        customZones.push({ name, color: zoneColors[customZones.length % zoneColors.length], items: [] });
        renderCustomZones();
        renderCustomPreview();
        close();
      };
      overlay.querySelector('#_zoneNameOk').onclick = confirm;
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') close(); });
    }

    function removeCustomZone(idx) {
      // 把分区里的文件放回未分配
      const removed = customZones[idx].items;
      for (const item of removed) customUnassigned.push(item);
      customZones.splice(idx, 1);
      clearCustomSelectionForItems(removed);
      const nextSelected = {};
      for (const [key, selected] of Object.entries(customSelectedByZone)) {
        const zoneIdx = parseInt(key);
        if (zoneIdx < idx) nextSelected[zoneIdx] = selected;
        if (zoneIdx > idx) nextSelected[zoneIdx - 1] = selected;
      }
      customSelectedByZone = nextSelected;
      refreshCustomLayout();
    }

    function renameCustomZone(idx, newName) {
      const name = newName.trim();
      if (!name) {
        showToast('分区名不能为空');
        renderCustomZones();
        return;
      }
      customZones[idx].name = name;
      renderCustomZones();
      renderCustomPreview();
    }

    function toggleBatchMenu(btn) {
      const menu = btn.nextElementSibling;
      document.querySelectorAll('.batch-menu').forEach(m => { if (m !== menu) m.style.display = 'none'; });
      if (menu.style.display === 'none' || !menu.style.display) {
        // 用 fixed 定位，根据可用空间决定向上还是向下弹出
        const rect = btn.getBoundingClientRect();
        const menuH = 200;
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const openUp = spaceBelow < menuH && spaceAbove > spaceBelow;
        menu.style.display = 'block';
        menu.style.position = 'fixed';
        menu.style.left = rect.left + 'px';
        if (openUp) {
          menu.style.top = 'auto';
          menu.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
        } else {
          menu.style.top = rect.bottom + 4 + 'px';
          menu.style.bottom = 'auto';
        }
      } else {
        menu.style.display = 'none';
      }
      // 阻止菜单内滚轮冒泡到外层滚动容器
      if (!menu._wheelBound) {
        menu.addEventListener('wheel', (e) => e.stopPropagation());
        menu._wheelBound = true;
      }
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.batch-menu') && !e.target.closest('[onclick*="toggleBatchMenu"]')) {
        document.querySelectorAll('.batch-menu').forEach(m => m.style.display = 'none');
      }
    });

    // 滚动时关闭所有批量菜单
    document.getElementById('customZones').addEventListener('scroll', () => {
      document.querySelectorAll('.batch-menu').forEach(m => m.style.display = 'none');
    });

    function batchMoveToZone(zoneIdx, type) {
      document.querySelectorAll('.batch-menu').forEach(m => m.style.display = 'none');
      const extMap = {
        folder: (i) => i.isDirectory,
        shortcut: (i) => i.ext === '.lnk' || i.ext === '.url',
        image: (i) => ['.jpg','.jpeg','.png','.gif','.bmp','.webp','.ico'].includes(i.ext),
        document: (i) => ['.docx','.doc','.pdf','.xlsx','.xls','.pptx','.ppt','.txt','.md','.csv','.html'].includes(i.ext),
        archive: (i) => ['.zip','.rar','.7z','.tar','.gz'].includes(i.ext),
      };

      let moved;
      if (type === 'all') {
        moved = [...customUnassigned];
        customUnassigned = [];
        customZones[zoneIdx].items.push(...moved);
      } else {
        const filter = extMap[type];
        if (!filter) return;
        moved = customUnassigned.filter(filter);
        customUnassigned = customUnassigned.filter(i => !filter(i));
        customZones[zoneIdx].items.push(...moved);
      }

      clearCustomSelectionForItems(moved);
      refreshCustomLayout();
    }

    function batchRemoveFromZone(zoneIdx, type) {
      document.querySelectorAll('.batch-menu').forEach(m => m.style.display = 'none');
      const zone = customZones[zoneIdx];
      if (!zone || zone.items.length === 0) return;

      const extMap = {
        folder: (i) => i.isDirectory,
        shortcut: (i) => i.ext === '.lnk' || i.ext === '.url',
        image: (i) => ['.jpg','.jpeg','.png','.gif','.bmp','.webp','.ico'].includes(i.ext),
        document: (i) => ['.docx','.doc','.pdf','.xlsx','.xls','.pptx','.ppt','.txt','.md','.csv','.html'].includes(i.ext),
        archive: (i) => ['.zip','.rar','.7z','.tar','.gz'].includes(i.ext),
      };

      let removed;
      if (type === 'all') {
        removed = [...zone.items];
        zone.items = [];
      } else {
        const filter = extMap[type];
        if (!filter) return;
        removed = zone.items.filter(filter);
        zone.items = zone.items.filter(i => !filter(i));
      }

      if (removed.length === 0) {
        showToast('该分区中没有此类文件');
        return;
      }

      customUnassigned.push(...removed);
      clearCustomSelectionForItems(removed);
      showToast(`已从「${zone.name}」移出 ${removed.length} 个文件`);

      refreshCustomLayout();
    }

    function applyCustomLayout() {
      // 把自定义分区转换为 previewLayout 并打开预览，不关闭自定义界面
      // 网格尺寸与间距全部取自后端动态推断的真实桌面，避免写死 22×N
      const meta = getDesktopGridMeta(currentData);
      const cols = meta?.cols || 10;
      const rows = meta?.rows || 10;
      const spacingX = meta?.spacingX || 115;
      const spacingY = meta?.spacingY || 147;
      const entries = customZones
        .filter(z => z.items.length > 0)
        .map(z => [z.name, z.items]);

      previewLayout = buildBlockPreviewLayout(entries, cols, rows, 'vertical', { spacingX, spacingY }).layout;
      renderLayoutPreview();
      openPreview();
    }
