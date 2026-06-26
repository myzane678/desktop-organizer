    // ========== 工具函数 ==========
    function findItem(id) {
      for (const [, items] of getCategoryEntries(currentData)) {
        const found = items.find(i => i.id === id);
        if (found) return found;
      }
      return null;
    }

    function escapeHTML(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    // HTML 属性安全：只转义引号。data-* 和普通属性用这个，反斜杠保持字面量
    function escapeHTMLAttr(str) {
      return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // HTML 属性内嵌入的 JS 字符串字面量安全：先转 JS 转义（\ ' "），再交给 HTML 属性
    // 只用于残留的 inline handler，例如 onclick="fn('xxx')"
    function escapeJSString(str) {
      return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }

    // 旧名兼容：之前同时被两种场景用。保留指向 JS 字符串版本，避免漏改的 inline handler 出问题
    const escapeAttr = escapeJSString;

    function promptText(title, placeholder = '', defaultValue = '') {
      return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
          <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;width:360px;">
            <div style="color:#f1f5f9;font-size:16px;font-weight:600;margin-bottom:16px;">${escapeHTML(title)}</div>
            <input id="_promptTextInput" type="text" placeholder="${escapeAttr(placeholder)}" value="${escapeAttr(defaultValue)}" autofocus
              style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:10px 12px;color:#e2e8f0;font-size:14px;outline:none;font-family:inherit;">
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
              <button id="_promptTextCancel" class="btn btn-ghost">取消</button>
              <button id="_promptTextOk" class="btn btn-primary">确定</button>
            </div>
          </div>`;
        document.body.appendChild(overlay);
        const input = overlay.querySelector('#_promptTextInput');
        const close = (value) => { overlay.remove(); resolve(value); };
        input.focus();
        input.select();
        overlay.querySelector('#_promptTextCancel').onclick = () => close(null);
        overlay.querySelector('#_promptTextOk').onclick = () => close(input.value);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') close(input.value);
          if (e.key === 'Escape') close(null);
        });
      });
    }

    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2500);
    }

