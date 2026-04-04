/**
 * 🏥 HIS Shared — UI Components
 * Toast, panel draggable, tab system — dùng chung cho mọi extension
 * 
 * Cách dùng:
 *   HIS.UI.showToast('Thành công!', 'success');
 *   HIS.UI.makeDraggable(panelEl, headerEl);
 */

window.HIS = window.HIS || {};

HIS.UI = {

    /**
     * Hiển thị toast notification
     * @param {string} message
     * @param {'success'|'error'|'warning'|'info'} [type='info']
     * @param {number} [duration=3000]
     */
    showToast(message, type = 'info', duration = 3000) {
        const prefix = HIS.APP_PREFIX || 'his';
        let container = document.getElementById(`${prefix}-toast-container`);

        if (!container) {
            container = document.createElement('div');
            container.id = `${prefix}-toast-container`;
            container.style.cssText = `
                position: fixed; bottom: 20px; right: 20px;
                z-index: ${HIS.Z_INDEX?.TOAST || 9600};
                display: flex; flex-direction: column; gap: 8px;
                pointer-events: none;
            `;
            document.body.appendChild(container);
        }

        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };

        const toast = document.createElement('div');
        toast.className = `${prefix}-toast ${prefix}-toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            padding: 10px 16px; border-radius: 8px;
            font-size: 13px; font-weight: 500;
            color: white; pointer-events: auto;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            background: ${colors[type] || colors.info};
            opacity: 0; transform: translateY(10px);
            transition: all 0.3s ease;
        `;
        container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        // Animate out
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    /**
     * Làm panel có thể kéo thả (drag)
     * @param {HTMLElement} panel - Panel element
     * @param {HTMLElement} handle - Phần header để kéo
     */
    makeDraggable(panel, handle) {
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        handle.addEventListener('mousedown', function (e) {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            panel.style.transition = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', function (e) {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            panel.style.left = (initialLeft + dx) + 'px';
            panel.style.top = (initialTop + dy) + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', function () {
            if (isDragging) {
                isDragging = false;
                panel.style.transition = '';
            }
        });
    },

    /**
     * Setup tab system cho panel
     * @param {HTMLElement} tabBar - Container chứa các tab buttons
     * @param {Function} [onSwitch] - Callback khi switch tab (tabId)
     */
    setupTabs(tabBar, onSwitch) {
        if (!tabBar) return;

        const prefix = HIS.APP_PREFIX || 'his';

        tabBar.querySelectorAll(`.${prefix}-tab`).forEach(tab => {
            tab.addEventListener('click', function () {
                const tabId = this.getAttribute('data-tab');

                // Update tab buttons
                tabBar.querySelectorAll(`.${prefix}-tab`).forEach(t => {
                    t.classList.toggle(`${prefix}-tab-active`, t === tab);
                });

                // Update content panels
                const parent = tabBar.closest(`.${prefix}-panel, .${prefix}-panel-body`) || document;
                parent.querySelectorAll(`.${prefix}-tab-content`).forEach(content => {
                    content.classList.toggle(`${prefix}-tab-content-active`,
                        content.id === `${prefix}-tab-content-${tabId}`);
                });

                if (onSwitch) onSwitch(tabId);
            });
        });
    },

    /**
     * Toggle minimize/expand cho panel
     * @param {HTMLElement} panel
     * @param {HTMLElement} body - Panel body element
     * @param {HTMLElement} btn - Minimize button
     * @param {boolean} isMinimized - Current state
     * @returns {boolean} New state
     */
    toggleMinimize(panel, body, btn, isMinimized) {
        const newState = !isMinimized;
        const prefix = HIS.APP_PREFIX || 'his';

        if (body) body.style.display = newState ? 'none' : 'block';
        if (btn) btn.textContent = newState ? '＋' : '—';
        if (panel) panel.classList.toggle(`${prefix}-minimized`, newState);

        return newState;
    }
};

console.log('[HIS] 🏥 Shared UI components loaded');
