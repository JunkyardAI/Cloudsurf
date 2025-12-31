// --- MODULE: WINDOW MANAGER (v7.1 - Launch Guard & Strict Mode) ---

const WIN_STATE_KEY = 'cloudstax_win_state';

window.WindowManager = {
    zIndex: 100,
    windows: new Map(), 
    activeDrag: null,
    dragOffset: { x: 0, y: 0 },

    init: function() {
        window.addEventListener('mousemove', (e) => this.onDrag(e));
        window.addEventListener('mouseup', () => this.stopDrag());
        window.addEventListener('resize', () => this.recenterWindows());
        window.addEventListener('message', (e) => this.handleMessage(e));

        // CLEANUP: Remove legacy HTML overlay to prevent ID conflicts
        const legacyLauncher = document.getElementById('appLauncher');
        if(legacyLauncher) legacyLauncher.remove();
    },

    // --- Window Spawning ---

    openApp: async function(app) {
        if (!app || !app.id) return;

        // [RULE] Launch Guard: Block user apps in Edit Mode
        if (window.systemMode === 'edit') {
            const isEditor = app.id === 'editor' || app.type === 'editor';
            if (!isEditor) {
                if(window.Editor) {
                    window.Editor.open(app.id);
                    if(window.notify) window.notify(`Opened "${app.name}" in Code Studio`);
                } else {
                     console.warn("Editor module not loaded");
                }
                return; // STOP: Block launch
            }
        }

        // [RULE] Modal Hierarchy Check
        if (window.isModalOpen && window.isModalOpen()) {
            const modal = document.querySelector('.active-modal');
            if (modal) {
                modal.classList.add('animate-shake');
                setTimeout(() => modal.classList.remove('animate-shake'), 400);
            }
            return;
        }

        // Special: Editor Handling
        if (app.type === 'editor' || app.id === 'editor') {
            if (window.systemMode === 'runner') {
                if(window.notify) window.notify("Restricted: Switch to Edit Mode", true);
                return; 
            }
            if (window.Editor && window.Editor.open) {
                window.Editor.open(app.id !== 'editor' ? app.id : null);
            }
            this.focusWindow('editor-app');
            return;
        }

        if (this.windows.has(app.id)) {
            this.focusWindow(app.id);
            return;
        }

        this.zIndex++;
        const winId = app.id;
        const win = document.createElement('div');
        win.id = `win-${winId}`;
        
        // Attach app data directly to DOM for robust context menu access
        win.appData = app; 

        // --- INTERNAL APP HANDLING (Finder) ---
        // Renders directly to DOM (no iframe) for shared context and perfect centering
        if (app.isInternal || app.id === 'finder') {
            win.className = 'window absolute flex flex-col bg-[#1e1e1e] border border-gray-700 rounded-lg shadow-2xl overflow-hidden animate-popIn';
            win.style.zIndex = this.zIndex;
            
            // STRICT CENTERING
            win.style.width = app.width || '800px';
            win.style.height = app.height || '500px';
            win.style.left = '50%';
            win.style.top = '50%';
            win.style.transform = 'translate(-50%, -50%)';

            win.innerHTML = `
                <div class="h-9 bg-[#2d2d2d] border-b border-black flex items-center justify-between px-3 select-none" 
                     onmousedown="WindowManager.startDrag(event, '${win.id}')"
                     oncontextmenu="event.preventDefault(); event.stopPropagation(); window.showContextMenu(event, document.getElementById('${win.id}').appData)">
                    <div class="flex items-center gap-2">
                         <button onclick="WindowManager.close('${winId}')" class="window-close close-btn w-3 h-3 rounded-full bg-red-500 text-red-900 flex items-center justify-center font-bold text-[8px] opacity-75 hover:opacity-100">×</button>
                         <span class="text-xs font-medium text-gray-400 pl-2 select-none">${app.name}</span>
                    </div>
                </div>
                <div class="flex flex-col flex-1 bg-[#1a1b26] overflow-hidden">
                     <div class="h-12 border-b border-gray-700 flex items-center px-4 gap-3 bg-[#15161e]">
                         <span class="material-symbols-outlined text-gray-500">search</span>
                         <input id="finderSearch" type="text" placeholder="Search apps..." class="bg-transparent border-none outline-none text-white text-sm w-full h-full placeholder-gray-600 focus:placeholder-gray-400">
                     </div>
                     <div class="flex flex-1 overflow-hidden">
                         <div id="finderSidebar" class="w-48 bg-black/20 border-r border-gray-700 p-2 overflow-y-auto"></div>
                         <div id="finderMain" class="flex-1 p-4 overflow-y-auto"></div>
                     </div>
                     <div class="h-8 bg-[#15161e] border-t border-gray-800 flex items-center px-4 justify-between text-[10px] text-gray-500 select-none">
                        <span id="finderStatus">Ready</span>
                        <span>Cloudstax OS</span>
                     </div>
                </div>
            `;
            
            document.body.appendChild(win);
            this.windows.set(winId, win);

            // Trigger OS rendering into the new window
            if(window.renderFinder) window.renderFinder();
            
            // Bind Search (Re-bind required since element is new)
            const searchInput = win.querySelector('#finderSearch');
            if(searchInput) {
                setTimeout(() => searchInput.focus(), 50); // Slight delay for focus
                searchInput.oninput = (e) => { 
                    const val = e.target.value.toLowerCase(); 
                    const gridItems = win.querySelectorAll('#finderMain .grid > div');
                    gridItems.forEach(el => { 
                        el.style.display = el.innerText.toLowerCase().includes(val) ? 'flex' : 'none'; 
                    }); 
                };
            }
            return;
        }

        // --- STANDARD APP HANDLING (Iframe) ---
        
        win.className = 'window absolute flex flex-col bg-[#1e1e1e] border border-gray-700 rounded-lg shadow-2xl overflow-hidden animate-popIn';
        
        // Smart Positioning
        const saved = this.getSavedState(app.id);
        if(saved) {
            win.style.width = saved.w; win.style.height = saved.h; win.style.left = saved.x; win.style.top = saved.y;
        } else {
            const w = 900, h = 650;
            const x = Math.max(20, (window.innerWidth - w) / 2) + (this.windows.size * 20);
            const y = Math.max(20, (window.innerHeight - h) / 2) + (this.windows.size * 20);
            win.style.width = `${w}px`; win.style.height = `${h}px`;
            win.style.left = `${x}px`; win.style.top = `${y}px`;
        }
        
        win.style.zIndex = this.zIndex;
        
        const iconHtml = await this.resolveAppIcon(app, "text-sm");

        win.innerHTML = `
            <div class="h-9 bg-[#2d2d2d] border-b border-black flex items-center justify-between px-3 select-none" 
                 onmousedown="WindowManager.startDrag(event, '${win.id}')"
                 oncontextmenu="event.preventDefault(); event.stopPropagation(); window.showContextMenu(event, document.getElementById('${win.id}').appData)">
                <div class="flex items-center gap-3">
                    <div class="flex gap-2 group">
                        <button onclick="WindowManager.close('${winId}')" class="window-close close-btn w-3 h-3 rounded-full bg-red-500 text-red-900 flex items-center justify-center font-bold text-[8px] opacity-75 group-hover:opacity-100">×</button>
                        <button onclick="WindowManager.minimize('${winId}')" class="w-3 h-3 rounded-full bg-yellow-500 opacity-75 group-hover:opacity-100"></button>
                        <button onclick="WindowManager.maximize('${winId}')" class="w-3 h-3 rounded-full bg-green-500 opacity-75 group-hover:opacity-100"></button>
                    </div>
                    <span class="text-xs font-medium text-gray-400 flex items-center gap-2">
                        ${iconHtml} ${window.esc(app.name)}
                    </span>
                </div>
                <button onclick="document.getElementById('frame-${winId}').contentWindow.location.reload()" class="text-gray-500 hover:text-white p-1 rounded hover:bg-white/10" title="Refresh App">
                    <span class="material-symbols-outlined text-[14px]">refresh</span>
                </button>
            </div>
            <div class="flex-1 bg-white relative">
                <iframe id="frame-${winId}" class="w-full h-full border-0 bg-white" sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"></iframe>
                <div id="loader-${winId}" class="absolute inset-0 flex items-center justify-center bg-[#1e1e1e] z-10">
                    <div class="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            </div>
        `;

        document.body.appendChild(win);
        this.windows.set(winId, win);
        if(!app.id.startsWith('preview-')) this.addToDock(app);

        try {
            let fullApp = app;
            if ((!app.files || Object.keys(app.files).length === 0) && window.dbOp) {
                const dbApp = await window.dbOp('get', app.id);
                if (dbApp) fullApp = dbApp;
            }
            
            const htmlContent = await this.launchApp(fullApp);
            
            const frame = document.getElementById(`frame-${winId}`);
            const loader = document.getElementById(`loader-${winId}`);
            
            requestAnimationFrame(() => {
                if(frame && frame.contentDocument) {
                    frame.contentDocument.open();
                    frame.contentDocument.write(htmlContent);
                    frame.contentDocument.close();
                    if(loader) loader.remove();
                } else if (frame) {
                    frame.srcdoc = htmlContent;
                    frame.onload = () => { if(loader) loader.remove(); };
                }
            });

        } catch (e) {
            console.error("Launch Error:", e);
            if(window.notify) window.notify("App crashed on launch", true);
            this.close(winId);
        }
    },

    // --- Runtime Engine ---
    
    launchApp: async function(app, overrideEntryPath = null) {
        if (app.url && (!app.files || Object.keys(app.files).length === 0)) {
            return `<script>window.location.href="${app.url}";<\/script>`;
        }

        const files = app.files || {};
        const urlMap = {};
        
        for (const path in files) {
            const file = files[path];
            const mime = this.getMimeType(path);
            let blobUrl;
            if (file.content instanceof Blob) {
                blobUrl = URL.createObjectURL(file.content);
            } else {
                blobUrl = URL.createObjectURL(new Blob([file.content], { type: mime }));
            }
            urlMap[window.normalizePath(path)] = blobUrl;
        }

        let indexContent = "";
        
        if (overrideEntryPath && files[overrideEntryPath]) {
            indexContent = files[overrideEntryPath].content;
        } else {
            const entryPoints = ['index.html', 'main.html', 'app.html'];
            let indexPath = Object.keys(files).find(k => entryPoints.includes(k.toLowerCase().split('/').pop()));
            
            if (indexPath) indexContent = files[indexPath].content;
            else if (app.html) indexContent = app.html; 
            else indexContent = `<h1>${window.esc(app.name)}</h1><p>No index.html found</p>`;
        }

        const paths = Object.keys(urlMap).sort((a,b) => b.length - a.length);

        paths.forEach(path => {
            const blobUrl = urlMap[path];
            const safePath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`((href|src|action)=["']|url\\(["']?)((\\./|/)?${safePath})(["']?|\\))`, 'g');
            indexContent = indexContent.replace(regex, `$1${blobUrl}$5`);
        });

        const bridge = `
        <script>
        window.onerror = function(m,u,l){ window.parent.postMessage({type:'log',level:'error',message:m + ' (Line ' + l + ')'},'*'); };
        const _log = (l, a) => window.parent.postMessage({type:'log',level:l,message:Array.from(a).join(' ')},'*');
        console.log = function(...a){ _log('info', a); };
        console.error = function(...a){ _log('error', a); };
        
        window.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            window.parent.postMessage({ type: 'contextmenu', id: '${app.id}', x: e.clientX, y: e.clientY }, '*');
        });
        </script>`;
        
        if (indexContent.includes('</body>')) {
            indexContent = indexContent.replace('</body>', `${bridge}</body>`);
        } else {
            indexContent += bridge;
        }

        return indexContent;
    },

    handleMessage: function(e) {
        if (e.data && e.data.type === 'contextmenu') {
            const winId = e.data.id;
            const win = document.getElementById(`win-${winId}`);
            if (win) {
                const rect = win.getBoundingClientRect();
                const screenX = rect.left + e.data.x;
                const screenY = rect.top + e.data.y + 36;
                
                if (window.showContextMenu) {
                    const app = (window.all || []).find(a => a.id === winId);
                    if (app) {
                        window.showContextMenu({ clientX: screenX, clientY: screenY }, app);
                    }
                }
            }
        }
    },

    close: function(id) {
        const win = document.getElementById(`win-${id}`);
        if (win) win.remove();
        this.windows.delete(id);
        this.removeFromDock(id);
    },

    focusWindow: function(id) {
        const winId = id.startsWith('win-') || id === 'editor-app' ? id : `win-${id}`;
        const win = document.getElementById(winId);
        if (win) {
            this.zIndex++;
            win.style.zIndex = this.zIndex;
            win.classList.remove('minimized');
            win.style.pointerEvents = '';
            win.style.opacity = '';
            
            // NOTE: We do NOT restore transform here because startDrag handles the transition
            // from centered (transform) to absolute (left/top) coordinates permanently.
            
            if(win.dataset.maximized === 'true') { win.style.top = '0'; win.style.left = '0'; }
        }
    },

    minimize: function(id) {
        const winId = id.startsWith('win-') || id === 'editor-app' ? id : `win-${id}`;
        const win = document.getElementById(winId);
        if (win) { win.classList.add('minimized'); win.style.pointerEvents = 'none'; }
    },

    maximize: function(id) {
        const winId = id.startsWith('win-') || id === 'editor-app' ? id : `win-${id}`;
        const win = document.getElementById(winId);
        if (!win) return;

        if (win.dataset.maximized === 'true') {
            // Restore
            win.style.top = win.dataset.prevTop; 
            win.style.left = win.dataset.prevLeft; 
            win.style.width = win.dataset.prevWidth; 
            win.style.height = win.dataset.prevHeight;
            
            // Restore transform if it was saved (fix for centered windows flying off screen)
            if (win.dataset.prevTransform) {
                win.style.transform = win.dataset.prevTransform;
                delete win.dataset.prevTransform;
            }

            win.dataset.maximized = 'false'; 
            win.style.borderRadius = '0.5rem';
        } else {
            // Maximize
            win.dataset.prevTop = win.style.top; 
            win.dataset.prevLeft = win.style.left; 
            win.dataset.prevWidth = win.style.width; 
            win.dataset.prevHeight = win.style.height;
            
            // If window has transform (e.g. center), save it and clear it so left:0 top:0 works
            if (win.style.transform && win.style.transform !== 'none') {
                win.dataset.prevTransform = win.style.transform;
                win.style.transform = 'none';
            }

            win.style.top = '0'; 
            win.style.left = '0'; 
            win.style.width = '100%'; 
            win.style.height = '100%'; 
            win.dataset.maximized = 'true'; 
            win.style.borderRadius = '0';
        }
    },

    recenterWindows: function() { },

    addToDock: async function(app) {
        const dock = document.getElementById('dock-apps');
        if (!dock || document.getElementById(`dock-icon-${app.id}`)) return;

        const btn = document.createElement('div');
        btn.id = `dock-icon-${app.id}`;
        btn.className = 'w-12 h-12 bg-gray-800/80 rounded-xl hover:-translate-y-2 transition-all flex items-center justify-center text-white shadow-lg border border-white/10 cursor-pointer relative group';
        const iconHtml = await this.resolveAppIcon(app, "text-2xl");
        btn.innerHTML = `${iconHtml}<div class="absolute -bottom-1 w-1 h-1 bg-white rounded-full"></div><div class="absolute -top-10 bg-black text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-gray-700 z-[9999]">${window.esc(app.name)}</div>`;

        btn.onclick = () => {
            if (app.action && typeof app.action === 'function') { app.action(); return; }
            if (app.id === 'editor' || app.type === 'editor') {
                if(window.systemMode === 'runner') { if(window.notify) window.notify("Switch to Edit Mode", true); return; }
                if(window.Editor && window.Editor.open) window.Editor.open();
                this.focusWindow('editor-app'); return;
            }
            const win = document.getElementById(`win-${app.id}`);
            if (win && win.classList.contains('minimized')) this.focusWindow(app.id);
            else if (win && parseInt(win.style.zIndex) === this.zIndex) this.minimize(app.id);
            else this.focusWindow(app.id);
        };
        btn.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); if(window.showContextMenu) window.showContextMenu(e, app); };
        dock.appendChild(btn);
    },

    removeFromDock: function(id) {
        if(['finder', 'editor', 'settings'].includes(id)) return;
        const el = document.getElementById(`dock-icon-${id}`);
        if (el) el.remove();
    },

    toggleLauncher: function() {
        if(window.isModalOpen && window.isModalOpen()) return; 

        // Managed Window Logic
        if (this.windows.has('finder')) {
            this.close('finder');
        } else {
            this.openApp({
                id: 'finder',
                name: 'Finder',
                type: 'system',
                iconUrl: 'folder_open', 
                isInternal: true,
                width: '800px',
                height: '500px'
            });
        }
    },

    resolveAppIcon: async function(app, classes = "") {
        if (app.iconData) return `<img src="${app.iconData}" class="${classes} object-contain select-none pointer-events-none">`;
        if (!app.iconUrl) return `<span class="material-symbols-outlined ${classes}">grid_view</span>`;
        if (/^[a-z0-9_]+$/.test(app.iconUrl)) return `<span class="material-symbols-outlined ${classes}">${app.iconUrl}</span>`;
        let files = app.files;
        if (!files && window.dbOp) { const dbApp = await window.dbOp('get', app.id); if (dbApp) files = dbApp.files; }
        if (files) {
            const cleanPath = window.normalizePath(app.iconUrl);
            const file = files[cleanPath] || files[app.iconUrl];
            if (file) {
                let url;
                if (file.type === 'blob' || file.content instanceof Blob) { url = URL.createObjectURL(file.content); } else { url = `data:image/svg+xml;base64,${btoa(file.content)}`; }
                return `<img src="${url}" class="${classes} object-contain select-none pointer-events-none">`;
            }
        }
        return `<img src="${app.iconUrl}" class="${classes} object-contain select-none pointer-events-none" onerror="this.style.display='none'">`;
    },

    getSavedState: function(id) { try { return JSON.parse(localStorage.getItem(WIN_STATE_KEY)||'{}')[id]; } catch { return null; } },
    saveState: function(id, rect) { try { const states = JSON.parse(localStorage.getItem(WIN_STATE_KEY)||'{}'); states[id] = rect; localStorage.setItem(WIN_STATE_KEY, JSON.stringify(states)); } catch {} },
    
    startDrag: function(e, id) { 
        if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.tagName === 'INPUT') return; 
        
        const win = document.getElementById(id); 
        if (!win || win.dataset.maximized === 'true') return; 
        
        this.focusWindow(id); 
        this.activeDrag = win; 

        // CRITICAL: If window is using CSS Transform for centering, convert to absolute pixels 
        // to prevent "jumping" when dragging starts.
        if (win.style.transform.includes('translate')) {
            const rect = win.getBoundingClientRect();
            win.style.transform = 'none';
            // Set explicit pixel values based on current visual position
            win.style.left = rect.left + 'px';
            win.style.top = rect.top + 'px';
        }

        this.dragOffset = { x: e.clientX - win.offsetLeft, y: e.clientY - win.offsetTop }; 
        document.querySelectorAll('iframe').forEach(f => f.style.pointerEvents = 'none'); 
    },
    
    onDrag: function(e) { if (!this.activeDrag) return; e.preventDefault(); this.activeDrag.style.left = (e.clientX - this.dragOffset.x) + 'px'; this.activeDrag.style.top = (e.clientY - this.dragOffset.y) + 'px'; },
    stopDrag: function() { if (this.activeDrag) { const win = this.activeDrag; this.saveState(win.id.replace('win-', ''), { x: win.style.left, y: win.style.top, w: win.style.width, h: win.style.height }); this.activeDrag = null; document.querySelectorAll('iframe').forEach(f => f.style.pointerEvents = 'auto'); } },
    getMimeType: function(path) { const ext = path.split('.').pop().toLowerCase(); return ({ 'js': 'text/javascript', 'jsx': 'text/javascript', 'css': 'text/css', 'html': 'text/html', 'json': 'application/json', 'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'svg': 'image/svg+xml', 'gif': 'image/gif', 'webp': 'image/webp', 'ico': 'image/x-icon' })[ext] || 'text/plain'; }
};

window.WindowManager.init();
