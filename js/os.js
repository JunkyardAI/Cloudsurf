// --- MODULE: OS (Startup & Shell) ---
window.all = []; 
window.bgAnimationPaused = false;

window.init = async function() {
    console.log("OS: Booting...");

    // 1. Immediate Render (Fail-Safe)
    window.renderDesktopIcons();
    window.renderFinder();

    // 2. Initialize Database
    try {
        if (window.initDB) {
            await window.initDB();
            await window.refreshApps();
        }
    } catch(e) { 
        console.error("DB Init Failed", e); 
    }

    // 3. Background
    try {
        if(window.initBackground) window.initBackground();
    } catch(e) { console.warn("Background failed", e); }

    // 4. Listeners
    if(typeof setupListeners === 'function') setupListeners();

    // 5. Hide Boot Screen
    const boot = document.getElementById('boot-screen');
    if (boot) {
        setTimeout(() => {
            boot.style.opacity = '0';
            setTimeout(() => boot.remove(), 500);
        }, 500);
    }
};

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
            // SAFE CALL
            action: () => { if(window.Editor && window.Editor.open) window.Editor.open(); }
        },
        {
            id: 'finder',
            name: 'Finder',
            iconUrl: 'folder_open',
            type: 'system',
            action: () => WindowManager.toggleLauncher()
        }
    ];

    systemApps.forEach(app => {
        const el = createIconElement(app, app.iconUrl.includes('/'));
        el.onclick = app.action;
        desktop.appendChild(el);
    });

    // 2. USER APPS
    for (const app of window.all.filter(app => app.onDesktop)) {
        let iconHtml = renderIconHtml(app.iconUrl, "text-2xl");
        
        if (app.iconUrl && (app.iconUrl.startsWith('./') || app.iconUrl.startsWith('/'))) {
             if (WindowManager.resolveAppIcon) {
                 iconHtml = await WindowManager.resolveAppIcon(app, "text-2xl");
             }
        }
        
        const el = document.createElement('div');
        el.className = "flex flex-col items-center gap-2 p-2 rounded cursor-pointer group w-[90px]";
        el.innerHTML = `
            <div class="w-12 h-12 bg-gray-800/80 rounded-xl flex items-center justify-center text-white shadow-lg border border-white/10 group-hover:scale-105 transition-transform">
                ${iconHtml}
            </div>
            <span class="text-xs text-center text-gray-200 font-medium drop-shadow-md truncate w-full px-1">${esc(app.name)}</span>
        `;
        
        el.onclick = () => WindowManager.openApp(app);
        el.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if(window.showContextMenu) window.showContextMenu(e, app);
        };
        desktop.appendChild(el);
    }
};

function createIconElement(app, isImg) {
    const el = document.createElement('div');
    el.className = "flex flex-col items-center gap-2 p-2 rounded cursor-pointer group w-[90px]";
    el.innerHTML = `
        <div class="w-12 h-12 bg-gray-800/80 rounded-xl flex items-center justify-center text-white shadow-lg border border-white/10 group-hover:scale-105 transition-transform">
            ${renderIconHtml(app.iconUrl, "text-2xl")}
        </div>
        <span class="text-xs text-center text-gray-200 font-medium drop-shadow-md truncate w-full px-1">${esc(app.name)}</span>
    `;
    return el;
}

window.renderFinder = function() {
    const finderMain = document.getElementById('finderMain');
    const finderSide = document.getElementById('finderSidebar');
    if (!finderMain || !finderSide) return;

    finderMain.innerHTML = '';
    finderSide.innerHTML = `<div class="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-2 mb-2 mt-2">Stacks</div>`;
    
    // Group Stacks
    const stacks = new Set(['All']);
    window.all.forEach(app => { if(app.stack) stacks.add(app.stack); });

    stacks.forEach(s => {
        const item = document.createElement('div');
        item.className = 'px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded cursor-pointer';
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
        el.className = "flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-800 cursor-pointer transition";
        el.innerHTML = `
            <div class="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center text-white">
                ${renderIconHtml(app.iconUrl, "text-xl")}
            </div>
            <span class="text-xs text-gray-300 text-center truncate w-full">${esc(app.name)}</span>
        `;
        el.onclick = () => {
            WindowManager.openApp(app);
            WindowManager.toggleLauncher(); 
        };
        el.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if(window.showContextMenu) window.showContextMenu(e, app);
        };
        grid.appendChild(el);
    });
    
    list.appendChild(grid);
    const status = document.getElementById('finderStatus');
    if(status) status.innerText = `${apps.length} items`;
};

// --- Context Menu Logic ---
window.showContextMenu = function(e, app) {
    const menu = document.getElementById('contextMenu');
    if(!menu) return;

    menu.innerHTML = `
        <div onclick="WindowManager.openApp(window.all.find(a=>a.id==='${app.id}'))" class="ctx-item flex items-center gap-2">
            <span class="material-symbols-outlined text-sm text-gray-400">open_in_new</span> Open
        </div>
        <div onclick="if(window.Editor) window.Editor.open('${app.id}')" class="ctx-item flex items-center gap-2">
            <span class="material-symbols-outlined text-sm text-gray-400">edit</span> Edit Source
        </div>
        <div class="h-px bg-gray-700 my-1"></div>
        <div onclick="window.deleteApp('${app.id}')" class="ctx-item flex items-center gap-2 text-red-400 hover:text-red-300">
            <span class="material-symbols-outlined text-sm">delete</span> Delete
        </div>
    `;

    menu.style.display = 'flex';
    menu.classList.remove('hidden');
    
    let x = e.clientX;
    let y = e.clientY;
    
    // Boundary check to keep menu on screen
    if (x + 150 > window.innerWidth) x = window.innerWidth - 160;
    if (y + 120 > window.innerHeight) y = window.innerHeight - 130;
    
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
};

window.hideContextMenu = function() {
    const menu = document.getElementById('contextMenu');
    if(menu) menu.classList.add('hidden');
};

window.deleteApp = async function(id) {
    if(confirm("Are you sure you want to delete this app?")) {
        try {
            await window.dbOp('delete', id);
            if(window.notify) notify("App Deleted");
            
            window.all = window.all.filter(a => a.id !== id);
            window.renderDesktopIcons();
            window.renderFinder(); 
            
            if(WindowManager.windows.has(id)) WindowManager.close(id);
        } catch(e) {
            console.error(e);
            notify("Delete Failed", true);
        }
    }
    window.hideContextMenu();
};

function setupListeners() {
    const btn = document.getElementById('createNewAppBtn');
    if(btn) btn.onclick = () => {
        WindowManager.toggleLauncher();
        // SAFE CALL
        if(window.Editor && window.Editor.open) window.Editor.open();
    };

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

// Background Animation (Three.js)
window.initBackground = function() { 
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
};
