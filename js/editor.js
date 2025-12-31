// --- MODULE: EDITOR 5.0 (Full System Upgrade) ---

window.Editor = {
    // State
    state: {
        files: {},           
        activeFilePath: null,
        appId: null,
        mode: 'split',       
        blobs: [],           
        consoleHeight: '128px',
        expandedFolders: new Set(),
        initialized: false
    },

    // --- Core Lifecycle ---

    open: function(appId = null) {
        const appWin = document.getElementById('editor-app');
        if(!appWin) return;
        
        // 1. UI Reset & Layering
        appWin.classList.remove('hidden', 'minimized');
        if(window.WindowManager) {
            WindowManager.zIndex++;
            appWin.style.zIndex = WindowManager.zIndex;
        }
        
        // 2. State Reset
        this.state.appId = appId;
        this.revokeBlobs();

        // 3. Init Integrations (One-time)
        if (!this.state.initialized) {
            this.initDeepIntegrations();
            this.bindShortcuts();
            this.state.initialized = true;
        }

        // 4. Load or New
        if (appId) {
            this.loadApp(appId);
        } else {
            this.resetToEmpty();
        }

        this.setLayout(this.state.mode);
        this.updateCategoryDropdown(); // Populate "Stack" options
    },

    revokeBlobs: function() {
        this.state.blobs.forEach(url => URL.revokeObjectURL(url));
        this.state.blobs = [];
    },

    loadApp: async function(appId) {
        // Try to get fresh from DB first
        let app = (typeof all !== 'undefined' ? all : []).find(x => x.id === appId);
        if(window.dbOp) {
            const dbApp = await window.dbOp('get', appId);
            if(dbApp) app = dbApp; // Use detailed DB record
        }

        if(!app) return this.resetToEmpty();

        // Load Metadata
        this.setFieldValue('inName', app.name);
        this.setFieldValue('inStack', app.stack || 'Development');
        this.setFieldValue('inIcon', app.iconUrl || '');
        this.setCheckValue('chkFav', app.isFavorite || false);
        this.setCheckValue('chkDesk', app.onDesktop || false);
        
        // Load Files (Deep Clone to avoid ref issues)
        this.state.files = JSON.parse(JSON.stringify(app.files || {}));
        
        // Render
        this.renderTree();

        const entry = this.findEntryPoint();
        if(entry) this.switchFile(entry);
        else if (window.editorCM && app.html) window.editorCM.setValue(app.html);

        this.refreshPreview();
    },

    resetToEmpty: function() {
        this.state.appId = crypto.randomUUID();
        this.state.files = {
            'index.html': {
                content: '<!DOCTYPE html>\n<html>\n<head>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>New Project</h1>\n  <script src="app.js"></script>\n</body>\n</html>',
                type: 'text'
            },
            'style.css': { content: 'body { background: #111; color: white; font-family: sans-serif; }', type: 'text' },
            'app.js': { content: 'console.log("Hello World");', type: 'text' }
        };
        this.state.activeFilePath = 'index.html';
        this.setFieldValue('inName', "Untitled Project");
        this.setFieldValue('inStack', "Development");
        
        document.getElementById('file-tree').classList.remove('hidden'); 
        this.renderTree();
        
        if(window.editorCM) window.editorCM.setValue(this.state.files['index.html'].content);
        
        // REMOVED auto scaffold timer
        this.refreshPreview();
    },

    // --- Advanced File Operations ---

    switchFile: function(path) {
        this.syncCurrentFile();
        this.state.activeFilePath = path;
        const file = this.state.files[path];
        if(!file) return;
        
        const isImage = this.isBinaryFile(path);
        const isSvg = path.toLowerCase().endsWith('.svg');
        
        this.toggleImagePreview(isImage || isSvg, file);

        if (!isImage && window.editorCM) {
            if(isSvg) this.toggleImagePreview(false, null); // Edit SVG as text

            window.editorCM.setValue(file.content || "");
            window.editorCM.setOption('readOnly', false);
            window.editorCM.clearHistory();
            
            // Mode Auto-Detection
            const ext = path.split('.').pop().toLowerCase();
            const modeMap = { 
                'js': 'javascript', 'jsx': 'jsx', 'ts': 'text/typescript',
                'html': 'htmlmixed', 'css': 'css', 'json': 'application/json', 
                'md': 'markdown', 'xml': 'xml', 'svg': 'xml'
            };
            window.editorCM.setOption('mode', modeMap[ext] || 'htmlmixed');
            
            const modeDisplay = document.getElementById('sb-mode');
            if(modeDisplay) modeDisplay.textContent = modeMap[ext] || 'text';
        }

        this.highlightActiveFile(path);
        this.updateStatusBar();
    },

    newFile: function() {
        const name = prompt("File path (e.g. css/style.css):");
        if(name) {
            const cleanName = window.normalizePath(name);
            if(this.state.files[cleanName]) { window.notify("File exists", true); return; }
            this.state.files[cleanName] = { content: "", type: "text" };
            this.renderTree();
            this.switchFile(cleanName);
        }
    },

    deleteFile: function(path) {
        if(confirm(`Delete ${path}?`)) {
            delete this.state.files[path];
            if(this.state.activeFilePath === path) {
                this.state.activeFilePath = null;
                if(window.editorCM) window.editorCM.setValue("");
            }
            this.renderTree();
            this.refreshPreview();
        }
    },

    // --- ROBUST IMPORT ENGINE (The Fix) ---

    triggerFolderImport: function() {
        let input = document.getElementById('folderImportInput');
        if(!input) {
            input = document.createElement('input');
            input.id = 'folderImportInput';
            input.type = 'file';
            input.webkitdirectory = true; 
            input.directory = true;
            input.multiple = true;
            input.style.display = 'none';
            input.onchange = (e) => this.handleInputImport(e);
            document.body.appendChild(input);
        }
        input.value = ''; // Reset
        input.click();
    },

    handleInputImport: async function(e) {
        const files = Array.from(e.target.files);
        if(files.length === 0) return;

        // Use webkitRelativePath for structure (e.g. "MyProject/css/style.css")
        const batch = files.map(f => ({
            entry: f,
            path: f.webkitRelativePath || f.name
        }));
        
        await this.processImportBatch(batch);
    },

    handleDropImport: async function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const items = e.dataTransfer.items;
        const entries = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i].webkitGetAsEntry();
            if (item) {
                await this.scanEntryRecursive(item, "", entries);
            }
        }
        
        if (entries.length > 0) {
            await this.processImportBatch(entries);
        }
    },

    scanEntryRecursive: async function(entry, path, resultList) {
        if (entry.isFile) {
            return new Promise((resolve) => {
                entry.file((file) => {
                    // Normalize path separators
                    resultList.push({ entry: file, path: (path + file.name).replace(/\/+/g, '/') });
                    resolve();
                });
            });
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            const readEntries = async () => {
                const entries = await new Promise((res) => reader.readEntries(res));
                if (entries.length === 0) return;
                
                const promises = entries.map(child => this.scanEntryRecursive(child, path + entry.name + "/", resultList));
                await Promise.all(promises);
                await readEntries(); // Continue reading batch
            };
            await readEntries();
        }
    },

    processImportBatch: async function(fileObjects) {
        window.notify(`Importing ${fileObjects.length} files...`);
        
        // 1. Root Detection
        // If all files share the same first folder, strip it and use it as project name
        const firstPath = fileObjects[0].path;
        const rootMatch = firstPath.match(/^([^/]+)\//);
        let rootPrefix = "";
        
        if (rootMatch) {
            const potentialRoot = rootMatch[1];
            const allMatch = fileObjects.every(f => f.path.startsWith(potentialRoot + "/"));
            if (allMatch) {
                rootPrefix = potentialRoot + "/";
                this.setFieldValue('inName', potentialRoot); 
            }
        }

        const newVFS = {};
        const textExtensions = new Set(['js','jsx','ts','tsx','html','css','scss','json','md','txt','svg','xml','gitignore','env']);

        // 2. Processing
        const promises = fileObjects.map(async (f) => {
            const rawPath = f.path;
            let finalPath = rawPath.startsWith(rootPrefix) ? rawPath.slice(rootPrefix.length) : rawPath;
            finalPath = window.normalizePath(finalPath);
            
            // Skip junk
            if(finalPath.includes('.git/') || finalPath.includes('node_modules/') || finalPath.startsWith('.')) return;

            const ext = finalPath.split('.').pop().toLowerCase();
            const isText = textExtensions.has(ext);

            if (isText) {
                const text = await f.entry.text();
                newVFS[finalPath] = { content: text, type: 'text' };
            } else {
                newVFS[finalPath] = { content: f.entry, type: 'blob' }; // Store actual File object
            }
        });

        await Promise.all(promises);

        // 3. Merge
        this.state.files = { ...this.state.files, ...newVFS };
        this.renderTree();
        
        const index = this.findEntryPoint();
        if(index) this.switchFile(index);
        
        window.notify("Import Complete");
        this.refreshPreview();
    },

    // --- Tree & Visualization ---

    renderTree: function() {
        const treeContainer = document.getElementById('fileTreeContent');
        if(!treeContainer) return;
        treeContainer.innerHTML = '';
        
        const files = this.state.files;
        
        // Build Hierarchy
        const root = { name: 'root', children: {}, files: [] };
        
        Object.keys(files).forEach(path => {
            const parts = path.split('/');
            const fileName = parts.pop();
            let current = root;
            
            parts.forEach(part => {
                if (!current.children[part]) {
                    current.children[part] = { name: part, children: {}, files: [] };
                }
                current = current.children[part];
            });
            
            current.files.push({ name: fileName, fullPath: path });
        });

        this.renderFolder(root, treeContainer, 0);
    },

    renderFolder: function(folder, container, depth) {
        // Folders
        Object.keys(folder.children).sort().forEach(folderName => {
            const subFolder = folder.children[folderName];
            const folderDiv = document.createElement('div');
            folderDiv.className = 'ml-2';
            
            const isExpanded = depth < 2; // Auto expand first few levels
            
            const label = document.createElement('div');
            label.className = 'flex items-center gap-1 text-gray-400 hover:text-white cursor-pointer py-0.5 select-none';
            label.style.paddingLeft = `${depth * 8}px`;
            label.innerHTML = `
                <span class="material-symbols-outlined text-[14px] transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}">chevron_right</span>
                <span class="text-xs font-bold text-blue-200/70">${folderName}</span>
            `;
            
            const childrenContainer = document.createElement('div');
            childrenContainer.className = isExpanded ? 'block' : 'hidden';

            label.onclick = (e) => {
                e.stopPropagation();
                const arrow = label.querySelector('.material-symbols-outlined');
                if (childrenContainer.classList.contains('hidden')) {
                    childrenContainer.classList.remove('hidden');
                    arrow.classList.add('rotate-90');
                } else {
                    childrenContainer.classList.add('hidden');
                    arrow.classList.remove('rotate-90');
                }
            };

            folderDiv.appendChild(label);
            folderDiv.appendChild(childrenContainer);
            container.appendChild(folderDiv);

            this.renderFolder(subFolder, childrenContainer, depth + 1);
        });

        // Files
        folder.files.sort((a,b) => a.name.localeCompare(b.name)).forEach(file => {
            const fileDiv = document.createElement('div');
            const isActive = file.fullPath === this.state.activeFilePath;
            
            fileDiv.className = `flex items-center gap-2 py-1 cursor-pointer text-xs rounded transition-colors group ${isActive ? 'bg-blue-900/40 text-blue-400' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`;
            fileDiv.style.paddingLeft = `${(depth * 8) + 16}px`; 
            fileDiv.id = `file-item-${file.fullPath.replace(/[^a-zA-Z0-9]/g, '-')}`;
            
            fileDiv.innerHTML = `
                <span class="material-symbols-outlined text-[14px] ${isActive ? 'text-blue-400' : 'text-gray-500'}">${this.getFileIcon(file.fullPath)}</span>
                <span class="truncate flex-1">${file.name}</span>
                <button class="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400" onclick="event.stopPropagation(); window.Editor.deleteFile('${file.fullPath}')">
                    <span class="material-symbols-outlined text-[10px]">close</span>
                </button>
            `;
            
            fileDiv.onclick = (e) => { e.stopPropagation(); this.switchFile(file.fullPath); };
            container.appendChild(fileDiv);
        });
    },

    // --- Preview Engine ---

    refreshPreview: function() {
        const frame = document.getElementById('editorPreviewFrame');
        if(!frame) return;

        this.syncCurrentFile();
        const files = this.state.files;
        if(Object.keys(files).length === 0) return;

        // Use WindowManager's Robust Launch Logic
        if(window.WindowManager && window.WindowManager.launchApp) {
            window.WindowManager.launchApp({ name: "Preview", files: files })
                .then(html => {
                    frame.srcdoc = html;
                });
        }
        
        const appName = document.getElementById('inName').value || "App";
        const urlBar = document.getElementById('previewUrlBar');
        if(urlBar) urlBar.textContent = `local://${appName.toLowerCase().replace(/\s/g,'-')}/${this.state.activeFilePath||''}`;
    },

    // --- Saving & Export ---

    updateCategoryDropdown: function() {
        const select = document.getElementById('categorySelect'); // Add this to HTML if missing, or use datalist
        if(!select) return;
        // Logic to populate stacks from window.all
        const stacks = new Set(['Development', 'Design', 'Games']);
        if(window.all) window.all.forEach(a => { if(a.stack) stacks.add(a.stack); });
        
        // ... Populate logic would go here if UI element existed
    },

    saveProject: async function() {
        window.notify("Saving...");
        this.syncCurrentFile();
        
        // Category Logic: "New Category" vs Existing
        let stack = document.getElementById('inStack').value;
        if(stack === 'New Category') {
            stack = prompt("Enter new category name:");
            if(!stack) return; // Cancelled
        }

        const app = {
            id: this.state.appId || crypto.randomUUID(),
            name: document.getElementById('inName').value || "Untitled",
            stack: stack,
            iconUrl: document.getElementById('inIcon').value,
            onDesktop: document.getElementById('chkDesk').checked,
            isFavorite: document.getElementById('chkFav').checked,
            files: this.state.files, // Save the FULL structure
            lastModified: Date.now()
        };
        
        try {
            if(window.dbPut) await window.dbPut(app);
            this.state.appId = app.id;
            window.notify("Saved Successfully!");
            if(window.refreshApps) window.refreshApps();
            document.getElementById('saveOptionsModal').classList.add('hidden');
        } catch(e) { 
            console.error(e);
            window.notify("Save Failed", true); 
        }
    },

    // --- Helper Utils ---

    syncCurrentFile: function() {
        if (this.state.activeFilePath && this.state.files[this.state.activeFilePath]) {
            if(this.state.files[this.state.activeFilePath].type === 'text' && window.editorCM) {
                this.state.files[this.state.activeFilePath].content = window.editorCM.getValue();
            }
        }
    },

    findEntryPoint: function() {
        const f = this.state.files;
        return Object.keys(f).find(k => k.toLowerCase().endsWith('index.html')) || Object.keys(f)[0];
    },
    
    getFileIcon: function(path) {
        if(path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
        if(path.endsWith('.css')) return 'css';
        if(path.endsWith('.html')) return 'html';
        if(path.endsWith('.json')) return 'data_object';
        if(this.isBinaryFile(path)) return 'image';
        return 'description';
    },

    isBinaryFile: function(path) {
        return /\.(png|jpg|jpeg|gif|webp|ico|mp3|mp4|svg|ttf|woff)$/i.test(path);
    },

    toggleImagePreview: function(show, file) {
        const img = document.getElementById('editor-image-view');
        const cm = document.querySelector('.CodeMirror');
        if(!img) return;

        if(show && file) {
            if(cm) cm.style.display = 'none';
            img.classList.remove('hidden');
            let src = '';
            if(file.type === 'blob' || file.content instanceof Blob) src = URL.createObjectURL(file.content);
            else if (typeof file.content === 'string' && file.content.startsWith('<svg')) {
                 const blob = new Blob([file.content], {type: 'image/svg+xml'});
                 src = URL.createObjectURL(blob);
            }
            img.querySelector('img').src = src;
        } else {
            if(cm) cm.style.display = 'block';
            img.classList.add('hidden');
        }
    },
    
    // UI Toggles
    toggleScaffold: function() { document.getElementById('scaffoldModal').classList.toggle('hidden'); },
    toggleSaveOptions: function() { document.getElementById('saveOptionsModal').classList.toggle('hidden'); },

    // Keep layout helpers
    setLayout: function(mode) {
        this.state.mode = mode;
        const container = document.getElementById('editorContainer');
        const preview = document.getElementById('editorPreviewPane');
        
        container.classList.remove('hidden', 'w-full', 'w-1/2');
        preview.classList.remove('hidden', 'w-full', 'w-1/2');

        if (mode === 'code') { container.classList.add('w-full'); preview.classList.add('hidden'); }
        else if (mode === 'preview') { container.classList.add('hidden'); preview.classList.add('w-full'); this.refreshPreview(); }
        else { container.classList.add('w-1/2'); preview.classList.add('w-1/2'); this.refreshPreview(); }
        if(window.editorCM) window.editorCM.refresh();
    },

    bindShortcuts: function() {
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); this.toggleSaveOptions(); }
        });
    },

    initDeepIntegrations: function() {
        const app = document.getElementById('editor-app');
        const overlay = document.createElement('div');
        overlay.className = 'absolute inset-0 bg-blue-500/20 border-2 border-blue-400 hidden z-50 flex items-center justify-center text-blue-200 text-xl font-bold backdrop-blur-sm pointer-events-none';
        overlay.innerText = 'Drop folder to import';
        overlay.id = 'drop-overlay';
        app.appendChild(overlay);

        app.addEventListener('dragover', (e) => { e.preventDefault(); document.getElementById('drop-overlay').classList.remove('hidden'); });
        app.addEventListener('dragleave', (e) => { e.preventDefault(); document.getElementById('drop-overlay').classList.add('hidden'); });
        app.addEventListener('drop', (e) => { 
            e.preventDefault(); 
            document.getElementById('drop-overlay').classList.add('hidden');
            this.handleDropImport(e);
        });
    },
    
    setFieldValue: function(id, val) { const el = document.getElementById(id); if(el) el.value = val; },
    setCheckValue: function(id, val) { const el = document.getElementById(id); if(el) el.checked = val; }
};
