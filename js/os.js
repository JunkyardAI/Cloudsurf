// --- MODULE: CONTEXT_MENU ---
function initContextMenu() {
    const menu = $('contextMenu');
    document.addEventListener('click', () => menu.classList.add('hidden'));
    
    window.showContext = (e, app) => { 
        e.preventDefault(); 
        e.stopPropagation(); 
        
        // Dynamic Pin Action
        const isPinned = app.onDesktop;
        const pinAction = isPinned 
            ? `<div class="ctx-item" onclick="togglePin('${app.id}')"><span class="material-symbols-outlined text-sm">keep_off</span> Unpin from Desktop</div>`
            : `<div class="ctx-item" onclick="togglePin('${app.id}')"><span class="material-symbols-outlined text-sm">push_pin</span> Pin to Desktop</div>`;

        menu.innerHTML = `
            <div class="ctx-item" onclick="WindowManager.openApp(all.find(x=>x.id==='${app.id}'))"><span class="material-symbols-outlined text-sm">open_in_new</span> Open App</div>
            <div class="ctx-item" onclick="openEditor('${app.id}')"><span class="material-symbols-outlined text-sm">code</span> Edit Code</div>
            <div class="ctx-sep"></div>
            ${pinAction}
            <div class="ctx-item" onclick="openIconPickerFor('${app.id}')"><span class="material-symbols-outlined text-sm">image</span> Change Icon</div>
            <div class="ctx-sep"></div>
            <div class="ctx-item text-red-400 hover:bg-red-900/50" onclick="deleteApp('${app.id}')"><span class="material-symbols-outlined text-sm">delete</span> Delete</div>`; 
            
        menu.style.left = e.pageX + 'px'; 
        menu.style.top = e.pageY + 'px'; 
        menu.classList.remove('hidden'); 
    };
}

// --- MODULE: APP ACTIONS ---
window.togglePin = async (id) => {
    const app = all.find(x => x.id === id);
    if(app) {
        app.onDesktop = !app.onDesktop;
        await dbOp('put', app);
        all = await dbOp('get');
        renderDesktopIcons();
        renderFinder(); // Refresh finder to update context menu state if reopened
        notify(app.onDesktop ? "Pinned to Desktop" : "Unpinned from Desktop");
    }
    $('contextMenu').classList.add('hidden');
};

// --- MODULE: ICON_PICKER ---
let pendingIconAppId = null;
function openIconPickerFor(appId) { pendingIconAppId = appId; $('iconPickerModal').classList.remove('hidden'); }
function initIconPicker() {
    const grid = $('iconGrid');
    GOOGLE_ICONS.forEach(icon => {
        const div = document.createElement('div'); div.className = 'icon-option'; div.innerHTML = `<span class="material-symbols-outlined">${icon}</span>`;
        div.onclick = () => {
            if(pendingIconAppId) { const app = all.find(x => x.id === pendingIconAppId); if(app) { app.iconUrl = icon; dbOp('put', app).then(async ()=>{ all=await dbOp('get'); renderDesktopIcons(); renderFinder(); WindowManager.removeFromDock(app.id); if(WindowManager.windows.has(app.id)) WindowManager.addToDock(app); }); } pendingIconAppId = null; } else { $('saveIcon').value = icon; $('inIcon').value = icon; } $('iconPickerModal').classList.add('hidden');
        };
        grid.appendChild(div);
    });
    $('btnOpenIconPickerModal').onclick = () => { pendingIconAppId = null; $('iconPickerModal').classList.remove('hidden'); };
    $('btnOpenIconPicker').onclick = () => { pendingIconAppId = null; $('iconPickerModal').classList.remove('hidden'); };
    $('iconSearchInput').oninput = (e) => { const v = e.target.value.toLowerCase(); document.querySelectorAll('.icon-option').forEach(el => { el.style.display = el.innerText.includes(v) ? 'flex' : 'none'; }); };
}

// --- MODULE: EXPORTER ---
async function exportSystemSource() {
    if(!window.JSZip) { notify("JSZip not loaded", true); return; }
    const zip = new JSZip();
    
    // Create Clean HTML (No inline scripts)
    let html = document.documentElement.outerHTML;
    // Strip the data-injected stuff
    html = html.replace(/<script id="main-script">[\s\S]*?<\/script>/, '<script src="js/core.js"><\/script><script src="js/db.js"><\/script><script src="js/wm.js"><\/script><script src="js/editor.js"><\/script><script src="js/os.js"><\/script>');
    html = html.replace(/<style id="main-style">[\s\S]*?<\/style>/, '<link rel="stylesheet" href="css/style.css">');
    zip.file("index.html", html);
    zip.file("README.md", "# Cloudstax OS Source\n\nModular source export.\n\n## Running\nOpen `index.html` in browser.");
    
    const css = document.getElementById('main-style') ? document.getElementById('main-style').innerText : '';
    if(css) zip.file("css/style.css", css);
    
    // In a real modular env, we would just fetch the files. 
    try {
        const fetchSafe = async (path) => { try { return await (await fetch(path)).text(); } catch { return "// Module not found"; } };
        zip.file("js/core.js", await fetchSafe('js/core.js'));
        zip.file("js/db.js", await fetchSafe('js/db.js'));
        zip.file("js/wm.js", await fetchSafe('js/wm.js'));
        zip.file("js/editor.js", await fetchSafe('js/editor.js'));
        zip.file("js/os.js", await fetchSafe('js/os.js'));
    } catch(e) {
        notify("Warning: Could not fetch separate source files for export.", true);
    }
    
    const blob = await zip.generateAsync({type:"blob"});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = "cloudstax-os-source.zip";
    a.click();
}

// --- MODULE: BOOTSTRAP & FINDER ---
let finderMode = 'grid'; // 'grid' or 'list'

function toggleFinderView() {
    finderMode = finderMode === 'grid' ? 'list' : 'grid';
    // Update button visual
    const icon = finderMode === 'grid' ? 'grid_view' : 'list';
    const btn = document.getElementById('btnToggleView');
    if(btn) btn.innerHTML = `<span class="material-symbols-outlined text-sm">${icon}</span>`;
    renderFinder();
}

function renderFinder() {
    const stacks = [...new Set(all.map(a => a.stack || 'General'))].sort();
    
    // Sidebar
    $('finderSidebar').innerHTML = '<div class="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-2 mb-2 mt-2">Stacks</div>';
    const allBtn = document.createElement('div'); allBtn.className = 'mono-list-item text-xs text-gray-300 py-1 cursor-pointer hover:text-white mb-2'; allBtn.textContent = 'All Apps'; allBtn.onclick = () => renderFinderFiles(all); $('finderSidebar').appendChild(allBtn);
    stacks.forEach(s => { const d = document.createElement('div'); d.className = 'mono-list-item text-xs text-gray-400 py-1 cursor-pointer'; d.textContent = s; d.onclick = () => renderFinderFiles(all.filter(a => (a.stack||'General') === s)); $('finderSidebar').appendChild(d); });
    
    // Inject Toggle Button if not exists
    if(!document.getElementById('btnToggleView')) {
        const headerRight = document.querySelector('#appLauncher .border-b .w-10');
        if(headerRight) {
            headerRight.className = 'flex items-center justify-end';
            headerRight.innerHTML = `<button id="btnToggleView" class="text-gray-400 hover:text-white p-1" onclick="toggleFinderView()"><span class="material-symbols-outlined text-sm">list</span></button>`;
        }
    }

    renderFinderFiles(all);
}

function renderFinderFiles(list) {
    const container = $('finderMain');
    container.innerHTML = ''; 
    $('finderStatus').textContent = `${list.length} items`;
    
    if(list.length === 0) { container.innerHTML = '<div class="text-gray-600 text-xs font-mono text-center mt-10">No items found</div>'; return; }
    
    if (finderMode === 'grid') {
        const grid = document.createElement('div'); grid.className = 'grid grid-cols-4 gap-4';
        list.forEach(app => {
            const item = document.createElement('div'); item.className = 'flex flex-col items-center group cursor-pointer p-2 rounded hover:bg-white/5 transition'; item.onclick = () => { WindowManager.openApp(app); WindowManager.toggleLauncher(); }; item.oncontextmenu = (e) => showContext(e, app);
            let iconHtml; if (app.iconUrl) iconHtml = `<div class="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center text-white shadow mb-2 group-hover:scale-105 transition">${renderIconHtml(app.iconUrl, "text-2xl")}</div>`; else if (sIcons.get(app.stack)) iconHtml = `<div class="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center text-2xl shadow mb-2 group-hover:scale-105 transition">${sIcons.get(app.stack)}</div>`; else { const bg = app.type === 'html' ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'linear-gradient(135deg, #4b5563, #374151)'; const txt = app.type === 'html' ? '</>' : '🔗'; iconHtml = `<div class="w-12 h-12 rounded-lg flex items-center justify-center text-xl text-white shadow mb-2 group-hover:scale-105 transition" style="background:${bg}">${txt}</div>`; }
            item.innerHTML = `${iconHtml}<div class="text-xs text-gray-300 font-mono text-center truncate w-full group-hover:text-white">${app.name}</div>`; grid.appendChild(item);
        });
        container.appendChild(grid);
    } else {
        // List View
        const listContainer = document.createElement('div'); listContainer.className = 'flex flex-col gap-1';
        list.forEach(app => {
             const row = document.createElement('div');
             row.className = 'flex items-center gap-3 p-2 rounded hover:bg-white/10 cursor-pointer border-b border-gray-800/50';
             row.onclick = () => { WindowManager.openApp(app); WindowManager.toggleLauncher(); };
             row.oncontextmenu = (e) => showContext(e, app);
             
             const smallIcon = app.iconUrl ? renderIconHtml(app.iconUrl, "text-lg") : (app.type==='html'?'<span class="material-symbols-outlined text-blue-400 text-lg">code</span>':'<span class="material-symbols-outlined text-gray-400 text-lg">link</span>');
             
             row.innerHTML = `
                <div class="w-6 flex justify-center">${smallIcon}</div>
                <div class="flex-1 text-xs text-gray-200 font-medium">${app.name}</div>
                <div class="text-[10px] text-gray-500 font-mono uppercase w-20 text-right">${app.stack || 'General'}</div>
             `;
             listContainer.appendChild(row);
        });
        container.appendChild(listContainer);
    }
}

window.openSettings = () => { $('settings-app').classList.remove('hidden'); WindowManager.zIndex++; $('settings-app').style.zIndex = WindowManager.zIndex; loadSettingsUI(); }
window.switchSettingsTab = (tab) => { document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active')); document.querySelectorAll('[id^="settings-content-"]').forEach(c => c.classList.add('hidden')); event.target.classList.add('active'); $(`settings-content-${tab}`).classList.remove('hidden'); }
function loadSettingsUI() { const stacks = [...new Set(all.map(b=>b.stack||"General"))].sort(); const h = stacks.map(x=>` <div class="flex justify-between items-center py-2 border-b border-gray-800"> <label class="text-xs text-gray-400 w-1/3 truncate">${esc(x)}</label> <input class="stack-icon-input bg-gray-800 text-white rounded text-xs p-1 border border-gray-700 w-1/2" data-stack="${esc(x)}" value="${sIcons.get(x)||''}" placeholder="Emoji/Icon"> </div>`).join(''); $('stackIconList').innerHTML = h; }

async function init() {
    try {
        $('saveBtn').onclick = () => { $('saveName').value = $('inName').value; $('saveOptionsModal').classList.remove('hidden'); };
        $('btnConfirmSave').onclick = saveCurrentApp; 
        $('downloadCodeBtn').onclick = downloadRawCode; 
        $('createNewAppBtn').onclick = () => { WindowManager.toggleLauncher(); openEditor(); }; 
        $('refreshPreview').onclick = () => updatePreview({type: 'html', html: editorCM.getValue()}); 
        $('popOutPreview').onclick = () => { const w = window.open('','_blank'); w.document.write(editorCM.getValue()); w.document.close(); }; 
        $('toggleConsole').onclick = () => { $('editorConsole').classList.toggle('translate-y-full'); }; 
        $('finderSearch').oninput = (e) => { const term = e.target.value.toLowerCase(); renderFinderFiles(all.filter(a => a.name.toLowerCase().includes(term))); }; 
        $('libInj').onchange = (e) => { if(e.target.value) { editorCM.replaceRange(e.target.value + '\n', {line:0, ch:0}); e.target.value=''; } };
        $('editorFileImport').onchange = e => { const f = e.target.files[0]; if(f){ const r=new FileReader(); r.onload=v=>{ editorCM.setValue(v.target.result); $('inName').value = f.name.replace(/\.[^/.]+$/, ""); }; r.readAsText(f); } }; 
        $('editorClearBtn').onclick = () => { if(confirm("Clear Code?")) editorCM.setValue(''); };
        $('btnExport').onclick = () => { const a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(all)); a.download = 'Cloudstax_Backup.json'; a.click(); }; 
        $('btnImport').onclick = () => { const f = $('fileImport').files[0]; if(f){ const r = new FileReader(); r.onload = async e => { try { const d = JSON.parse(e.target.result); for(const i of d) { if(!all.find(x=>x.id===i.id)) await dbOp('put', i); } all = await dbOp('get'); renderFinder(); notify("Import Successful"); } catch { notify("Invalid JSON", true); } }; r.readAsText(f); } }; 
        $('btnTools').onclick = async () => { try { const r = await fetch('https://junkyardai.github.io/Cloudstax-Default-Tools/'); const t = await r.text(); const p = new DOMParser().parseFromString(t,'text/html'); let count = 0; p.querySelectorAll('a').forEach(async a=>{ if(a.href.startsWith('http')){ await dbOp('put',{id:crypto.randomUUID(),name:a.innerText,url:a.href,stack:"Tools",iconUrl:'',createdAt:new Date().toISOString(),type:'link'}); count++; } }); setTimeout(async ()=>{ all = await dbOp('get'); notify(`Added ${count} tools`); renderDesktopIcons(); }, 1000); } catch { notify("Fetch Error", true); } };
        $('btnSaveIcons').onclick = () => { document.querySelectorAll('.stack-icon-input').forEach(s => sIcons.set(s.dataset.stack, s.value)); localStorage.setItem('cs_icons', JSON.stringify(Object.fromEntries(sIcons))); notify("Icons Saved"); renderFinder(); };
        
        // FORMAT BUTTON
        const btnFormat = document.createElement('button');
        btnFormat.className = 'text-gray-400 hover:text-blue-400 transition';
        btnFormat.title = "Prettify Code";
        btnFormat.innerHTML = '<span class="material-symbols-outlined text-lg">format_align_left</span>';
        btnFormat.onclick = () => {
             const totalLines = editorCM.lineCount();
             editorCM.autoFormatRange({line:0, ch:0}, {line:totalLines});
             for (let i = 0; i < totalLines; i++) editorCM.indentLine(i);
        };
        const dlBtn = $('downloadCodeBtn');
        if(dlBtn) dlBtn.before(btnFormat);

        // EXPORT BUTTON
        $('btnExportSource').onclick = exportSystemSource;

        window.addEventListener('message', e => { 
            if(e.data?.type === 'log') { 
                const ln = document.createElement('div'); 
                ln.className = e.data.level==='error'?'text-red-400 border-l-2 border-red-500 pl-1':(e.data.level==='warn'?'text-yellow-400':'text-gray-400'); 
                ln.textContent = `> ${e.data.message}`; 
                const consoleEl = $('editorConsole');
                if(consoleEl) consoleEl.prepend(ln); 
            } 
        });
        $('desktop').oncontextmenu = (e) => { e.preventDefault(); $('contextMenu').classList.add('hidden'); };
        
        // KEYBOARD SHORTCUTS
        document.addEventListener('keydown', e => {
            if((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveCurrentApp(); }
            if((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); updatePreview({type: 'html', html: editorCM.getValue()}); }
        });

        editorCM = CodeMirror($('editorContainer'), { mode: "htmlmixed", theme: "dracula", lineNumbers: true, viewportMargin: Infinity, value: "<!-- Select an app to edit -->" });
        editorCM.on('change', debounce(() => { if(currentAppId) updatePreview({ type: 'html', html: editorCM.getValue() }); }, 1000));
        
        new ResizeObserver(() => editorCM.refresh()).observe($('editorContainer'));

        setupResizer(); initBackground(); initIconPicker(); initContextMenu();
        await initDB(); try { all = await dbOp('get'); try{ sIcons=new Map(Object.entries(JSON.parse(localStorage.getItem('cs_icons'))||{})); }catch{ sIcons=new Map(); } } catch { all = []; } renderDesktopIcons();
        setInterval(() => { const d = new Date(); $('sys-clock').textContent = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); }, 1000);
    } catch (e) { console.error(e); notify("System Init Error: " + e.message, true); }
}

async function saveCurrentApp() {
    try {
        if(!currentAppId) { notify("No App Selected", true); return; }
        const appName = $('saveName').value || $('inName').value || 'Untitled';
        const app = { id: currentAppId, name: appName, stack: $('saveStack').value || 'General', iconUrl: $('saveIcon').value, isFavorite: $('saveFav').checked, onDesktop: $('savePin').checked, type: 'html', html: editorCM.getValue(), createdAt: new Date().toISOString() };
        await dbOp('put', app); all = await dbOp('get'); $('inName').value = appName; $('saveOptionsModal').classList.add('hidden'); notify('Saved Successfully'); renderDesktopIcons(); renderFinder(); WindowManager.removeFromDock(app.id); const win = WindowManager.windows.get(app.id); if(win) WindowManager.addToDock(app);
    } catch(e) { notify("Save Failed: " + e.message, true); }
}
function renderDesktopIcons() { const grid = $('desktop-grid'); grid.innerHTML = ''; grid.appendChild(createDesktopIcon('Code Manager', '🛠️', () => openEditor())); grid.appendChild(createDesktopIcon('Finder', '📂', () => WindowManager.toggleLauncher())); all.filter(x => x.onDesktop).forEach(app => { const div = createDesktopIcon(app.name, app.iconUrl || '🚀', () => WindowManager.openApp(app)); div.oncontextmenu = (e) => showContext(e, app); grid.appendChild(div); }); }
function createDesktopIcon(label, iconVal, onClick) { const d = document.createElement('div'); d.className = 'desktop-icon pointer-events-auto'; d.onclick = onClick; d.innerHTML = `<div class="desktop-icon-img text-2xl bg-gray-800">${renderIconHtml(iconVal)}</div><span class="text-[10px] font-medium mt-1 text-center leading-tight bg-black/50 px-1 rounded truncate w-full">${esc(label)}</span>`; return d; }
function setupResizer() {
    const resizer = $('mainResizer'); const left = $('editorLeft'); let x = 0, w = 0, dragging = false;
    const onMove = e => { if(!dragging) return; const newW = w + e.clientX - x; left.style.width = `${newW}px`; lastSplitWidth = `${newW}px`; };
    const onUp = () => { dragging = false; resizer.classList.remove('resizing'); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); $('editorPreviewFrame').style.pointerEvents = 'auto'; };
    resizer.addEventListener('mousedown', e => { x = e.clientX; w = left.getBoundingClientRect().width; dragging = true; resizer.classList.add('resizing'); $('editorPreviewFrame').style.pointerEvents = 'none'; document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); });
}
function initBackground() { const cvs = $('bg-canvas'); if(!window.THREE) return; const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000); const renderer = new THREE.WebGLRenderer({canvas:cvs, alpha:true}); renderer.setSize(window.innerWidth, window.innerHeight); const geo = new THREE.BufferGeometry(); const cnt = 200; const pos = new Float32Array(cnt * 3); for(let i=0; i<cnt*3; i++) pos[i] = (Math.random()-0.5) * 10; geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const mat = new THREE.PointsMaterial({size: 0.05, color: 0x3b82f6}); const mesh = new THREE.Points(geo, mat); scene.add(mesh); cam.position.z = 5; const animate = () => { requestAnimationFrame(animate); mesh.rotation.x += 0.001; mesh.rotation.y += 0.001; renderer.render(scene, cam); }; animate(); window.addEventListener('resize', () => { cam.aspect = window.innerWidth / window.innerHeight; cam.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); }); }
function debounce(f,t){let h;return(...a)=>{clearTimeout(h);h=setTimeout(()=>f(...a),t)}}
window.addEventListener('DOMContentLoaded', init);
