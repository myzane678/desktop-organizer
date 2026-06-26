    // ========== 渲染 ==========
    function renderAll(data, filter = '') {
      const filteredData = {};
      const desktopGridMeta = getDesktopGridMeta(data);
      if (desktopGridMeta) filteredData._desktopGrid = desktopGridMeta;
      for (const [category, items] of getCategoryEntries(data)) {
        const filtered = filter
          ? items.filter(i => i.name.toLowerCase().includes(filter.toLowerCase()) || i.fullName.toLowerCase().includes(filter.toLowerCase()))
          : items;
        if (filtered.length > 0) {
          filteredData[category] = filtered;
        }
      }

      renderGridView(filteredData);
      renderListView(filteredData);
      renderDesktopView(filteredData);
    }

    function renderGridView(data) {
      const container = document.getElementById('gridView');
      container.innerHTML = '';

      if (getCategoryEntries(data).length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="icon">📂</div><p>没有找到文件</p></div>';
        return;
      }

      for (const [category, items] of getCategoryEntries(data)) {
        const color = categoryColors[category] || '#64748b';

        const card = document.createElement('div');
        card.className = 'category-card';
        card.dataset.category = category;
        card.dataset.dropCategory = category;

        card.innerHTML = `
          <div class="category-header"
               data-drop-category="${escapeAttr(category)}"
               ondragover="handleDragOver(event)"
               ondrop="handleDrop(event, '${category}')"
               ondragleave="handleDragLeave(event)">
            <div class="category-title">
              <div class="category-dot" style="background: ${color}"></div>
              <span class="category-name">${category}</span>
            </div>
            <span class="category-count">${items.length}</span>
          </div>
          <div class="category-items">
            ${items.map(item => renderItemHTML(item)).join('')}
          </div>
        `;

        container.appendChild(card);
      }

      bindItemEvents();
    }

    function renderListView(data) {
      const container = document.getElementById('listView');
      container.innerHTML = '';

      for (const [category, items] of getCategoryEntries(data)) {
        const color = categoryColors[category] || '#64748b';

        const section = document.createElement('div');
        section.className = 'list-section';
        section.dataset.dropCategory = category;

        section.innerHTML = `
          <div class="list-section-header"
               data-drop-category="${escapeAttr(category)}"
               ondragover="handleDragOver(event)"
               ondrop="handleDrop(event, '${category}')"
               ondragleave="handleDragLeave(event)">
            <div class="category-dot" style="background: ${color}"></div>
            <span class="category-name">${category}</span>
            <span class="category-count">${items.length}</span>
          </div>
          <div class="list-section-items">
            ${items.map(item => renderItemHTML(item)).join('')}
          </div>
        `;

        container.appendChild(section);
      }

      bindItemEvents();
    }

    function renderDesktopView(data) {
      const container = document.getElementById('desktopView');
      container.innerHTML = '';

      const allItems = [];
      const unlocated = [];
      for (const [category, items] of getCategoryEntries(data)) {
        for (const item of items) {
          if (item.hasPosition && item.gridX != null && item.gridY != null) {
            allItems.push({ ...item, category });
          } else {
            unlocated.push({ ...item, category });
          }
        }
      }

      if (allItems.length === 0 && unlocated.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="icon">📂</div><p>没有找到文件</p></div>';
        return;
      }

      // 用 gridX/gridY 网格方式渲染（和预览一致）
      const desktopGrid = getDesktopGridMeta(data);
      const cols = desktopGrid?.cols || 15;
      const rows = desktopGrid?.rows || 10;

      // 图例
      const usedCategories = [...new Set(allItems.map(i => i.category))];
      const legend = document.createElement('div');
      legend.className = 'desktop-legend';
      legend.innerHTML = usedCategories.map(cat => {
        const color = categoryColors[cat] || '#64748b';
        return `<div class="desktop-legend-item"><div class="desktop-legend-dot" style="background:${color}"></div>${escapeHTML(cat)}</div>`;
      }).join('');
      container.appendChild(legend);

      // 构建网格单元格映射
      const cellMap = {};
      for (const item of allItems) {
        const c = Math.max(0, Math.min(cols - 1, Number.isInteger(item.gridX) ? item.gridX : 0));
        const r = Math.max(0, Math.min(rows - 1, Number.isInteger(item.gridY) ? item.gridY : 0));
        const key = `${r},${c}`;
        if (!cellMap[key]) cellMap[key] = [];
        cellMap[key].push(item);
      }

      // CSS Grid容器（和预览视觉参数一致）
      const grid = document.createElement('div');
      grid.style.cssText = `display:grid;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},minmax(70px,1fr));gap:3px;background:#1a2332;border:1px solid #334155;border-radius:8px;padding:8px;width:100%;max-height:calc(100vh - 200px);overflow:auto;`;

      // 渲染网格单元格
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = document.createElement('div');
          cell.style.cssText = 'background:#0f172a;border-radius:4px;display:flex;align-items:center;justify-content:center;min-height:0;overflow:hidden;';

          const items = cellMap[`${r},${c}`];
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

            cell.innerHTML = `<div style="position:relative;width:96%;height:90%;border-radius:4px;background:${color}20;border:1px solid ${color}40;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;transition:transform .15s;"
              title="${escapeAttr(item.fullName)}\n分类: ${item.category}"
              data-id="${escapeAttr(item.id)}"
              draggable="true"
              ondragstart="handleDragStart(event)"
              ondragend="handleDragEnd(event)"
              oncontextmenu="showContextMenu(event, '${escapeAttr(item.id)}', '${escapeAttr(item.name)}')"
              ondblclick="openItem('${escapeAttr(item.id)}')"
              onmouseenter="this.style.transform='scale(1.12)'"
              onmouseleave="this.style.transform=''">
              ${extraBadge}
              ${iconImg}
              <span style="font-size:13px;color:#cbd5e1;text-align:center;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:94%;">${escapeHTML(name)}</span>
            </div>`;
            if (items.length > 1) cell.title = items.map(i => i.name).join('\n');
          }

          grid.appendChild(cell);
        }
      }
      container.appendChild(grid);

      // 未定位区域
      if (unlocated.length > 0) {
        const unlocEl = document.createElement('div');
        unlocEl.className = 'desktop-unlocated';
        unlocEl.innerHTML = `<div class="desktop-unlocated-header"><span>📌</span><span>未定位 (${unlocated.length})</span></div>
          <div class="desktop-unlocated-items">${unlocated.map(item => {
            const color = categoryColors[item.category] || '#64748b';
            return `<div class="desktop-unlocated-item" data-id="${escapeAttr(item.id)}"
              oncontextmenu="showContextMenu(event, '${escapeAttr(item.id)}', '${escapeAttr(item.name)}')"
              title="${escapeAttr(item.fullName)}"
              ondblclick="openItem('${escapeAttr(item.id)}')">
              <div style="width:8px;height:8px;border-radius:2px;background:${color};flex-shrink:0;"></div>${escapeHTML(item.name)}</div>`;
          }).join('')}</div>`;
        container.appendChild(unlocEl);
      }
    }

    function renderItemHTML(item) {
      const iconSrc = item.icon
        ? `<img src="${item.icon}" alt="">`
        : `<span class="ext-label">${item.isDirectory ? '📁' : (item.ext || '.?')}</span>`;

      const meta = item.isShortcut
        ? `快捷方式 → ${item.shortcutInfo?.target || '未知'}`
        : item.isDirectory
          ? '文件夹'
          : item.ext ? item.ext.toUpperCase() + ' 文件' : '文件';

      return `
        <div class="file-item"
             data-id="${escapeAttr(item.id)}"
             data-name="${escapeAttr(item.name)}"
             onpointerdown="handleCustomDragStart(event)"
             oncontextmenu="showContextMenu(event, '${escapeAttr(item.id)}', '${escapeAttr(item.name)}')">
          <div class="file-icon">${iconSrc}</div>
          <div class="file-info">
            <div class="file-name" title="${escapeAttr(item.fullName)}">${escapeHTML(item.name)}</div>
            <div class="file-meta">${escapeHTML(meta)}</div>
          </div>
          <div class="file-actions">
            <button class="btn btn-ghost" onclick="event.stopPropagation(); openItem('${escapeAttr(item.id)}')">打开</button>
            <button class="btn btn-ghost" onclick="event.stopPropagation(); showInExplorer('${escapeAttr(item.id)}')">定位</button>
          </div>
        </div>
      `;
    }

    function bindItemEvents() {
      // 双击打开
      document.querySelectorAll('.file-item').forEach(el => {
        el.addEventListener('dblclick', () => {
          openItem(el.dataset.id);
        });
      });
    }

