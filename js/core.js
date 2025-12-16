// --- MODULE: CORE & STATE ---
    const DB_N='cloudstax_v2', DB_V=1, ST='apps';
    let db, all=[], editorCM=null, currentAppId=null, sIcons=new Map();
    let lastSplitWidth = '500px';
    const WIN_STATE_KEY = 'cs_win_states';

    const GOOGLE_ICONS = [
        "search","home","settings","close","menu","check","favorite","add","delete","edit","arrow_back","arrow_forward","refresh","download","upload","cloud","folder","image","description","content_copy","save","lock","person","dashboard","terminal","code","bug_report","extension","language","help","info","warning","error","check_circle","schedule","calendar_today","chat","mail","call","notifications","share","link","public","rocket","bolt","build","palette","brush","music_note","videocam","photo_camera","monitor","smartphone","mouse","keyboard","wifi","bluetooth","battery_full","light_mode","dark_mode","grid_view","list","sort","filter_list","login","logout","history","visibility","visibility_off","play_arrow","pause","stop","volume_up","mic","camera","map","location_on","shopping_cart","attach_money","credit_card","receipt","account_balance","work","group","school","science","emoji_events","star","face","thumb_up"
    ];

    // --- MODULE: UTILS ---
    const $ = id => document.getElementById(id);
    const esc = s => String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const notify = (msg, isErr) => {
        const n = $('notification'); n.textContent = msg; n.className = `fixed top-6 right-6 px-4 py-3 rounded-lg shadow-xl text-sm font-medium z-[100000] text-white transition-all transform translate-y-0 opacity-100 ${isErr?'bg-red-600':'bg-blue-600'}`;
        n.classList.remove('hidden'); setTimeout(()=>n.classList.add('hidden'), 3000);
    };
    function renderIconHtml(val, sizeClass="text-2xl") {
        if(!val) return `<div class="${sizeClass}">⚡</div>`;
        if(val.includes('/') || val.includes('.')) return `<img src="${esc(val)}" class="w-full h-full object-cover rounded" onerror="this.style.display='none'">`;
        if(/^[a-z0-9_]+$/i.test(val) && val.length < 25) return `<span class="material-symbols-outlined ${sizeClass}">${val}</span>`;
        return `<span class="${sizeClass}">${esc(val)}</span>`;
    }

    