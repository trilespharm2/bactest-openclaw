function getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    const headers = {};
    if (token) {
        headers['Authorization'] = 'Bearer ' + token;
    }
    return headers;
}

function authFetch(url, options) {
    if (!options) options = {};
    var tokenHeaders = getAuthHeaders();
    options.credentials = 'include';
    options.headers = Object.assign({}, options.headers || {}, tokenHeaders);
    return fetch(url, options);
}
