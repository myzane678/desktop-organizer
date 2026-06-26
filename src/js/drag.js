    // ========== 拖拽 ==========
    let dragAutoScrollFrame = null;
    let dragAutoScrollSpeed = 0;
    let customDragMoved = false;
    let customDragStartX = 0;
    let customDragStartY = 0;
    let customDragClientX = 0;
    let customDragClientY = 0;
    let customDragOverTarget = null;
    let customDragPointerId = null;
    const dragWheelOptions = { capture: true, passive: false };

    function dragAutoScrollTick() {
      if (!draggedItem || dragAutoScrollSpeed === 0) {
        dragAutoScrollFrame = null;
        return;
      }
      window.scrollBy(0, dragAutoScrollSpeed);
      dragAutoScrollFrame = requestAnimationFrame(dragAutoScrollTick);
    }

    function handleDragAutoScroll(e) {
      if (!draggedItem) return;
      const edge = 60;
      const maxSpeed = 22;
      let speed = 0;
      if (e.clientY < edge) {
        speed = -Math.ceil(maxSpeed * (1 - e.clientY / edge));
      } else if (e.clientY > window.innerHeight - edge) {
        speed = Math.ceil(maxSpeed * (1 - (window.innerHeight - e.clientY) / edge));
      }
      dragAutoScrollSpeed = speed;
      if (speed !== 0 && dragAutoScrollFrame === null) {
        dragAutoScrollFrame = requestAnimationFrame(dragAutoScrollTick);
      }
    }

    function stopDragAutoScroll() {
      dragAutoScrollSpeed = 0;
      if (dragAutoScrollFrame !== null) {
        cancelAnimationFrame(dragAutoScrollFrame);
        dragAutoScrollFrame = null;
      }
    }

    function addDragWheelListeners() {
      const container = document.getElementById('mainContent');
      window.addEventListener('wheel', handleDragWheel, dragWheelOptions);
      document.addEventListener('wheel', handleDragWheel, dragWheelOptions);
      container?.addEventListener('wheel', handleDragWheel, dragWheelOptions);
      window.addEventListener('mousewheel', handleDragWheel, dragWheelOptions);
      document.addEventListener('mousewheel', handleDragWheel, dragWheelOptions);
      container?.addEventListener('mousewheel', handleDragWheel, dragWheelOptions);
    }

    function removeDragWheelListeners() {
      const container = document.getElementById('mainContent');
      window.removeEventListener('wheel', handleDragWheel, dragWheelOptions);
      document.removeEventListener('wheel', handleDragWheel, dragWheelOptions);
      container?.removeEventListener('wheel', handleDragWheel, dragWheelOptions);
      window.removeEventListener('mousewheel', handleDragWheel, dragWheelOptions);
      document.removeEventListener('mousewheel', handleDragWheel, dragWheelOptions);
      container?.removeEventListener('mousewheel', handleDragWheel, dragWheelOptions);
    }

    function rememberCustomDragPoint(e) {
      customDragClientX = e.clientX;
      customDragClientY = e.clientY;
    }

    function getCustomDragTarget() {
      return document.elementFromPoint(customDragClientX, customDragClientY)?.closest('[data-drop-category], .category-card, .list-section');
    }

    function clearCustomDragTarget() {
      if (customDragOverTarget) {
        customDragOverTarget.classList.remove('drag-over');
        customDragOverTarget = null;
      }
    }

    function updateCustomDragTarget(e) {
      if (e) rememberCustomDragPoint(e);
      const target = getCustomDragTarget();
      if (target === customDragOverTarget) return;
      clearCustomDragTarget();
      customDragOverTarget = target;
      if (customDragOverTarget) customDragOverTarget.classList.add('drag-over');
    }

    function handleCustomDragMove(e) {
      if (!draggedItem) return;
      e.preventDefault();
      rememberCustomDragPoint(e);
      if (Math.abs(e.clientX - customDragStartX) > 3 || Math.abs(e.clientY - customDragStartY) > 3) {
        customDragMoved = true;
      }
      handleDragAutoScroll(e);
      updateCustomDragTarget(e);
    }

    function releaseCustomDragPointer(itemEl) {
      if (itemEl && customDragPointerId !== null && itemEl.hasPointerCapture?.(customDragPointerId)) {
        itemEl.releasePointerCapture(customDragPointerId);
      }
      customDragPointerId = null;
    }

    function cancelCustomDrag() {
      if (draggedItem) draggedItem.classList.remove('dragging');
      releaseCustomDragPointer(draggedItem);
      draggedItem = null;
      document.removeEventListener('pointermove', handleCustomDragMove, true);
      document.removeEventListener('pointerup', handleCustomDragEnd, true);
      window.removeEventListener('pointerup', handleCustomDragEnd, true);
      window.removeEventListener('pointercancel', cancelCustomDrag, true);
      window.removeEventListener('blur', cancelCustomDrag);
      document.removeEventListener('mouseleave', cancelCustomDrag);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('contextmenu', cancelCustomDrag, true);
      removeDragWheelListeners();
      stopDragAutoScroll();
      clearCustomDragTarget();
    }

    function handleVisibilityChange() {
      if (document.hidden) cancelCustomDrag();
    }

    async function handleCustomDragEnd(e) {
      const itemEl = draggedItem;
      if (!itemEl) return;
      itemEl.classList.remove('dragging');
      releaseCustomDragPointer(itemEl);
      const target = getCustomDragTarget() || customDragOverTarget;
      document.removeEventListener('pointermove', handleCustomDragMove, true);
      document.removeEventListener('pointerup', handleCustomDragEnd, true);
      window.removeEventListener('pointerup', handleCustomDragEnd, true);
      window.removeEventListener('pointercancel', cancelCustomDrag, true);
      window.removeEventListener('blur', cancelCustomDrag);
      document.removeEventListener('mouseleave', cancelCustomDrag);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('contextmenu', cancelCustomDrag, true);
      removeDragWheelListeners();
      stopDragAutoScroll();
      clearCustomDragTarget();
      draggedItem = null;
      if (!customDragMoved || !target) return;

      const targetCategory = target.dataset.dropCategory;
      const itemId = itemEl.dataset.id;
      const itemName = itemEl.dataset.name;
      const item = findItem(itemId);
      if (!targetCategory || item?.category === targetCategory) return;

      try {
        await window.organizer.setCategory(itemId, targetCategory, item);
        showToast(`已将「${itemName}」移至「${targetCategory}」`);
        await rescan();
      } catch (err) {
        showToast('移动失败: ' + err.message);
      }
    }

    function handleCustomDragStart(e) {
      if (e.button !== 0 || e.target.closest('.file-actions')) return;
      e.preventDefault();
      draggedItem = e.currentTarget;
      customDragPointerId = e.pointerId;
      draggedItem.setPointerCapture?.(customDragPointerId);
      customDragMoved = false;
      customDragStartX = e.clientX;
      customDragStartY = e.clientY;
      rememberCustomDragPoint(e);
      draggedItem.classList.add('dragging');
      document.addEventListener('pointermove', handleCustomDragMove, true);
      document.addEventListener('pointerup', handleCustomDragEnd, true);
      window.addEventListener('pointerup', handleCustomDragEnd, true);
      window.addEventListener('pointercancel', cancelCustomDrag, true);
      window.addEventListener('blur', cancelCustomDrag);
      document.addEventListener('mouseleave', cancelCustomDrag);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      document.addEventListener('contextmenu', cancelCustomDrag, true);
      addDragWheelListeners();
    }

    function handleDragWheel(e) {
      if (!draggedItem) return;
      e.preventDefault();
      e.stopPropagation();
      rememberCustomDragPoint(e);
      window.scrollBy(0, e.deltaY);
      updateCustomDragTarget(e);
    }

    function handleDragStart(e) {
      draggedItem = e.currentTarget;
      e.currentTarget.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      window.addEventListener('dragover', handleDragAutoScroll, true);
      addDragWheelListeners();
    }

    function handleDragEnd(e) {
      e.currentTarget.classList.remove('dragging');
      draggedItem = null;
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      window.removeEventListener('dragover', handleDragAutoScroll, true);
      removeDragWheelListeners();
      stopDragAutoScroll();
    }

    function handleDragOver(e) {
      e.preventDefault();
      e.currentTarget.classList.add('drag-over');
    }

    function handleDragLeave(e) {
      e.currentTarget.classList.remove('drag-over');
    }

    async function handleDrop(e, targetCategory) {
      e.preventDefault();
      e.currentTarget.classList.remove('drag-over');

      if (!draggedItem) return;

      const itemId = draggedItem.dataset.id;
      const itemName = draggedItem.dataset.name;
      const item = findItem(itemId);

      try {
        await window.organizer.setCategory(itemId, targetCategory, item);
        showToast(`已将「${itemName}」移至「${targetCategory}」`);
        await rescan();
      } catch (err) {
        showToast('移动失败: ' + err.message);
      }
    }

