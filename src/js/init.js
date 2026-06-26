    // ========== 初始化 ==========
    document.addEventListener('DOMContentLoaded', () => {
      bootstrapApp();

      // 搜索
      document.getElementById('searchInput').addEventListener('input', (e) => {
        renderAll(currentData, e.target.value.trim());
      });

      // 关闭右键菜单
      document.addEventListener('click', () => {
        document.getElementById('contextMenu').classList.remove('visible');
      });

      // 监听托盘触发的重新扫描
      if (window.organizer?.onTriggerRescan) {
        window.organizer.onTriggerRescan(() => rescan());
      }
    });

    async function bootstrapApp() {
      try {
        const status = await window.organizer.getConsentStatus();
        consentAccepted = !!status.accepted;
        if (consentAccepted) {
          // 检查网格是否已校准
          const gridStatus = await window.organizer.getGridConfigStatus();
          if (!gridStatus.calibrated) {
            showGridCalibrationOverlay();
            return; // 等待用户校准完成后再继续
          }
          await loadOnboardingStatus();
          await rescan({ maybeShowOnboarding: true });
        } else {
          showConsentOverlay();
        }
      } catch (err) {
        showConsentOverlay();
      }
    }

    function showConsentOverlay() {
      document.getElementById('consentOverlay').classList.add('visible');
    }

    function hideConsentOverlay() {
      document.getElementById('consentOverlay').classList.remove('visible');
    }

    function updateConsentButton() {
      document.getElementById('acceptConsentBtn').disabled = !document.getElementById('consentCheckbox').checked;
    }

    async function acceptConsentAndStart() {
      const btn = document.getElementById('acceptConsentBtn');
      btn.disabled = true;
      btn.textContent = '正在启动...';
      try {
        await window.organizer.acceptConsent();
        consentAccepted = true;
        hideConsentOverlay();
        // 同意后检查网格校准
        const gridStatus = await window.organizer.getGridConfigStatus();
        if (!gridStatus.calibrated) {
          showGridCalibrationOverlay();
          return;
        }
        await loadOnboardingStatus();
        await rescan({ maybeShowOnboarding: true });
      } catch (err) {
        showToast('保存同意记录失败: ' + err.message);
        btn.disabled = false;
        btn.textContent = '同意并开始使用';
      }
    }

    function showGridCalibrationOverlay() {
      document.getElementById('gridCalibrationOverlay').classList.add('visible');
    }

    function hideGridCalibrationOverlay() {
      document.getElementById('gridCalibrationOverlay').classList.remove('visible');
    }

    function autoDetectGrid() {
      // 用当前 _desktopGrid 的推断值作为参考
      const meta = getDesktopGridMeta(currentData);
      if (meta) {
        document.getElementById('gridColsInput').value = meta.cols;
        document.getElementById('gridRowsInput').value = meta.rows;
        showToast('已填入自动检测值，请核对后确认');
      } else {
        showToast('无法自动检测，请手动输入');
      }
    }

    async function saveGridCalibration() {
      const cols = Number(document.getElementById('gridColsInput').value);
      const rows = Number(document.getElementById('gridRowsInput').value);
      if (!Number.isFinite(cols) || cols < 1 || cols > 50) {
        showToast('列数必须在 1-50 之间');
        return;
      }
      if (!Number.isFinite(rows) || rows < 1 || rows > 50) {
        showToast('行数必须在 1-50 之间');
        return;
      }
      try {
        await window.organizer.saveGridConfig({ cols, rows });
        showToast(`已保存网格配置：${cols} 列 × ${rows} 行`);
        hideGridCalibrationOverlay();

        // 等待弹窗完全关闭后再开始扫描（避免重叠）
        await new Promise(resolve => setTimeout(resolve, 300));

        await loadOnboardingStatus();
        // 校准后扫描，然后根据新手教程状态决定是否弹出
        await rescan({ maybeShowOnboarding: true });
      } catch (err) {
        showToast('保存网格配置失败: ' + err.message);
      }
    }

    async function loadOnboardingStatus() {
      const status = await window.organizer.getOnboardingStatus();
      onboardingCompleted = !!status.completed;
    }

    function showOnboardingChoice() {
      document.getElementById('onboardingChoiceOverlay').classList.add('visible');
    }

    function hideOnboardingChoice() {
      document.getElementById('onboardingChoiceOverlay').classList.remove('visible');
    }

    async function maybeShowOnboardingChoice() {
      if (onboardingCompleted || onboardingPromptShown) return;
      onboardingPromptShown = true;
      showOnboardingChoice();
    }

    async function skipOnboardingChoice() {
      await window.organizer.completeOnboarding({ skipped: true });
      onboardingCompleted = true;
      hideOnboardingChoice();
      showToast('已跳过新手教程，可在帮助中重新查看');
    }

    function startOnboardingTutorial(options = {}) {
      tutorialManualMode = !!options.manual;
      hideOnboardingChoice();
      tutorialStepIndex = 0;
      document.getElementById('tutorialBackdrop').classList.add('visible');
      renderTutorialStep();
    }

    function getTutorialTarget(step) {
      if (step.view && currentView !== step.view) switchView(step.view);
      return document.querySelector(step.selector) || document.querySelector('.main-content') || document.body;
    }

    function renderTutorialStep() {
      const step = tutorialSteps[tutorialStepIndex];
      const target = getTutorialTarget(step);
      const rect = target.getBoundingClientRect();
      const margin = 8;
      const spotlight = document.getElementById('tutorialSpotlight');
      spotlight.style.left = Math.max(8, rect.left - margin) + 'px';
      spotlight.style.top = Math.max(8, rect.top - margin) + 'px';
      spotlight.style.width = Math.min(window.innerWidth - 16, rect.width + margin * 2) + 'px';
      spotlight.style.height = Math.min(window.innerHeight - 16, rect.height + margin * 2) + 'px';

      const card = document.getElementById('tutorialCard');
      const cardW = 360;
      const left = rect.right + 18 + cardW < window.innerWidth ? rect.right + 18 : Math.max(16, window.innerWidth - cardW - 16);
      const top = rect.top + 220 < window.innerHeight ? rect.top : Math.max(16, window.innerHeight - 240);
      card.style.left = left + 'px';
      card.style.top = top + 'px';

      document.getElementById('tutorialTitle').textContent = step.title;
      document.getElementById('tutorialText').textContent = step.text;
      document.getElementById('tutorialProgress').textContent = `${tutorialStepIndex + 1} / ${tutorialSteps.length}`;
      document.getElementById('tutorialPrevBtn').disabled = tutorialStepIndex === 0;
      document.getElementById('tutorialNextBtn').textContent = tutorialStepIndex === tutorialSteps.length - 1 ? '完成' : '下一步';
    }

    function prevTutorialStep() {
      if (tutorialStepIndex > 0) {
        tutorialStepIndex--;
        renderTutorialStep();
      }
    }

    async function nextTutorialStep() {
      if (tutorialStepIndex < tutorialSteps.length - 1) {
        tutorialStepIndex++;
        renderTutorialStep();
        return;
      }
      await finishTutorial(false);
    }

    async function skipTutorial() {
      await finishTutorial(true);
    }

    async function finishTutorial(skipped) {
      document.getElementById('tutorialBackdrop').classList.remove('visible');
      if (!tutorialManualMode) {
        await window.organizer.completeOnboarding({ skipped });
        onboardingCompleted = true;
      }
      showToast(skipped ? '已跳过新手教程' : '新手教程已完成，可在帮助中重新查看');
    }

    window.addEventListener('resize', () => {
      if (document.getElementById('tutorialBackdrop').classList.contains('visible')) renderTutorialStep();
    });

