    // ========== 视图切换 ==========
    function switchView(view) {
      currentView = view;
      document.querySelectorAll('.view-toggle .btn').forEach(b => {
        b.classList.toggle('active', b.dataset.view === view);
      });
      updateViewVisibility();
    }

    function updateViewVisibility() {
      const grid = document.getElementById('gridView');
      const list = document.getElementById('listView');
      const desktop = document.getElementById('desktopView');
      grid.style.display = currentView === 'grid' ? 'grid' : 'none';
      list.className = currentView === 'list' ? 'list-view active' : 'list-view';
      desktop.style.display = currentView === 'desktop' ? 'flex' : 'none';
    }

