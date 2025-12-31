// --- MODULE: EDITOR 4.0 (DEEP SYSTEM UPGRADE) ---

window.Editor = {
    // State
    state: {
        files: {},           
        activeFilePath: null,
        appId: null,
        mode: 'split',       
        blobs: [],           
        consoleHeight: '128px',
        expandedFolders: new Set(), // Track open folders
        initialized: false
    },

    // --- Core Lifecycle ---

    open: function(appId = null) {
        const appWin = document.getElementById('editor-app');
        if(!appWin) return;
        
        // UI Reset
        appWin.classList.remove('hidden', 'minimized');
        if(window.WindowManager) {
            WindowManager.zIndex++;
            appWin.style.zIndex = WindowManager.zIndex;
        }
        
        this.state.appId = appId;
        this.revokeBlobs();

        // Initialize Editor UI Enhancements (One-time binding)
        if (!this.state.initialized) {
            this.initDeepIntegrations();
            this.bindShortcuts();
            this.state.initialized = true;
        }

        if (appId) {
            this.loadApp(appId);
        } else {
            this.resetToEmpty();
        }

        this.setLayout(this.state.mode);
    },

    revokeBlobs: function() {
        this.state.blobs.forEach(url => URL.revokeObjectURL(url));
        this.state.blobs = [];
    },

    loadApp: function(appId) {
        const app = (typeof all !== 'undefined' ? all : []).find(x => x.id === appId);
        if(!app) return this.resetToEmpty();

        // Load Metadata
        this.setFieldValue('inName', app.name);
        this.setFieldValue('inStack', app.stack || '');
        this.setFieldValue('inIcon', app.iconUrl || '');
        this.setCheckValue('chkFav', app.isFavorite || false);
        this.setCheckValue('chkDesk', app.onDesktop || false);
        
        // Persistence Hidden Fields
        this.setFieldValue('saveName', app.name);
        this.setFieldValue('saveStack', app.stack || '');
        this.setFieldValue('saveIcon', app.iconUrl || '');
        this.setCheckValue('saveFav', app.isFavorite);
        this.setCheckValue('savePin', app.onDesktop);

        // Load Files
        this.state.files = app.files || {};
        this.renderTree();

        // Smart Entry Point Detection
        const entry = this.findEntryPoint();
        if(entry) this.switchFile(entry);
        else if (window.editorCM) window.editorCM.setValue(app.type==='html' ? app.html : '');

        this.refreshPreview();
    },

    resetToEmpty: function() {
        this.state.appId = crypto.randomUUID();
        this.state.files = {
            'index.html': {
                content: '<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { font-family: sans-serif; padding: 20px; color: #fff; background: #222; }\n  </style>\n</head>\n<body>\n  <h1>New Project</h1>\n  <p>Start coding...</p>\n</body>\n</html>',
                type: 'text'
            }
        };
        this.state.activeFilePath = 'index.html';
        this.setFieldValue('inName', "Untitled Project");
        
        document.getElementById('file-tree').classList.remove('hidden'); 
        this.renderTree();
        
        if(window.editorCM) window.editorCM.setValue(this.state.files['index.html'].content);
        
        // Auto-show scaffold for new projects
        setTimeout(() => this.toggleScaffold(), 200);
        this.refreshPreview();
    },

    // --- Advanced File Operations ---

    switchFile: function(path) {
        this.syncCurrentFile();
        this.state.activeFilePath = path;
        const file = this.state.files[path];
        
        // Handle Editor vs Image View
        const isImage = this.isBinaryFile(path);
        const isSvg = path.toLowerCase().endsWith('.svg');
        
        this.toggleImagePreview(isImage || isSvg, file);

        if (!isImage && file && window.editorCM) {
            // SVGs are editable code
            if(isSvg) this.toggleImagePreview(false, null);

            window.editorCM.setValue(file.content || "");
            window.editorCM.setOption('readOnly', false);
            window.editorCM.clearHistory();
            
            // Intelligent Mode Setting via Extension
            const ext = path.split('.').pop().toLowerCase();
            const modeMap = { 
                'js': 'javascript', 'jsx': 'jsx', 'ts': 'text/typescript', 'tsx': 'text/typescript-jsx',
                'html': 'htmlmixed', 'css': 'css', 'scss': 'text/x-scss', 'less': 'text/x-less',
                'json': 'application/json', 'md': 'markdown', 'xml': 'xml', 'svg': 'xml', 'vue': 'vue'
            };
            const mode = modeMap[ext] || 'htmlmixed';
            window.editorCM.setOption('mode', mode);
            
            const modeDisplay = document.getElementById('sb-mode');
            if(modeDisplay) modeDisplay.textContent = mode;
        } else if (isImage) {
             window.editorCM.setOption('readOnly', true);
        }

        this.highlightActiveFile(path);
        this.updateStatusBar();
    },

    newFile: function() {
        // Advanced: Allow "js/utils/helper.js" to auto-create folders in tree view logic
        const name = prompt("File path (e.g. css/style.css):");
        if(name) {
            const cleanName = name.trim().replace(/^\//, ''); // Remove leading slash
            if(this.state.files[cleanName]) { notify("File exists", true); return; }
            this.state.files[cleanName] = { content: "", type: "text" };
            this.renderTree();
            this.switchFile(cleanName);
        }
    },

    renameFile: function(oldPath) {
        const newPath = prompt("Rename file to:", oldPath);
        if (newPath && newPath !== oldPath) {
            if (this.state.files[newPath]) return notify("Filename exists", true);
            this.state.files[newPath] = this.state.files[oldPath];
            delete this.state.files[oldPath];
            if (this.state.activeFilePath === oldPath) this.state.activeFilePath = newPath;
            this.renderTree();
            this.switchFile(this.state.activeFilePath);
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

    // --- DEEP IMPORT ENGINE ---

    triggerFolderImport: function() {
        // Ensure we have a robust input for folder selection
        let input = document.getElementById('folderImportInput');
        if(!input) {
            input = document.createElement('input');
            input.id = 'folderImportInput';
            input.type = 'file';
            input.webkitdirectory = true; // Key for folders
            input.directory = true;
            input.multiple = true;
            input.style.display = 'none';
            input.onchange = (e) => this.handleInputImport(e);
            document.body.appendChild(input);
        }
        input.click();
    },

    // Handle traditional Input selection (Fallback)
    handleInputImport: async function(e) {
        const files = Array.from(e.target.files);
        if(files.length === 0) return;
        await this.processImportBatch(files.map(f => ({
            entry: f, 
            path: f.webkitRelativePath || f.name
        })));
    },

    // Handle Drag and Drop (Primary Power User Method)
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

    // Recursively scan directories from Drag API
    scanEntryRecursive: async function(entry, path, resultList) {
        if (entry.isFile) {
            return new Promise((resolve) => {
                entry.file((file) => {
                    resultList.push({ entry: file, path: path + file.name });
                    resolve();
                });
            });
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            const readEntries = async () => {
                const entries = await new Promise((res) => reader.readEntries(res));
                if (entries.length === 0) return;
                
                // Recursively scan children
                const promises = entries.map(child => this.scanEntryRecursive(child, path + entry.name + "/", resultList));
                await Promise.all(promises);
                
                // Continue reading (reader returns batches)
                await readEntries();
            };
            await readEntries();
        }
    },

    // Unified Batch Processor
    processImportBatch: async function(fileObjects) {
        notify(`Processing ${fileObjects.length} files...`);
        
        // 1. Root Normalization (Smart Project Rename)
        // If all files start with "FolderName/", strip it and rename project to "FolderName"
        const firstPath = fileObjects[0].path;
        const rootMatch = firstPath.match(/^([^/]+)\//);
        let rootPrefix = "";
        
        if (rootMatch) {
            const potentialRoot = rootMatch[1];
            const allMatch = fileObjects.every(f => f.path.startsWith(potentialRoot + "/"));
            if (allMatch) {
                rootPrefix = potentialRoot + "/";
                this.setFieldValue('inName', potentialRoot); // Auto-rename project
                notify(`Project set to: ${potentialRoot}`);
            }
        }

        const newVFS = {};
        const textExtensions = new Set(['js','jsx','ts','tsx','html','css','scss','json','md','txt','svg','xml','vue','gitignore','env']);

        // 2. Parallel Reading
        const promises = fileObjects.map(async (f) => {
            const rawPath = f.path;
            const finalPath = rawPath.startsWith(rootPrefix) ? rawPath.slice(rootPrefix.length) : rawPath;
            
            // Skip junk
            if(finalPath.includes('.git/') || finalPath.includes('node_modules/') || finalPath.startsWith('.')) return;

            const ext = finalPath.split('.').pop().toLowerCase();
            const isText = textExtensions.has(ext);

            if (isText) {
                const text = await f.entry.text();
                newVFS[finalPath] = { content: text, type: 'text' };
            } else {
                newVFS[finalPath] = { content: f.entry, type: 'blob' };
            }
        });

        await Promise.all(promises);

        // 3. Merge and Update
        this.state.files = { ...this.state.files, ...newVFS };
        this.renderTree();
        
        const index = this.findEntryPoint();
        if(index) this.switchFile(index);
        
        notify("Deep Import Complete");
        this.refreshPreview();
    },

    // --- TREE VISUALIZATION ENGINE ---

    renderTree: function() {
        const treeContainer = document.getElementById('fileTreeContent');
        if(!treeContainer) return;
        treeContainer.innerHTML = '';
        
        const files = this.state.files;
        if(Object.keys(files).length > 0) {
            document.getElementById('file-tree').classList.remove('hidden');
        }

        // Build Hierarchy
        const root = { name: 'root', children: {}, files: [] };
        
        Object.keys(files).forEach(path => {
            const parts = path.split('/');
            const fileName = parts.pop();
            let current = root;
            
            // Traverse folders
            parts.forEach(part => {
                if (!current.children[part]) {
                    current.children[part] = { name: part, children: {}, files: [] };
                }
                current = current.children[part];
            });
            
            current.files.push({ name: fileName, fullPath: path });
        });

        // Recursive Render
        this.renderFolder(root, treeContainer, 0);
    },

    renderFolder: function(folder, container, depth) {
        // Render Subfolders
        const sortedFolders = Object.keys(folder.children).sort();
        sortedFolders.forEach(folderName => {
            const subFolder = folder.children[folderName];
            const folderId = `folder-${folderName}-${depth}-${Math.random().toString(36).substr(2, 5)}`;
            const isExpanded = this.state.expandedFolders.has(folderId) || depth === 0; // Default open root, others closed? or default all open? 
            // Better UX: Default all open for small projects, closed for massive ones. Let's auto-expand depth 0 and 1.
            const autoExpand = depth < 2;

            const folderDiv = document.createElement('div');
            folderDiv.className = 'ml-2';
            
            const label = document.createElement('div');
            label.className = 'flex items-center gap-1 text-gray-400 hover:text-white cursor-pointer py-0.5 select-none';
            label.style.paddingLeft = `${depth * 8}px`;
            label.innerHTML = `
                <span class="material-symbols-outlined text-[14px] transition-transform duration-200 ${autoExpand ? 'rotate-90' : ''}">chevron_right</span>
                <span class="text-xs font-bold text-blue-200/70">${folderName}</span>
            `;
            
            const childrenContainer = document.createElement('div');
            childrenContainer.className = autoExpand ? 'block' : 'hidden';

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

            // Recurse
            this.renderFolder(subFolder, childrenContainer, depth + 1);
        });

        // Render Files
        const sortedFiles = folder.files.sort((a,b) => a.name.localeCompare(b.name));
        sortedFiles.forEach(file => {
            const fileDiv = document.createElement('div');
            const isActive = file.fullPath === this.state.activeFilePath;
            
            fileDiv.className = `flex items-center gap-2 py-1 cursor-pointer text-xs rounded transition-colors group ${isActive ? 'bg-blue-900/40 text-blue-400' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`;
            fileDiv.style.paddingLeft = `${(depth * 8) + 16}px`; // Indent past arrows
            fileDiv.id = `file-item-${file.fullPath.replace(/[^a-zA-Z0-9]/g, '-')}`;
            
            const icon = this.getFileIcon(file.fullPath);
            
            fileDiv.innerHTML = `
                <span class="material-symbols-outlined text-[14px] ${isActive ? 'text-blue-400' : 'text-gray-500'}">${icon}</span>
                <span class="truncate flex-1">${file.name}</span>
                <button class="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400" onclick="event.stopPropagation(); window.Editor.deleteFile('${file.fullPath}')">
                    <span class="material-symbols-outlined text-[10px]">close</span>
                </button>
            `;
            
            fileDiv.onclick = (e) => {
                e.stopPropagation();
                this.switchFile(file.fullPath);
            };
            
            container.appendChild(fileDiv);
        });
    },


    // --- PREVIEW ENGINE (Cascading Resolution) ---

    refreshPreview: function() {
        const frame = document.getElementById('editorPreviewFrame');
        if(!frame) return;

        this.syncCurrentFile();
        const files = this.state.files;
        if(Object.keys(files).length === 0) return;

        this.revokeBlobs();
        
        // 1. First Pass: Generate Blobs for Assets (Images, etc)
        const urlMap = {};
        const assetPaths = Object.keys(files).filter(p => this.isBinaryFile(p));
        
        assetPaths.forEach(path => {
            const file = files[path];
            let blob = (file.type === 'blob') ? file.content : new Blob([file.content], { type: this.getMime(path) });
            const url = URL.createObjectURL(blob);
            this.state.blobs.push(url);
            urlMap[path] = url;
            urlMap['./' + path] = url;
        });

        // 2. Second Pass: Generate Blobs for CSS 
        const cssPaths = Object.keys(files).filter(p => p.endsWith('.css'));
        cssPaths.forEach(path => {
            let content = files[path].content;
            assetPaths.forEach(assetPath => {
                const assetUrl = urlMap[assetPath];
                if(!assetUrl) return;
                const safePath = assetPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`url\\(["']?((\\./|/)?${safePath})["']?\\)`, 'g');
                content = content.replace(regex, `url("${assetUrl}")`);
            });
            const blob = new Blob([content], { type: 'text/css' });
            const url = URL.createObjectURL(blob);
            this.state.blobs.push(url);
            urlMap[path] = url;
            urlMap['./' + path] = url;
        });

        // 3. Third Pass: JS
        const jsPaths = Object.keys(files).filter(p => p.endsWith('.js') || p.endsWith('.jsx'));
        jsPaths.forEach(path => {
            const blob = new Blob([files[path].content], { type: 'text/javascript' });
            const url = URL.createObjectURL(blob);
            this.state.blobs.push(url);
            urlMap[path] = url;
            urlMap['./' + path] = url;
        });

        // 4. Final Pass: Render Entry Point HTML
        const indexPath = this.findEntryPoint();
        if(!indexPath) return; 

        let html = files[indexPath].content;
        
        const sortedPaths = Object.keys(urlMap).sort((a,b) => b.length - a.length);

        sortedPaths.forEach(path => {
            const blobUrl = urlMap[path];
            const safePath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`((href|src|action)=["']|url\\(["']?)((\\./|/)?${safePath})(["']?|\\))`, 'g');
            html = html.replace(regex, `$1${blobUrl}$5`);
        });

        const bridge = `
        <script>
            (function() {
                window.onerror = function(m,u,l,c,e){ 
                    window.parent.postMessage({type:'log', level:'error', message: m + ' ('+l+':' + c +')'},'*'); 
                    return false;
                };
                const _log = (l, args) => {
                    const msg = Array.from(args).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                    window.parent.postMessage({type:'log', level: l, message: msg}, '*');
                };
                console.log = function(...a){ _log('info', a); };
                console.error = function(...a){ _log('error', a); };
                console.warn = function(...a){ _log('warn', a); };
            })();
        <\/script>`;
        
        if(html.includes('</body>')) html = html.replace('</body>', bridge + '</body>');
        else html += bridge;

        frame.srcdoc = html;
        const appName = document.getElementById('inName').value || "App";
        const urlBar = document.getElementById('previewUrlBar');
        if(urlBar) urlBar.textContent = `local://${appName.toLowerCase().replace(/\s/g,'-')}/${indexPath}`;
    },

    // --- UTILS & HELPERS ---

    initDeepIntegrations: function() {
        const container = document.getElementById('editorContainer');
        const overlay = document.createElement('div');
        overlay.id = 'drop-overlay';
        overlay.className = 'absolute inset-0 bg-blue-500/20 border-2 border-blue-400 hidden z-50 flex items-center justify-center text-blue-200 text-xl font-bold backdrop-blur-sm';
        overlay.innerHTML = 'Drop folder to import';
        document.getElementById('editor-app').appendChild(overlay);

        // Drag Events
        const app = document.getElementById('editor-app');
        
        app.addEventListener('dragover', (e) => {
            e.preventDefault();
            overlay.classList.remove('hidden');
        });
        
        overlay.addEventListener('dragleave', (e) => {
            e.preventDefault();
            overlay.classList.add('hidden');
        });
        
        overlay.addEventListener('drop', (e) => {
            e.preventDefault();
            overlay.classList.add('hidden');
            this.handleDropImport(e);
        });

        // Initialize Status Bar
        if(container && !document.getElementById('editor-status-bar')) {
            const sb = document.createElement('div');
            sb.id = 'editor-status-bar';
            sb.className = 'absolute bottom-0 left-0 right-0 bg-[#191a21] text-gray-500 text-[10px] px-2 py-1 flex justify-between border-t border-gray-800 z-20';
            sb.innerHTML = `<div class="flex gap-4"><span id="sb-file">No file</span> <span id="sb-mode"></span></div> <span id="sb-cursor">Ln 1, Col 1</span>`;
            container.appendChild(sb);
        }

        if(window.editorCM) {
            window.editorCM.on('cursorActivity', (cm) => {
                const pos = cm.getCursor();
                const el = document.getElementById('sb-cursor');
                if(el) el.textContent = `Ln ${pos.line + 1}, Col ${pos.ch + 1}`;
            });
            window.editorCM.on('change', () => this.updateStatusBar());
        }
    },

    findEntryPoint: function() {
        const files = this.state.files;
        return Object.keys(files).find(k => k.endsWith('index.html')) || 
               Object.keys(files).find(k => k.endsWith('main.js')) || 
               Object.keys(files)[0];
    },

    syncCurrentFile: function() {
        if (this.state.activeFilePath && this.state.files[this.state.activeFilePath]) {
            if(this.state.files[this.state.activeFilePath].type === 'text' && window.editorCM) {
                this.state.files[this.state.activeFilePath].content = window.editorCM.getValue();
            }
        }
    },

    isBinaryFile: function(path) {
        return /\.(png|jpg|jpeg|gif|webp|ico|mp3|mp4|webm|woff|woff2|ttf|eot)$/i.test(path);
    },

    getMime: function(path) {
        const ext = path.split('.').pop().toLowerCase();
        return ({
            'js': 'text/javascript', 'css': 'text/css', 'html': 'text/html', 'jsx': 'text/javascript',
            'json': 'application/json', 'png': 'image/png', 'jpg': 'image/jpeg', 'svg': 'image/svg+xml',
            'gif': 'image/gif', 'md': 'text/markdown', 'txt': 'text/plain'
        })[ext] || 'text/plain';
    },

    getFileIcon: function(path) {
        if(path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
        if(path.endsWith('.css') || path.endsWith('.scss')) return 'css';
        if(path.endsWith('.html')) return 'html';
        if(path.endsWith('.json')) return 'data_object';
        if(path.endsWith('.svg') || this.isBinaryFile(path)) return 'image';
        return 'description';
    },
    
    // ... Keeping UI/Layout/Shortcuts/Console/Saving same as 3.1 but compacted ...

    setLayout: function(mode) {
        this.state.mode = mode;
        const container = document.getElementById('editorContainer');
        const preview = document.getElementById('editorPreviewPane');
        const btns = ['btnViewCode', 'btnViewSplit', 'btnViewPreview'];
        btns.forEach(b => document.getElementById(b).classList.remove('text-white', 'bg-white/10'));
        
        const activeBtn = mode === 'code' ? 'btnViewCode' : mode === 'preview' ? 'btnViewPreview' : 'btnViewSplit';
        document.getElementById(activeBtn).classList.add('text-white', 'bg-white/10');

        container.classList.remove('hidden', 'w-full', 'w-1/2');
        preview.classList.remove('hidden', 'w-full', 'w-1/2');

        if (mode === 'code') { container.classList.add('w-full'); preview.classList.add('hidden'); }
        else if (mode === 'preview') { container.classList.add('hidden'); preview.classList.add('w-full'); this.refreshPreview(); }
        else { container.classList.add('w-1/2'); preview.classList.add('w-1/2'); this.refreshPreview(); }
        if(window.editorCM) window.editorCM.refresh();
    },

    toggleImagePreview: function(show, file) {
        let imgPreview = document.getElementById('editor-image-view');
        const container = document.getElementById('editorContainer');
        if (!imgPreview && container) {
            imgPreview = document.createElement('div');
            imgPreview.id = 'editor-image-view';
            imgPreview.className = 'absolute inset-0 flex flex-col items-center justify-center bg-gray-900 hidden z-10';
            imgPreview.innerHTML = '<img id="editor-image-target" class="max-w-[90%] max-h-[90%] object-contain border border-gray-700 shadow-lg bg-[url(\'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjNDAyMDYwIi8+CjxwYXRoIGQ9Ik0wIDBMOCA4Wk04IDBMMCA4WiIgc3Ryb2tlPSIjNTU1IiBzdHJva2Utd2lkdGg9IjAuNSIvPgo8L3N2Zz4=\')]">';
            container.appendChild(imgPreview);
        }
        const cm = container ? container.querySelector('.CodeMirror') : null;
        const imgTarget = document.getElementById('editor-image-target');

        if(show && file) {
            if(cm) cm.style.display = 'none';
            imgPreview.classList.remove('hidden');
            let src = '';
            if(file.type === 'blob') src = URL.createObjectURL(file.content);
            else if(file.content.trim().startsWith('<svg') || this.getMime(this.state.activeFilePath).includes('svg')) {
                const blob = new Blob([file.content], {type: 'image/svg+xml'});
                src = URL.createObjectURL(blob);
            }
            if(src) imgTarget.src = src;
        } else {
            if(cm) cm.style.display = 'block';
            if(imgPreview) imgPreview.classList.add('hidden');
        }
    },

    updateStatusBar: function() {
        const fileEl = document.getElementById('sb-file');
        if(fileEl) fileEl.textContent = this.state.activeFilePath || 'No file';
    },

    highlightActiveFile: function(path) {
        document.querySelectorAll('[id^="file-item-"]').forEach(el => el.classList.remove('bg-blue-900/40', 'text-blue-400'));
        const activeEl = document.getElementById(`file-item-${path.replace(/[^a-zA-Z0-9]/g, '-')}`);
        if(activeEl) activeEl.classList.add('bg-blue-900/40', 'text-blue-400');
    },

    toggleConsole: function() {
        const c = document.getElementById('editorConsole');
        const icon = document.getElementById('consoleToggleIcon');
        if(c.style.height === '24px') {
            c.style.height = this.state.consoleHeight;
            icon.textContent = 'expand_more';
        } else {
            this.state.consoleHeight = c.style.height || '128px'; 
            c.style.height = '24px';
            icon.textContent = 'expand_less';
        }
    },
    
    logToConsole: function(type, msg) {
        const out = document.getElementById('consoleOutput');
        if(!out) return;
        const line = document.createElement('div');
        line.className = `border-b border-gray-800 pb-1 mb-1 font-mono break-all text-xs`;
        const colors = { error: 'text-red-400', warn: 'text-yellow-400', info: 'text-blue-300' };
        const time = new Date().toLocaleTimeString().split(' ')[0];
        line.innerHTML = `<span class="text-gray-600 mr-2">[${time}]</span><span class="${colors[type] || 'text-gray-300'}">${msg.replace(/</g,'&lt;')}</span>`;
        out.appendChild(line);
        out.scrollTop = out.scrollHeight;
    },

    bindShortcuts: function() {
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); this.saveProject(); }
        });
    },

    setFieldValue: function(id, val) { const el = document.getElementById(id); if(el) el.value = val; },
    setCheckValue: function(id, val) { const el = document.getElementById(id); if(el) el.checked = val; },

    // --- Saving & Scaffold (Standard) ---
    toggleScaffold: function() { document.getElementById('scaffoldModal').classList.toggle('hidden'); },
    loadScaffoldPreset: function(val) {
        const presets = {
            todo: `todo-app/\n  index.html\n  style.css\n  app.js`,
            electron: `app/\n  package.json\n  main.js\n  index.html\n  renderer.js`,
            landing: `landing/\n  index.html\n  assets/\n    logo.png\n  css/\n    style.css`,
            modular: `webapp/\n  index.html\n  styles/\n    style.css\n  js/\n    app.js\n    utils.js`
        };
        if(presets[val]) document.getElementById('scaffoldInput').value = presets[val];
    },
    buildFromScaffold: function() {
        const text = document.getElementById('scaffoldInput').value;
        if(!text.trim()) return;
        const root = this.parseAsciiTree(text);
        const files = {};
        const traverse = (nodes, parentPath) => {
            nodes.forEach(node => {
                const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
                if(node.type === 'file') {
                    let content = "";
                    if(node.name.endsWith('.html')) content = `<!DOCTYPE html>\n<html>\n<head>\n<title>${node.name}</title>\n</head>\n<body>\n<h1>${node.name}</h1>\n</body>\n</html>`;
                    if(node.name.endsWith('.js')) content = `console.log("Loaded ${node.name}");`;
                    if(node.name.endsWith('.css')) content = `body { font-family: sans-serif; }`;
                    files[fullPath] = { content, type: 'text' };
                } else traverse(node.children, fullPath);
            });
        };
        traverse(root, "");
        this.state.files = files;
        this.renderTree();
        this.toggleScaffold();
        const entry = this.findEntryPoint();
        if(entry) this.switchFile(entry);
        this.refreshPreview();
    },
    parseAsciiTree: function(text) {
        const lines = text.split('\n');
        const root = [];
        const stack = [{ level: -1, children: root }];
        lines.forEach(line => {
            if(!line.trim()) return;
            const match = line.match(/^[\s\u2500-\u257F\-|`\+]+/);
            const level = match ? Math.floor(match[0].length / 2) : 0;
            const name = line.replace(/^[\s\u2500-\u257F\-|`\+\*\>]+/, '').trim();
            const type = (name.endsWith('/') || !name.includes('.')) ? 'folder' : 'file';
            while(stack.length > 1 && stack[stack.length-1].level >= level) stack.pop();
            const node = { name: name.replace('/',''), type, children: [], level };
            stack[stack.length-1].children.push(node);
            if(type === 'folder') stack.push(node);
        });
        return root;
    },
    saveProject: async function() {
        notify("Saving...");
        this.syncCurrentFile();
        const app = {
            id: this.state.appId || crypto.randomUUID(),
            name: document.getElementById('inName').value || "Untitled",
            stack: document.getElementById('inStack').value,
            iconUrl: document.getElementById('inIcon').value,
            onDesktop: document.getElementById('chkDesk').checked,
            isFavorite: document.getElementById('chkFav').checked,
            files: this.state.files,
            lastModified: Date.now()
        };
        try {
            if(window.dbPut) await window.dbPut(app);
            this.state.appId = app.id;
            notify("Saved Successfully!");
            if(window.refreshApps) window.refreshApps();
            document.getElementById('saveOptionsModal').classList.add('hidden');
        } catch(e) { notify("Save Failed", true); }
    },
    deleteProject: async function() {
        if(!this.state.appId) return;
        if(confirm("Delete this project?")) {
            if(window.dbOp) await window.dbOp('delete', this.state.appId);
            notify("Deleted");
            document.getElementById('editor-app').classList.add('hidden');
            if(window.refreshApps) window.refreshApps();
            document.getElementById('saveOptionsModal').classList.add('hidden');
        }
    },
    downloadZip: async function() {
        if(!window.JSZip) return notify("JSZip missing", true);
        const zip = new JSZip();
        const files = this.state.files;
        Object.keys(files).forEach(path => zip.file(path, files[path].content));
        const blob = await zip.generateAsync({type:"blob"});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (document.getElementById('inName').value || "project") + ".zip";
        a.click();
    },
    exportJson: function() {
        this.syncCurrentFile();
        const data = { meta: { name: document.getElementById('inName').value }, files: this.state.files };
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = "project.json";
        a.click();
    }
};

window.openEditor = function(id) { if(window.Editor) window.Editor.open(id); };
window.addEventListener('message', (e) => { if(e.data && e.data.type === 'log' && window.Editor) window.Editor.logToConsole(e.data.level, e.data.message); });
