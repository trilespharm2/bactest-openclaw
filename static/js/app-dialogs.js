
(function() {
    var overlay = null;
    var dialog = null;

    function ensureDOM() {
        if (overlay) return;
        overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);z-index:99999;display:none;align-items:center;justify-content:center;padding:20px;';
        dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.25);font-family:inherit;';
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
    }

    function show(msg, showCancel) {
        ensureDOM();
        return new Promise(function(resolve) {
            var msgHtml = '<div style="font-size:14px;color:#1a1e2e;line-height:1.6;margin-bottom:20px;word-wrap:break-word;">' + escHtml(msg) + '</div>';
            var btns = '<div style="display:flex;gap:10px;justify-content:flex-end;">';
            if (showCancel) {
                btns += '<button id="appDlgCancel" style="padding:8px 20px;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#374151;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.15s;">Cancel</button>';
            }
            btns += '<button id="appDlgOk" style="padding:8px 20px;border-radius:8px;border:none;background:#3b6df0;color:#fff;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.15s;">OK</button>';
            btns += '</div>';
            dialog.innerHTML = msgHtml + btns;
            overlay.style.display = 'flex';

            var okBtn = document.getElementById('appDlgOk');
            var cancelBtn = document.getElementById('appDlgCancel');

            function close(val) {
                overlay.style.display = 'none';
                resolve(val);
            }

            okBtn.onclick = function() { close(true); };
            if (cancelBtn) cancelBtn.onclick = function() { close(false); };
            overlay.onclick = function(e) { if (e.target === overlay) close(false); };

            okBtn.focus();
        });
    }

    function escHtml(str) {
        var d = document.createElement('div');
        d.textContent = str || '';
        return d.innerHTML;
    }

    window.appAlert = function(msg) {
        return show(msg, false);
    };

    window.appConfirm = function(msg) {
        return show(msg, true);
    };

    window.appPrompt = function(msg, defaultVal) {
        ensureDOM();
        return new Promise(function(resolve) {
            var msgHtml = '<div style="font-size:14px;color:#1a1e2e;line-height:1.6;margin-bottom:12px;word-wrap:break-word;">' + escHtml(msg) + '</div>';
            var inputHtml = '<input id="appDlgInput" type="text" value="' + escHtml(defaultVal || '') + '" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;margin-bottom:20px;box-sizing:border-box;outline:none;" />';
            var btns = '<div style="display:flex;gap:10px;justify-content:flex-end;">';
            btns += '<button id="appDlgCancel" style="padding:8px 20px;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#374151;font-size:13px;font-weight:600;cursor:pointer;">Cancel</button>';
            btns += '<button id="appDlgOk" style="padding:8px 20px;border-radius:8px;border:none;background:#3b6df0;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">OK</button>';
            btns += '</div>';
            dialog.innerHTML = msgHtml + inputHtml + btns;
            overlay.style.display = 'flex';

            var inp = document.getElementById('appDlgInput');
            var okBtn = document.getElementById('appDlgOk');
            var cancelBtn = document.getElementById('appDlgCancel');

            function close(val) {
                overlay.style.display = 'none';
                resolve(val);
            }

            okBtn.onclick = function() { close(inp.value); };
            cancelBtn.onclick = function() { close(null); };
            overlay.onclick = function(e) { if (e.target === overlay) close(null); };
            inp.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') close(inp.value);
                if (e.key === 'Escape') close(null);
            });

            inp.focus();
            inp.select();
        });
    };
})();
