    // ========== 右键菜单 ==========
    function showContextMenu(e, itemId, itemName) {
      e.preventDefault();

      const categories = getCategoryNames(currentData);
      const currentItem = findItem(itemId);
      const currentCat = currentItem?.category || '未分类';

      const menu = document.getElementById('contextMenu');
      menu.innerHTML = `
        <div class="context-menu-item" onclick="openItem('${escapeAttr(itemId)}')">📂 打开</div>
        <div class="context-menu-item" onclick="showInExplorer('${escapeAttr(itemId)}')">📁 打开所在文件夹</div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" style="color: #94a3b8; font-size: 11px; pointer-events: none;">移动到分类</div>
        ${categories.filter(c => c !== currentCat).map(cat => `
          <div class="context-submenu">
            <div class="context-menu-item" onclick="moveItem('${escapeAttr(itemId)}', '${escapeAttr(cat)}')">
              <span class="category-dot" style="background: ${categoryColors[cat] || '#64748b'}; width: 8px; height: 8px; border-radius: 50; display: inline-block;"></span>
              ${escapeHTML(cat)}
            </div>
          </div>
        `).join('')}
        ${currentCat !== '未分类' ? `
          <div class="context-menu-separator"></div>
          <div class="context-menu-item" onclick="resetCategory('${escapeAttr(itemId)}')">↩ 恢复自动分类</div>
        ` : ''}
      `;

      menu.style.left = e.clientX + 'px';
      menu.style.top = e.clientY + 'px';
      menu.classList.add('visible');

      // 防止菜单超出屏幕
      requestAnimationFrame(() => {
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
          menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
          menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
        }
      });
    }

    async function moveItem(itemId, category) {
      const item = findItem(itemId);
      try {
        await window.organizer.setCategory(itemId, category, item);
        showToast(`已将「${item?.name || itemId}」移至「${category}」`);
        await rescan();
      } catch (err) {
        showToast('移动失败: ' + err.message);
      }
    }

    async function resetCategory(itemId) {
      const item = findItem(itemId);
      try {
        await window.organizer.removeCategory(itemId);
        showToast(`已恢复「${item?.name || itemId}」的自动分类`);
        await rescan();
      } catch (err) {
        showToast('重置失败: ' + err.message);
      }
    }

