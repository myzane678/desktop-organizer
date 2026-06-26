    // ========== 操作 ==========
    async function openItem(itemId) {
      try {
        await window.organizer.openFile(itemId);
      } catch (err) {
        showToast('打开失败: ' + err.message);
      }
    }

    async function showInExplorer(itemId) {
      try {
        await window.organizer.showInExplorer(itemId);
      } catch (err) {
        showToast('定位失败: ' + err.message);
      }
    }

