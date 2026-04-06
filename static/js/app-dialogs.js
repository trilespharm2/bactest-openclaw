
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

    window.appGuestSimWarning = function(signInUrl) {
        ensureDOM();
        return new Promise(function(resolve) {
            dialog.innerHTML =
                '<div style="text-align:center;margin-bottom:16px;">' +
                  '<div style="width:48px;height:48px;background:#fff7ed;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">' +
                    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
                  '</div>' +
                  '<div style="font-size:16px;font-weight:700;color:#1a1e2e;margin-bottom:8px;">Not Signed In</div>' +
                  '<div style="font-size:13px;color:#6b7280;line-height:1.6;">Your session results <strong>will not be saved</strong> after this session ends. You can view your results at the end of the session, but once you leave they will be gone.</div>' +
                '</div>' +
                '<div style="display:flex;flex-direction:column;gap:10px;">' +
                  '<button id="appGuestSignIn" style="padding:10px 20px;border-radius:8px;border:none;background:#3b6df0;color:#fff;font-size:13px;font-weight:600;cursor:pointer;width:100%;">Sign In to Save Results</button>' +
                  '<button id="appGuestContinue" style="padding:10px 20px;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#374151;font-size:13px;font-weight:600;cursor:pointer;width:100%;">Continue as Guest</button>' +
                '</div>';
            overlay.style.display = 'flex';

            function close(val) { overlay.style.display = 'none'; resolve(val); }

            document.getElementById('appGuestSignIn').onclick = function() {
                close('signin');
                if (signInUrl) window.location.href = signInUrl;
                else if (typeof navigateToPage === 'function') navigateToPage('login');
            };
            document.getElementById('appGuestContinue').onclick = function() { close('guest'); };
            overlay.onclick = function(e) { if (e.target === overlay) close('cancel'); };
        });
    };

    window.appGuestLeaveWarning = function() {
        ensureDOM();
        return new Promise(function(resolve) {
            dialog.innerHTML =
                '<div style="text-align:center;margin-bottom:16px;">' +
                  '<div style="width:48px;height:48px;background:#fef2f2;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">' +
                    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
                  '</div>' +
                  '<div style="font-size:16px;font-weight:700;color:#1a1e2e;margin-bottom:8px;">Active Session Will Be Lost</div>' +
                  '<div style="font-size:13px;color:#6b7280;line-height:1.6;">You are not signed in. If you leave now, your active session and all trades <strong>will be permanently lost</strong> and cannot be recovered. Sign in before leaving to save your progress.</div>' +
                '</div>' +
                '<div style="display:flex;flex-direction:column;gap:10px;">' +
                  '<button id="appLeaveStay" style="padding:10px 20px;border-radius:8px;border:none;background:#3b6df0;color:#fff;font-size:13px;font-weight:600;cursor:pointer;width:100%;">Stay in Session</button>' +
                  '<button id="appLeaveGo" style="padding:10px 20px;border-radius:8px;border:1px solid #fca5a5;background:#fff;color:#ef4444;font-size:13px;font-weight:600;cursor:pointer;width:100%;">Leave Anyway</button>' +
                '</div>';
            overlay.style.display = 'flex';

            function close(val) { overlay.style.display = 'none'; resolve(val); }

            document.getElementById('appLeaveStay').onclick = function() { close(false); };
            document.getElementById('appLeaveGo').onclick = function() { close(true); };
            overlay.onclick = function(e) { if (e.target === overlay) close(false); };
        });
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
