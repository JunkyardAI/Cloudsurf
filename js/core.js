// --- MODULE: CORE (Global State & Utils) ---

// 1. Global Icon Library (Material Symbols)
window.GOOGLE_ICONS = [
    "folder", "description", "article", "code", "terminal", "settings", "home",
    "search", "delete", "edit", "save", "download", "upload", "image", "movie",
    "music_note", "grid_view", "list", "check", "close", "menu", "refresh",
    "arrow_back", "arrow_forward", "star", "favorite", "bug_report", "memory",
    "storage", "cloud", "cloud_upload", "wifi", "battery_full", "laptop",
    "desktop_windows", "phone_iphone", "keyboard", "mouse", "monitor",
    "developer_board", "router", "cast", "videogame_asset", "lightbulb",
    "bolt", "palette", "brush", "construction", "build", "handyman",
    "science", "school", "rocket", "flight", "local_shipping", "map",
    "place", "person", "group", "pets", "eco", "spa", "water_drop",
    "fire_extinguisher", "warning", "info", "help", "lock", "lock_open",
    "vpn_key", "security", "shield", "policy", "history", "schedule",
    "calendar_today", "calculate", "attach_money", "shopping_cart", "credit_card"
];

// 2. Icon Renderer
window.renderIconHtml = function(iconUrl, classes = "") {
    if (!iconUrl) return `<span class="material-symbols-outlined ${classes}">grid_view</span>`;
    
    // Check if it's a Google Icon name (no dots, no slashes, usually lowercase)
    const isGoogleIcon = /^[a-z0-9_]+$/.test(iconUrl);
    
    if (isGoogleIcon) {
        return `<span class="material-symbols-outlined ${classes}">${iconUrl}</span>`;
    } else {
        // Assume URL or Data URI
        // Added onerror to hide broken images gracefully
        return `<img src="${iconUrl}" class="${classes} object-contain" onerror="this.style.display='none'">`;
    }
};

// 3. Notification System (Toast)
window.notify = function(msg, isErr = false) {
    const el = document.getElementById('notification');
    if (!el) {
        console.log(`[${isErr ? 'ERR' : 'INFO'}] ${msg}`);
        return;
    }
    el.innerHTML = `<div class="flex items-center gap-3">
        <span class="material-symbols-outlined">${isErr ? 'error' : 'check_circle'}</span>
        <span>${msg}</span>
    </div>`;
    el.className = `fixed top-6 right-6 px-4 py-3 rounded-lg shadow-xl text-sm font-medium z-[100000] text-white animate-slideIn ${isErr ? 'bg-red-600' : 'bg-blue-600'}`;
    el.classList.remove('hidden');
    
    // Clear previous timer if exists
    if (window._notifyTimer) clearTimeout(window._notifyTimer);
    window._notifyTimer = setTimeout(() => {
        el.classList.add('hidden');
    }, 3000);
};

// 4. File System Utilities
window.BlobRegistry = new Set();

window.normalizePath = function(p) {
    // Remove leading slash and backslashes
    return p.replace(/\\/g, '/').replace(/^\/+/, '');
};

window.sanitizeVFS = function(app) {
    if (!app.files) app.files = {};
    const cleanFiles = {};
    let hasIndex = false;

    for (const rawPath in app.files) {
        const path = window.normalizePath(rawPath);
        cleanFiles[path] = app.files[rawPath];
        if (path.toLowerCase().endsWith('index.html')) hasIndex = true;
    }

    // Only force default index if truly empty
    if (!hasIndex && Object.keys(cleanFiles).length === 0) {
        cleanFiles['index.html'] = {
            type: 'text',
            content: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${app.name}</title></head><body class="bg-gray-100 flex items-center justify-center h-screen"><h1 class="text-2xl font-sans text-gray-700">Hello ${app.name}</h1></body></html>`
        };
    }

    app.files = cleanFiles;
    return app;
};

window.createTrackedBlob = function(content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    window.BlobRegistry.add(url);
    return url;
};

window.revokeAllBlobs = function() {
    window.BlobRegistry.forEach(url => URL.revokeObjectURL(url));
    window.BlobRegistry.clear();
};

window.esc = function(unsafe) {
    if (!unsafe) return "";
    if (typeof unsafe !== 'string') return String(unsafe);
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
};
