// --- MODULE: OS (Shell & Desktop) ---

window.all = []; 
window.bgAnimationPaused = false;
window.settings = {
    use3DBackground: true,
    wallpaper: null // can be base64 or blobUrl
};

window.init = async function() {
    console.log("OS: Booting...");
    
    // 1. Load Settings
    loadSettings();

    // 2. Immediate Render (Fail-Safe)
    window.renderDesktopIcons();
    window.renderFinder();

    // 3. Initialize Database
    try {
        if (window.initDB) {
            await window.initDB();
            await window.refreshApps();
        }
    } catch(e) { 
        console.error("DB Init Failed", e); 
    }

    // 4. Background
    initBackgroundSystem();

    // 5. Global Listeners (Context Menu, etc)
    setupGlobalListeners();

    // 6. Hide Boot Screen
    const boot = document.getElementById('boot-screen');
    if (boot) {
        setTimeout(() => {
            boot.style.opacity = '0';
            setTimeout(() => boot.remove(), 500);
        }, 500);
    }
};

function loadSettings() {
    try {
        const s = localStorage.getItem('cloudstax_settings');
        if(s) window.settings = { ...window.settings, ...JSON.parse(s) };
    } catch(e) { console.warn("Settings load failed", e); }
}

function saveSettings() {
    localStorage.setItem('cloudstax_settings', JSON.stringify(window.settings));
    initBackgroundSystem(); // Refresh background
}

// --- Background System ---
function initBackgroundSystem() {
    const canvas = document.getElementById('bg-canvas');
    const bgContainer = document.getElementById('desktop-bg-container') || document.body;

    // A. Custom Wallpaper (Highest Priority)
    if (window.settings.wallpaper) {
        if(canvas) canvas.style.display = 'none';
        bgContainer.style.backgroundImage = `url('${window.settings.wallpaper}')`;
        bgContainer.style.backgroundSize = 'cover';
        bgContainer.style.backgroundPosition = 'center';
        window.bgAnimationPaused = true;
        return;
    }

    // B. 3D Background
    bgContainer.style.backgroundImage = ''; // Reset
    if (window.settings.use3DBackground) {
        if(canvas) canvas.style.display = 'block';
        window.bgAnimationPaused = false;
        initThreeJSBackground();
    } else {
        // C. Simple Black/Dark Background (Saver Mode)
        if(canvas) canvas.style.display = 'none';
        bgContainer.style.backgroundColor = '#111';
        window.bgAnimationPaused = true;
    }
}

// --- App Management ---

window.refreshApps = async function() {
    if (window.dbOp) {
        try {
            window.all = await window.dbOp('get') || [];
        } catch(e) { 
            console.warn("DB Read Error", e);
            window.all = [];
        }
    }
    window.renderDesktopIcons();
    window.renderFinder();
};

window.renderDesktopIcons = async function() {
    const desktop = document.getElementById('desktop-icons');
    if (!desktop) return;
    desktop.innerHTML = '';

    // 1. SYSTEM APPS
    const systemApps = [
        {
            id: 'editor',
            name: 'Code Studio',
            iconUrl: 'terminal',
            type: 'editor',
            action: () => { if(window.Editor && window.Editor.open) window.Editor.open(); }
        },
        {
            id: 'finder',
            name: 'Finder',
            iconUrl: 'folder_open',
            type: 'system',
            action: () => WindowManager.toggleLauncher()
        },
        {
            id: 'settings',
            name: 'Settings',
            iconUrl: 'settings',
            type: 'system',
            action: () => openSettingsModal()
        }
    ];

    systemApps.forEach(app => {
        const el = createIconElement(app);
        el.onclick = app.action;
        desktop.appendChild(el);
    });

    // 2. USER APPS
    for (const app of window.all.filter(app => app.onDesktop)) {
        // Use WindowManager to resolve custom icons (async)
        let iconHtml = window.renderIconHtml(app.iconUrl, "text-2xl");
        if (WindowManager.resolveAppIcon) {
            iconHtml = await WindowManager.resolveAppIcon(app, "text-2xl");
        }
        
        const el = document.createElement('div');
        el.className = "flex flex-col items-center gap-2 p-2 rounded cursor-pointer group w-[90px] select-none";
        el.innerHTML = `
            <div class="w-12 h-12 bg-gray-800/80 rounded-xl flex items-center justify-center text-white shadow-lg border border-white/10 group-hover:scale-105 transition-transform overflow-hidden">
                ${iconHtml}
            </div>
            <span class="text-xs text-center text-gray-200 font-medium drop-shadow-md truncate w-full px-1 bg-black/50 rounded">${window.esc(app.name)}</span>
        `;
        
        el.onclick = () => WindowManager.openApp(app);
        el.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.showContextMenu(e, app);
        };
        desktop.appendChild(el);
    }
};

function createIconElement(app) {
    const el = document.createElement('div');
    el.className = "flex flex-col items-center gap-2 p-2 rounded cursor-pointer group w-[90px] select-none";
    el.innerHTML = `
        <div class="w-12 h-12 bg-gray-800/80 rounded-xl flex items-center justify-center text-white shadow-lg border border-white/10 group-hover:scale-105 transition-transform">
            ${window.renderIconHtml(app.iconUrl, "text-2xl")}
        </div>
        <span class="text-xs text-center text-gray-200 font-medium drop-shadow-md truncate w-full px-1 bg-black/50 rounded">${window.esc(app.name)}</span>
    `;
    return el;
}

// --- Finder / Launcher ---

window.renderFinder = function() {
    const finderMain = document.getElementById('finderMain');
    const finderSide = document.getElementById('finderSidebar');
    if (!finderMain || !finderSide) return;

    finderMain.innerHTML = '';
    
    // Aggregate Stacks
    const stacks = new Set(['All']);
    window.all.forEach(app => { if(app.stack) stacks.add(app.stack); });

    finderSide.innerHTML = `<div class="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-2 mb-2 mt-2">Categories</div>`;
    
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
        el.innerHTML = `
            <div class="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center text-white overflow-hidden">
                ${window.renderIconHtml(app.iconUrl, "text-xl")}
            </div>
            <span class="text-xs text-gray-300 text-center truncate w-full">${window.esc(app.name)}</span>
        `;
        el.onclick = () => {
            WindowManager.openApp(app);
            WindowManager.toggleLauncher(); 
        };
        el.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.showContextMenu(e, app);
        };
        grid.appendChild(el);
    });
    
    list.appendChild(grid);
    const status = document.getElementById('finderStatus');
    if(status) status.innerText = `${apps.length} apps in ${stack}`;
};

// --- Context Menu Logic ---
window.showContextMenu = function(e, app) {
    // Remove existing
    window.hideContextMenu();

    const menu = document.createElement('div');
    menu.id = 'contextMenu';
    menu.className = "fixed bg-[#2d2d2d] border border-gray-700 rounded-lg shadow-2xl py-1 z-[999999] min-w-[160px] animate-popIn flex flex-col";
    
    const onDesk = app.onDesktop;
    
    menu.innerHTML = `
        <div onclick="WindowManager.openApp(window.all.find(a=>a.id==='${app.id}')); window.hideContextMenu()" class="px-4 py-2 hover:bg-blue-600 cursor-pointer text-xs text-gray-200 flex items-center gap-2">
            <span class="material-symbols-outlined text-sm">open_in_new</span> Open
        </div>
        <div onclick="window.toggleDesktop('${app.id}'); window.hideContextMenu()" class="px-4 py-2 hover:bg-blue-600 cursor-pointer text-xs text-gray-200 flex items-center gap-2">
            <span class="material-symbols-outlined text-sm">${onDesk ? 'close' : 'add_to_queue'}</span> ${onDesk ? 'Remove from Desktop' : 'Add to Desktop'}
        </div>
        <div onclick="if(window.Editor) window.Editor.open('${app.id}'); window.hideContextMenu()" class="px-4 py-2 hover:bg-blue-600 cursor-pointer text-xs text-gray-200 flex items-center gap-2">
            <span class="material-symbols-outlined text-sm">code</span> Edit Source
        </div>
        <div class="h-px bg-gray-700 my-1"></div>
        <div onclick="window.deleteApp('${app.id}'); window.hideContextMenu()" class="px-4 py-2 hover:bg-red-900 cursor-pointer text-xs text-red-300 flex items-center gap-2">
            <span class="material-symbols-outlined text-sm">delete</span> Delete
        </div>
    `;

    document.body.appendChild(menu);
    
    let x = e.clientX;
    let y = e.clientY;
    
    // Boundary check
    if (x + 160 > window.innerWidth) x = window.innerWidth - 170;
    if (y + 200 > window.innerHeight) y = window.innerHeight - 210;
    
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
};

window.hideContextMenu = function() {
    const menu = document.getElementById('contextMenu');
    if(menu) menu.remove();
};

// --- Operations ---

window.toggleDesktop = async function(id) {
    const app = window.all.find(a => a.id === id);
    if(app) {
        app.onDesktop = !app.onDesktop;
        if(window.dbOp) await window.dbOp('put', app);
        window.renderDesktopIcons();
    }
};

window.deleteApp = async function(id) {
    if(confirm("Permanently delete this app?")) {
        try {
            await window.dbOp('delete', id);
            window.notify("App Deleted");
            
            window.all = window.all.filter(a => a.id !== id);
            window.renderDesktopIcons();
            window.renderFinder(); 
            
            if(WindowManager.windows.has(id)) WindowManager.close(id);
        } catch(e) {
            console.error(e);
            window.notify("Delete Failed", true);
        }
    }
};

// --- Settings Modal ---
window.openSettingsModal = function() {
    // Center logic
    const w = 400;
    const x = (window.innerWidth - w) / 2;
    const y = 100;

    const modal = document.createElement('div');
    modal.className = "fixed bg-[#1e1e1e] border border-gray-600 rounded-lg shadow-2xl z-[9999] p-4 flex flex-col gap-4 animate-popIn";
    modal.style.left = x + 'px';
    modal.style.top = y + 'px';
    modal.style.width = w + 'px';
    
    modal.innerHTML = `
        <div class="flex justify-between items-center border-b border-gray-700 pb-2">
            <h3 class="text-white font-bold">System Settings</h3>
            <button onclick="this.parentElement.parentElement.remove()" class="text-gray-400 hover:text-white">✕</button>
        </div>
        
        <div class="flex flex-col gap-2">
            <label class="flex items-center justify-between text-gray-300 text-sm">
                <span>Enable 3D Particles</span>
                <input type="checkbox" id="set-3d" ${window.settings.use3DBackground && !window.settings.wallpaper ? 'checked' : ''} class="accent-blue-500">
            </label>
            <p class="text-[10px] text-gray-500">Disabling saves CPU usage.</p>
        </div>

        <div class="border-t border-gray-700 my-2"></div>

        <div class="flex flex-col gap-2">
            <h4 class="text-gray-300 text-sm">Custom Wallpaper</h4>
            <input type="file" id="set-wall" accept="image/*" class="text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-gray-700 file:text-white">
            <button onclick="clearWallpaper()" class="text-xs text-red-400 text-left hover:underline">Reset to Default</button>
        </div>
    `;
    
    document.body.appendChild(modal);

    // Listeners
    modal.querySelector('#set-3d').onchange = (e) => {
        window.settings.use3DBackground = e.target.checked;
        window.settings.wallpaper = null; // Disable wallpaper if toggling 3d
        saveSettings();
    };

    modal.querySelector('#set-wall').onchange = (e) => {
        const file = e.target.files[0];
        if(file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                window.settings.wallpaper = evt.target.result;
                window.settings.use3DBackground = false; // Disable 3D
                saveSettings();
                modal.remove(); // Close to show effect
            };
            reader.readAsDataURL(file);
        }
    };
};

window.clearWallpaper = function() {
    window.settings.wallpaper = null;
    window.settings.use3DBackground = true;
    saveSettings();
};

function setupGlobalListeners() {
    // Close context menu on click anywhere else
    document.addEventListener('click', (e) => {
        if(!e.target.closest('#contextMenu')) {
            window.hideContextMenu();
        }
    });

    // Launcher toggler
    const btn = document.getElementById('createNewAppBtn');
    if(btn) btn.onclick = () => {
        WindowManager.toggleLauncher();
        if(window.Editor && window.Editor.open) window.Editor.open();
    };

    // Finder Search
    const search = document.getElementById('finderSearch');
    if(search) {
        search.oninput = (e) => {
            const val = e.target.value.toLowerCase();
            const items = document.querySelectorAll('#finderMain .grid > div');
            items.forEach(el => {
                const txt = el.innerText.toLowerCase();
                el.style.display = txt.includes(val) ? 'flex' : 'none';
            });
        };
    }
}

// --- 3D Background Implementation ---
function initThreeJSBackground() { 
    if(window.bgAnimationPaused) return; 
    const cvs = document.getElementById('bg-canvas'); 
    if(!window.THREE || !cvs) return; 
    
    if(cvs.dataset.init === "true") return;
    cvs.dataset.init = "true";

    const scene = new THREE.Scene(); 
    const cam = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000); 
    const renderer = new THREE.WebGLRenderer({canvas:cvs, alpha:true}); 
    renderer.setSize(window.innerWidth, window.innerHeight); 
    renderer.setPixelRatio(window.devicePixelRatio);
    
    const geo = new THREE.BufferGeometry(); 
    const cnt = 600; 
    const pos = new Float32Array(cnt * 3); 
    for(let i=0; i<cnt*3; i++) pos[i] = (Math.random()-0.5) * 15; 
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); 
    const mat = new THREE.PointsMaterial({size: 0.03, color: 0x60a5fa, transparent: true, opacity: 0.8}); 
    const mesh = new THREE.Points(geo, mat); 
    scene.add(mesh); 
    
    cam.position.z = 5; 
    
    const animate = () => { 
        if(window.bgAnimationPaused) return;
        requestAnimationFrame(animate); 
        mesh.rotation.y += 0.0005; 
        mesh.rotation.x += 0.0002;
        renderer.render(scene, cam); 
    }; 
    animate();
    
    window.addEventListener('resize', () => {
        cam.aspect = window.innerWidth / window.innerHeight;
        cam.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}
