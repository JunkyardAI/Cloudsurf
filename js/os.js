// --- MODULE: OS (Shell & Desktop) ---

window.all = []; 
window.bgAnimationPaused = false;
window.settings = {
    use3DBackground: true,
    wallpaper: null, 
    bgSize: 'cover'
};

window.init = async function() {
    console.log("OS: Booting...");
    loadSettings();
    try { if (window.initDB) { await window.initDB(); await window.refreshApps(); } } catch(e) { console.error("DB Init Failed", e); }
    initDock();
    window.renderDesktopIcons();
    window.renderFinder();
    initBackgroundSystem();
    setupGlobalListeners();
    const boot = document.getElementById('boot-screen');
    if (boot) { setTimeout(() => { boot.style.opacity = '0'; setTimeout(() => boot.remove(), 500); }, 500); }
};

function loadSettings() {
    try { const s = localStorage.getItem('cloudstax_settings'); if(s) window.settings = { ...window.settings, ...JSON.parse(s) }; } catch(e) { console.warn("Settings load failed", e); }
}
function saveSettings() { localStorage.setItem('cloudstax_settings', JSON.stringify(window.settings)); initBackgroundSystem(); }

function initBackgroundSystem() {
    const canvas = document.getElementById('bg-canvas');
    const bgContainer = document.getElementById('desktop-bg-container') || document.body;
    if (window.settings.wallpaper) {
        if(canvas) canvas.style.display = 'none';
        bgContainer.style.backgroundImage = `url('${window.settings.wallpaper}')`;
        bgContainer.style.backgroundSize = window.settings.bgSize || 'cover';
        bgContainer.style.backgroundPosition = 'center';
        bgContainer.style.backgroundRepeat = 'no-repeat';
        window.bgAnimationPaused = true;
        return;
    }
    bgContainer.style.backgroundImage = ''; 
    if (window.settings.use3DBackground) {
        if(canvas) canvas.style.display = 'block';
        window.bgAnimationPaused = false;
        initThreeJSBackground();
    } else {
        if(canvas) canvas.style.display = 'none';
        bgContainer.style.backgroundColor = '#111';
        window.bgAnimationPaused = true;
    }
}

function initDock() {
    const dock = document.getElementById('dock-apps');
    if(dock) dock.innerHTML = '';
    const systemApps = [
        { id: 'finder', name: 'Finder', iconUrl: 'folder_open', type: 'system', action: () => WindowManager.toggleLauncher() },
        { id: 'editor', name: 'Code Studio', iconUrl: 'terminal', type: 'editor', action: () => { if(window.Editor && window.Editor.open) window.Editor.open(); } },
        { id: 'settings', name: 'Settings', iconUrl: 'settings', type: 'system', action: () => openSettingsModal() }
    ];
    systemApps.forEach(app => WindowManager.addToDock(app));
}

window.renderDesktopIcons = async function() {
    const desktop = document.getElementById('desktop-icons');
    if (!desktop) return;
    desktop.innerHTML = '';
    // Show only user apps on desktop
    const desktopApps = window.all.filter(app => app.onDesktop && app.type !== 'system');
    for (const app of desktopApps) {
        let iconHtml = window.renderIconHtml(app.iconUrl, "text-2xl");
        if (WindowManager.resolveAppIcon) iconHtml = await WindowManager.resolveAppIcon(app, "text-2xl");
        const el = document.createElement('div');
        el.className = "flex flex-col items-center gap-2 p-2 rounded cursor-pointer group w-[90px] select-none";
        el.innerHTML = `<div class="w-12 h-12 bg-gray-800/80 rounded-xl flex items-center justify-center text-white shadow-lg border border-white/10 group-hover:scale-105 transition-transform overflow-hidden relative">${iconHtml}</div><span class="text-xs text-center text-gray-200 font-medium drop-shadow-md truncate w-full px-1 bg-black/50 rounded">${window.esc(app.name)}</span>`;
        el.onclick = () => WindowManager.openApp(app);
        el.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); window.showContextMenu(e, app); };
        desktop.appendChild(el);
    }
};

window.refreshApps = async function() {
    if (window.dbOp) { try { window.all = await window.dbOp('get') || []; } catch(e) { console.warn("DB Read Error", e); window.all = []; } }
    window.renderDesktopIcons();
    window.renderFinder();
};

window.renderFinder = function() {
    const finderMain = document.getElementById('finderMain');
    const finderSide = document.getElementById('finderSidebar');
    if (!finderMain || !finderSide) return;
    finderSide.innerHTML = `<div class="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-2 mb-2 mt-2">Categories</div>`;
    const stacks = new Set(['All']);
    window.all.forEach(app => { if(app.stack) stacks.add(app.stack); });
    stacks.forEach(s => {
        const item = document.createElement('div');
        item.className = 'px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded cursor-pointer truncate';
        item.textContent = s;
        item.onclick = () => filterFinder(s);
        finderSide.appendChild(item);
    });
    filterFinder('All');
};

window.filterFinder = function(stack) {
    const list = document.getElementById('finderMain');
    if(!list) return;
    list.innerHTML = '';
    const apps = stack === 'All' ? window.all : window.all.filter(a => a.stack === stack);
    const grid = document.createElement('div');
    grid.className = "grid grid-cols-4 gap-4 content-start";
    apps.forEach(app => {
        const el = document.createElement('div');
        el.className = "flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-800 cursor-pointer transition select-none";
        el.innerHTML = `<div class="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center text-white overflow-hidden relative">${window.renderIconHtml(app.iconUrl, "text-xl")}</div><span class="text-xs text-gray-300 text-center truncate w-full">${window.esc(app.name)}</span>`;
        WindowManager.resolveAppIcon(app, "text-xl").then(html => { el.querySelector('.w-10').innerHTML = html; });
        el.onclick = () => { WindowManager.openApp(app); WindowManager.toggleLauncher(); };
        el.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); window.showContextMenu(e, app); };
        grid.appendChild(el);
    });
    list.appendChild(grid);
    const status = document.getElementById('finderStatus');
    if(status) status.innerText = `${apps.length} apps in ${stack}`;
};

window.showContextMenu = function(e, app) {
    window.hideContextMenu();
    const menu = document.createElement('div');
    menu.id = 'contextMenu';
    menu.className = "fixed bg-[#2d2d2d] border border-gray-700 rounded-lg shadow-2xl py-1 z-[999999] min-w-[160px] animate-popIn flex flex-col";
    const onDesk = app.onDesktop;
    const isSystem = app.type === 'system' || app.id === 'cloudstax-core' || ['finder','editor','settings'].includes(app.id);
    let deleteOption = '';
    if (!isSystem) {
        deleteOption = `<div class="h-px bg-gray-700 my-1"></div><div onclick="window.deleteApp('${app.id}'); window.hideContextMenu()" class="px-4 py-2 hover:bg-red-900 cursor-pointer text-xs text-red-300 flex items-center gap-2"><span class="material-symbols-outlined text-sm">delete</span> Delete</div>`;
    }
    menu.innerHTML = `
        <div onclick="WindowManager.openApp(window.all.find(a=>a.id==='${app.id}') || {id:'${app.id}', type:'${app.type}'}); window.hideContextMenu()" class="px-4 py-2 hover:bg-blue-600 cursor-pointer text-xs text-gray-200 flex items-center gap-2"><span class="material-symbols-outlined text-sm">open_in_new</span> Open</div>
        ${!isSystem ? `<div onclick="window.toggleDesktop('${app.id}'); window.hideContextMenu()" class="px-4 py-2 hover:bg-blue-600 cursor-pointer text-xs text-gray-200 flex items-center gap-2"><span class="material-symbols-outlined text-sm">${onDesk ? 'close' : 'add_to_queue'}</span> ${onDesk ? 'Remove from Desktop' : 'Add to Desktop'}</div>` : ''}
        ${!isSystem ? `<div onclick="if(window.Editor) window.Editor.open('${app.id}'); window.hideContextMenu()" class="px-4 py-2 hover:bg-blue-600 cursor-pointer text-xs text-gray-200 flex items-center gap-2"><span class="material-symbols-outlined text-sm">code</span> Edit Source</div>` : ''}
        ${deleteOption}
    `;
    document.body.appendChild(menu);
    let x = e.clientX || 0;
    let y = e.clientY || 0;
    if (x + 160 > window.innerWidth) x = window.innerWidth - 170;
    if (y + 200 > window.innerHeight) y = window.innerHeight - 210;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
};

window.hideContextMenu = function() { const menu = document.getElementById('contextMenu'); if(menu) menu.remove(); };

window.toggleDesktop = async function(id) {
    const app = window.all.find(a => a.id === id);
    if(app) { app.onDesktop = !app.onDesktop; if(window.dbOp) await window.dbOp('put', app); window.renderDesktopIcons(); }
};

window.deleteApp = async function(id) {
    const app = window.all.find(a => a.id === id);
    if(app && (app.type === 'system' || ['editor','finder','settings'].includes(id))) { window.notify("Cannot delete system apps", true); return; }
    if(confirm("Permanently delete this app?")) {
        try { await window.dbOp('delete', id); window.notify("App Deleted"); window.all = window.all.filter(a => a.id !== id); window.renderDesktopIcons(); window.renderFinder(); if(WindowManager.windows.has(id)) WindowManager.close(id); } catch(e) { console.error(e); window.notify("Delete Failed", true); }
    }
};

window.openSettingsModal = function() {
    const w = 400; const x = (window.innerWidth - w) / 2; const y = 100;
    const modal = document.createElement('div');
    modal.className = "fixed bg-[#1e1e1e] border border-gray-600 rounded-lg shadow-2xl z-[9999] p-4 flex flex-col gap-4 animate-popIn";
    modal.style.left = x + 'px'; modal.style.top = y + 'px'; modal.style.width = w + 'px';
    const is3D = window.settings.use3DBackground;
    modal.innerHTML = `
        <div class="flex justify-between items-center border-b border-gray-700 pb-2"><h3 class="text-white font-bold">System Settings</h3><button onclick="this.parentElement.parentElement.remove()" class="text-gray-400 hover:text-white">✕</button></div>
        <div class="flex flex-col gap-2"><div class="flex items-center justify-between"><span class="text-gray-300 text-sm">3D Background</span><label class="relative inline-flex items-center cursor-pointer"><input type="checkbox" id="set-3d" ${is3D ? 'checked' : ''} class="sr-only peer"><div class="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div></label></div><p class="text-[10px] text-gray-500">Active only when no wallpaper is set.</p></div>
        <div class="border-t border-gray-700 my-2"></div>
        <div class="flex flex-col gap-3"><h4 class="text-gray-300 text-sm">Custom Wallpaper</h4><div class="flex gap-2"><input type="file" id="set-wall" accept="image/*" class="hidden"><button onclick="document.getElementById('set-wall').click()" class="px-3 py-1 bg-gray-700 text-white text-xs rounded hover:bg-gray-600">Upload Image</button><button onclick="clearWallpaper()" class="px-3 py-1 bg-red-900/50 text-red-200 text-xs rounded hover:bg-red-900">Reset</button></div><div class="flex items-center gap-4 text-xs text-gray-400"><label><input type="radio" name="bgSize" value="cover" ${window.settings.bgSize === 'cover' ? 'checked' : ''}> Cover</label><label><input type="radio" name="bgSize" value="contain" ${window.settings.bgSize === 'contain' ? 'checked' : ''}> Fit</label></div></div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#set-3d').onchange = (e) => { window.settings.use3DBackground = e.target.checked; saveSettings(); };
    modal.querySelectorAll('input[name="bgSize"]').forEach(r => { r.onchange = (e) => { window.settings.bgSize = e.target.value; saveSettings(); }; });
    modal.querySelector('#set-wall').onchange = (e) => { const file = e.target.files[0]; if(file) { const reader = new FileReader(); reader.onload = (evt) => { window.settings.wallpaper = evt.target.result; saveSettings(); modal.remove(); }; reader.readAsDataURL(file); } };
};

window.clearWallpaper = function() { window.settings.wallpaper = null; saveSettings(); };

function setupGlobalListeners() {
    document.addEventListener('click', (e) => { if(!e.target.closest('#contextMenu')) window.hideContextMenu(); }, true);
    const btn = document.getElementById('createNewAppBtn');
    if(btn) btn.onclick = () => { WindowManager.toggleLauncher(); if(window.Editor && window.Editor.open) window.Editor.open(); };
    const search = document.getElementById('finderSearch');
    if(search) { search.oninput = (e) => { const val = e.target.value.toLowerCase(); document.querySelectorAll('#finderMain .grid > div').forEach(el => { el.style.display = el.innerText.toLowerCase().includes(val) ? 'flex' : 'none'; }); }; }
}

function initThreeJSBackground() { 
    if(window.bgAnimationPaused) return; 
    const cvs = document.getElementById('bg-canvas'); 
    if(!window.THREE || !cvs) return; 
    if(cvs.dataset.init === "true") return; cvs.dataset.init = "true";
    const scene = new THREE.Scene(); 
    const cam = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000); 
    const renderer = new THREE.WebGLRenderer({canvas:cvs, alpha:true}); 
    renderer.setSize(window.innerWidth, window.innerHeight); 
    renderer.setPixelRatio(window.devicePixelRatio);
    const geo = new THREE.BufferGeometry(); const cnt = 600; const pos = new Float32Array(cnt * 3); 
    for(let i=0; i<cnt*3; i++) pos[i] = (Math.random()-0.5) * 15; 
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); 
    const mat = new THREE.PointsMaterial({size: 0.03, color: 0x60a5fa, transparent: true, opacity: 0.8}); 
    const mesh = new THREE.Points(geo, mat); scene.add(mesh); 
    cam.position.z = 5; 
    const animate = () => { if(window.bgAnimationPaused) return; requestAnimationFrame(animate); mesh.rotation.y += 0.0005; mesh.rotation.x += 0.0002; renderer.render(scene, cam); }; 
    animate();
    window.addEventListener('resize', () => { cam.aspect = window.innerWidth / window.innerHeight; cam.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
}
