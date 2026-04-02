var _optMktCurrentCategory = 'most-active';

function initOptionsMarketPage() {
    document.querySelectorAll('#optMktTabs .nav-link').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('#optMktTabs .nav-link').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            _optMktCurrentCategory = btn.dataset.category;
            loadOptionsMarketData(_optMktCurrentCategory);
        });
    });

    var refreshBtn = document.getElementById('optMktRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', function() { loadOptionsMarketData(_optMktCurrentCategory); });

    loadOptionsMarketData(_optMktCurrentCategory);
}

function loadOptionsMarketData(category) {
    var loading = document.getElementById('optMktLoading');
    var error = document.getElementById('optMktError');
    var table = document.getElementById('optMktTable');
    var footer = document.getElementById('optMktFooter');
    var tbody = document.getElementById('optMktTableBody');

    loading.style.display = 'block';
    error.style.display = 'none';
    table.style.display = 'none';
    footer.style.display = 'none';

    fetch('/api/options-market?category=' + encodeURIComponent(category))
        .then(function(r) { return r.json(); })
        .then(function(data) {
            loading.style.display = 'none';
            if (data.error) {
                error.textContent = data.error;
                error.style.display = 'block';
                return;
            }
            renderOptionsMarketTable(data.records || [], tbody);
            table.style.display = 'table';
            document.getElementById('optMktCount').textContent = (data.records || []).length;
            document.getElementById('optMktTotal').textContent = data.total || 0;
            footer.style.display = 'block';
        })
        .catch(function(err) {
            loading.style.display = 'none';
            error.textContent = 'Failed to load data: ' + err.message;
            error.style.display = 'block';
        });
}

function renderOptionsMarketTable(records, tbody) {
    if (!records.length) {
        tbody.innerHTML = '<tr><td colspan="13" class="text-center text-muted py-4">No data available</td></tr>';
        return;
    }
    var html = '';
    records.forEach(function(r) {
        var chg = r.change || 0;
        var chgPct = r.changePercent || 0;
        var chgClass = chg > 0 ? 'text-success' : chg < 0 ? 'text-danger' : '';
        var symbol = r.ticker || '';
        var name = (r.name || '').toLowerCase();
        var isCall = name.indexOf('call') >= 0 || /C\d{8}$/.test(symbol);
        var typeBadge = isCall
            ? '<span class="badge bg-primary ms-1" style="font-size:9px;">C</span>'
            : '<span class="badge bg-warning text-dark ms-1" style="font-size:9px;">P</span>';

        html += '<tr>' +
            '<td><span class="fw-semibold" style="font-size:12px;">' + symbol + '</span>' + typeBadge + '</td>' +
            '<td style="font-size:12px;">' + (r.name || '') + '</td>' +
            '<td><span class="fw-bold text-primary">' + (r.underlying || '') + '</span></td>' +
            '<td class="text-end">' + fmtNum(r.strike, 2) + '</td>' +
            '<td>' + (r.expiration || '') + '</td>' +
            '<td class="text-end fw-semibold">' + fmtNum(r.price, 2) + '</td>' +
            '<td class="text-end ' + chgClass + '">' + fmtSigned(chg) + '</td>' +
            '<td class="text-end ' + chgClass + '">' + fmtSigned(chgPct) + '%</td>' +
            '<td class="text-end">' + fmtNum(r.bid, 2) + '</td>' +
            '<td class="text-end">' + fmtNum(r.ask, 2) + '</td>' +
            '<td class="text-end">' + fmtInt(r.volume) + '</td>' +
            '<td class="text-end">' + fmtInt(r.openInterest) + '</td>' +
            '<td class="text-end">' + fmtPct(r.impliedVolatility) + '</td>' +
            '</tr>';
    });
    tbody.innerHTML = html;
}

function fmtNum(v, d) { return v != null ? Number(v).toFixed(d) : '-'; }
function fmtInt(v) { return v != null ? Number(v).toLocaleString() : '-'; }
function fmtPct(v) { return v != null ? (Number(v) * 100).toFixed(1) + '%' : '-'; }
function fmtSigned(v) {
    if (v == null) return '-';
    var n = Number(v);
    return (n > 0 ? '+' : '') + n.toFixed(2);
}

window.initOptionsMarketPage = initOptionsMarketPage;
