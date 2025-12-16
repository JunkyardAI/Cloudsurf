// --- MODULE: EDITOR ---
function openEditor(appId = null) {
    const editorApp = $('editor-app');
    editorApp.classList.remove('hidden'); 
    editorApp.classList.remove('minimized'); 
    WindowManager.zIndex++; 
    editorApp.style.zIndex = WindowManager.zIndex;
    
    currentAppId = appId;
    
    if(appId) { 
        const app = all.find(x => x.id === appId); 
        if(app) { 
            $('inName').value = app.name; 
            $('saveName').value = app.name; 
            $('saveStack').value = app.stack || ''; 
            $('saveIcon').value = app.iconUrl || ''; 
            $('saveFav').checked = app.isFavorite || false; 
            $('savePin').checked = app.onDesktop || false; 
            editorCM.setValue(app.type==='html'?app.html:app.url); 
            updatePreview(app); 
        }
    } else { 
        currentAppId = crypto.randomUUID(); 
        $('inName').value = "Untitled Project"; 
        $('saveName').value = "Untitled Project"; 
        $('saveStack').value = "General"; 
        $('saveIcon').value = ""; 
        $('saveFav').checked = false; 
        $('savePin').checked = false; 
        
        // Better Default Template
        const defaultTmpl = `<!-- New Project -->
<div class="p-10 text-center font-sans">
    <h1 class="text-3xl font-bold text-blue-500 mb-4">Hello World</h1>
    <p class="text-gray-600">Start editing to see changes instantly.</p>
</div>`;
        editorCM.setValue(defaultTmpl); 
        updatePreview({html: defaultTmpl, type:'html'}); 
    }
}

function closeApp(type) { if(type === 'editor') $('editor-app').classList.add('hidden'); }

function deleteApp(id) { 
    if(confirm("Delete this app?")) { 
        dbOp('delete', id).then(async () => { 
            all = await dbOp('get'); 
            renderDesktopIcons(); 
            renderFinder(); 
            WindowManager.closeWindow(id); 
        }); 
    } 
}

function updatePreview(app) {
    const frame = $('editorPreviewFrame');
    if(app.type === 'html') { 
        // Enhanced Error Handling Injection
        const script = `<script>
            window.onerror = function(m,u,l){ window.parent.postMessage({type:'log',level:'error',message:m + ' (Line ' + l + ')'},'*'); };
            const _log = (l, a) => window.parent.postMessage({type:'log',level:l,message:Array.from(a).join(' ')},'*');
            console.log = function(...a){ _log('info', a); };
            console.error = function(...a){ _log('error', a); };
            console.warn = function(...a){ _log('warn', a); };
            console.info = function(...a){ _log('info', ["Console Ready"]); };
        <\/script>`; 
        
        const blob = new Blob([script + (app.html || editorCM.getValue())], {type: 'text/html'}); 
        frame.src = URL.createObjectURL(blob); 
    } else { 
        frame.src = app.url || editorCM.getValue(); 
    }
}

window.setEditorLayout = (mode) => {
    const left = $('editorLeft'); const right = $('editorRight'); const resizer = $('mainResizer');
    left.style.width = ''; left.style.flex = ''; // Reset
    left.classList.remove('hidden', 'flex-1'); right.classList.remove('hidden', 'flex-1'); resizer.classList.remove('hidden');
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    if (mode === 'code') { right.classList.add('hidden'); left.classList.add('flex-1'); resizer.classList.add('hidden'); $('viewCode').classList.add('active'); }
    else if (mode === 'preview') { left.classList.add('hidden'); right.classList.add('flex-1'); resizer.classList.add('hidden'); $('viewPreview').classList.add('active'); }
    else { right.classList.add('flex-1'); left.style.width = lastSplitWidth || '500px'; left.style.flex = 'none'; $('viewSplit').classList.add('active'); }
    setTimeout(() => { if(editorCM) editorCM.refresh(); }, 10);
};

window.downloadRawCode = () => {
    const code = editorCM.getValue(); 
    const filename = ($('inName').value || 'app').replace(/[^a-z0-9_\-\s]/gi, '_') + '.html'; 
    const blob = new Blob([code], {type: 'text/html'}); 
    const a = document.createElement('a'); 
    a.href = URL.createObjectURL(blob); 
    a.download = filename; 
    a.click(); 
    URL.revokeObjectURL(a.href);
};
