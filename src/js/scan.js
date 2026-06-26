    // ========== 扫描桌面 ==========
    async function rescan(options = {}) {
      if (!consentAccepted) {
        showConsentOverlay();
        return;
      }

      const loading = document.getElementById('loadingState');
      const grid = document.getElementById('gridView');
      const list = document.getElementById('listView');

      loading.style.display = 'block';
      grid.style.display = 'none';
      list.style.display = 'none';

      try {
        currentData = await window.organizer.scanDesktop();
        const total = countCategoryItems(currentData);
        document.getElementById('statsText').textContent = `共 ${total} 项`;

        renderAll(currentData);
      } catch (err) {
        console.error('扫描失败:', err);
        showToast('扫描桌面失败: ' + err.message);
      }

      loading.style.display = 'none';
      updateViewVisibility();

      // 扫描完成并且 UI 更新后，再决定是否显示新手教程
      if (options.maybeShowOnboarding) {
        setTimeout(() => maybeShowOnboardingChoice(), 100);
      }
    }

