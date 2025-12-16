// --- MODULE: WINDOW_MANAGER ---
    const WindowManager = {
        zIndex: 100,
        windows: new Map(), 
        getSavedState: function(id) { try { const states = JSON.parse(localStorage.getItem(WIN_STATE_KEY)||'{}'); return states[id]; } catch { return null; } },
        saveState: function(id, rect) { try { const states = JSON.parse(localStorage.getItem(WIN_STATE_KEY)||'{}'); states[id] = rect; localStorage.setItem(WIN_STATE_KEY, JSON.stringify(states)); } catch {} },
        openApp: function(app) {
            if(this.windows.has(app.id)) { this.focusWindow(app.id); return; }
            const win = document.createElement('div');
            win.className = 'os-window pointer-events-auto flex flex-col';
            const saved = this.getSavedState(app.id);
            if(saved) { win.style.width = saved.w; win.style.height = saved.h; win.style.left = saved.x; win.style.top = saved.y; } else { win.style.width = '400px'; win.style.height = '600px'; win.style.left = (100 + (this.windows.size * 30)) + 'px'; win.style.top = (50 + (this.windows.size * 30)) + 'px'; }
            win.style.zIndex = ++this.zIndex; win.dataset.id = app.id;
            const header = document.createElement('div'); header.className = 'window-header';
            header.innerHTML = `<div class="flex gap-2"><button class="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 text-[8px] flex items-center justify-center text-black opacity-60 hover:opacity-100" onclick="WindowManager.closeWindow('${app.id}')">✕</button><button class="w-3 h-3 rounded-full bg-yellow-500" onclick="WindowManager.minimize('${app.id}')"></button><button class="w-3 h-3 rounded-full bg-green-500" onclick="WindowManager.maximize('${app.id}')"></button></div><div class="flex items-center gap-2">${renderIconHtml(app.iconUrl, "text-sm")}<div class="text-xs font-medium text-gray-300 truncate max-w-[200px]">${esc(app.name)}</div></div><div class="w-10"></div>`;
            const content = document.createElement('div'); content.className = 'window-content';
            let src = app.url;
            if(app.type === 'html') { const blob = new Blob([app.html], {type: 'text/html'}); src = URL.createObjectURL(blob); }
            content.innerHTML = `<iframe src="${src}" class="window-iframe" sandbox="allow-scripts allow-modals allow-same-origin allow-forms"></iframe>`;
            const resizeHandle = document.createElement('div'); resizeHandle.className = 'window-resize-handle';
            const overlay = document.createElement('div'); overlay.className = 'absolute inset-0 bg-transparent hidden';
            content.appendChild(overlay);
            win.appendChild(header); win.appendChild(content); win.appendChild(resizeHandle);
            $('windows-area').appendChild(win);
            this.windows.set(app.id, win);
            this.makeDraggable(win, header, overlay); this.makeResizable(win, resizeHandle, overlay);
            this.addToDock(app);
        },
        closeWindow: function(id) {
            const win = this.windows.get(id);
            if(win) { win.style.opacity = '0'; win.style.transform = 'scale(0.9)'; setTimeout(() => win.remove(), 200); this.windows.delete(id); this.removeFromDock(id); }
        },
        focusWindow: function(id) {
            const win = this.windows.get(id);
            if(win) { win.style.zIndex = ++this.zIndex; win.classList.remove('minimized'); win.querySelector('.window-content > div.absolute').classList.add('hidden'); }
        },
        minimize: function(id) { const win = this.windows.get(id); if(win) win.classList.add('minimized'); },
        minimizeAll: function() { this.windows.forEach(win => win.classList.add('minimized')); $('settings-app').classList.add('hidden'); $('appLauncher').classList.add('hidden'); closeApp('editor'); },
        maximize: function(id) {
            const win = this.windows.get(id);
            if(win.classList.contains('maximized')) {
                win.classList.remove('maximized'); win.style.width = win.dataset.prevW || '400px'; win.style.height = win.dataset.prevH || '600px'; win.style.left = win.dataset.prevL || '100px'; win.style.top = win.dataset.prevT || '100px'; win.style.borderRadius = '12px';
            } else {
                win.dataset.prevW = win.style.width; win.dataset.prevH = win.style.height; win.dataset.prevL = win.style.left; win.dataset.prevT = win.style.top;
                win.classList.add('maximized'); win.style.width = '100%'; win.style.height = '100%'; win.style.top = '0'; win.style.left = '0';
            }
            this.focusWindow(id);
        },
        makeDraggable: function(win, handle, overlay) {
            let isDragging = false, startX, startY, initLeft, initTop;
            const start = (cx, cy) => { if(win.classList.contains('maximized')) return; isDragging = true; this.focusWindow(win.dataset.id); overlay.classList.remove('hidden'); startX = cx; startY = cy; initLeft = win.offsetLeft; initTop = win.offsetTop; };
            const move = (cx, cy) => { if(!isDragging) return; win.style.left = `${initLeft + cx - startX}px`; win.style.top = `${initTop + cy - startY}px`; };
            const end = () => { if(isDragging) this.saveState(win.dataset.id, {x: win.style.left, y: win.style.top, w: win.style.width, h: win.style.height}); isDragging = false; overlay.classList.add('hidden'); };
            handle.addEventListener('mousedown', e => { start(e.clientX, e.clientY); document.addEventListener('mousemove', onMM); document.addEventListener('mouseup', onMU); });
            const onMM = e => move(e.clientX, e.clientY);
            const onMU = () => { end(); document.removeEventListener('mousemove', onMM); document.removeEventListener('mouseup', onMU); };
            handle.addEventListener('touchstart', e => { start(e.touches[0].clientX, e.touches[0].clientY); }, {passive: false});
            handle.addEventListener('touchmove', e => { e.preventDefault(); move(e.touches[0].clientX, e.touches[0].clientY); }, {passive: false});
            handle.addEventListener('touchend', end);
        },
        makeResizable: function(win, handle, overlay) {
            let isResizing = false, startX, startY, initW, initH;
            const start = (cx, cy) => { if(win.classList.contains('maximized')) return; isResizing = true; this.focusWindow(win.dataset.id); overlay.classList.remove('hidden'); startX = cx; startY = cy; initW = parseInt(win.style.width); initH = parseInt(win.style.height); };
            const move = (cx, cy) => { if(!isResizing) return; win.style.width = `${Math.max(300, initW + cx - startX)}px`; win.style.height = `${Math.max(200, initH + cy - startY)}px`; };
            const end = () => { if(isResizing) this.saveState(win.dataset.id, {x: win.style.left, y: win.style.top, w: win.style.width, h: win.style.height}); isResizing = false; overlay.classList.add('hidden'); };
            handle.addEventListener('mousedown', e => { e.stopPropagation(); start(e.clientX, e.clientY); document.addEventListener('mousemove', onMM); document.addEventListener('mouseup', onMU); });
            const onMM = e => move(e.clientX, e.clientY);
            const onMU = () => { end(); document.removeEventListener('mousemove', onMM); document.removeEventListener('mouseup', onMU); };
            handle.addEventListener('touchstart', e => { e.stopPropagation(); start(e.touches[0].clientX, e.touches[0].clientY); }, {passive: false});
            handle.addEventListener('touchmove', e => { e.preventDefault(); move(e.touches[0].clientX, e.touches[0].clientY); }, {passive: false});
            handle.addEventListener('touchend', end);
        },
        addToDock: function(app) {
            if($(`dock-icon-${app.id}`)) return;
            const btn = document.createElement('button'); btn.id = `dock-icon-${app.id}`; btn.className = 'w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center hover:bg-gray-700 transition relative group border border-gray-700 overflow-hidden';
            btn.innerHTML = `<div class="text-white flex items-center justify-center w-full h-full">${renderIconHtml(app.iconUrl, "text-xl")}</div><div class="absolute -bottom-1 w-1 h-1 bg-white rounded-full"></div>`;
            btn.onclick = () => { const win = this.windows.get(app.id); if(win && win.classList.contains('minimized')) this.focusWindow(app.id); else if(win && parseInt(win.style.zIndex) === this.zIndex) this.minimize(app.id); else this.focusWindow(app.id); };
            $('dock-apps').appendChild(btn);
        },
        removeFromDock: function(id) { const el = $(`dock-icon-${id}`); if(el) el.remove(); },
        toggleLauncher: function() { const l = $('appLauncher'); l.classList.toggle('hidden'); if(!l.classList.contains('hidden')) renderFinder(); }
    };

    