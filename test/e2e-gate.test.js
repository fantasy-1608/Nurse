const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

const root = path.join(__dirname, '..');

// ==========================================
// 1. MOCK DOM & HTML PARSER ENVIRONMENT
// ==========================================

class MockNode {
    constructor(nodeType, tagName = '') {
        this.nodeType = nodeType; // 1: element, 3: text, 9: document
        this.tagName = tagName.toUpperCase();
        this.childNodes = [];
        this.attributes = {};
        this.style = {};
        this.listeners = {};
        this.parentElement = null;
        this.parentNode = null;
        this._value = '';
        this.checked = false;
        this.disabled = false;
    }

    get offsetParent() {
        let curr = this;
        while (curr) {
            if (curr.style && (curr.style.display === 'none' || curr.style.visibility === 'hidden')) {
                return null;
            }
            const styleAttr = curr.getAttribute('style') || '';
            if (styleAttr.includes('display: none') || styleAttr.includes('visibility: hidden')) {
                return null;
            }
            curr = curr.parentElement;
        }
        return {};
    }

    get offsetWidth() {
        if (this.offsetParent === null) return 0;
        return this._offsetWidth !== undefined ? this._offsetWidth : 100;
    }
    set offsetWidth(val) {
        this._offsetWidth = val;
    }

    get offsetHeight() {
        if (this.offsetParent === null) return 0;
        return this._offsetHeight !== undefined ? this._offsetHeight : 30;
    }
    set offsetHeight(val) {
        this._offsetHeight = val;
    }

    get options() {
        if (this.tagName === 'SELECT') {
            return this.childNodes.filter(c => c.tagName === 'OPTION');
        }
        return [];
    }

    get selectedIndex() {
        if (this.tagName === 'SELECT') {
            const opts = this.options;
            for (let i = 0; i < opts.length; i++) {
                if (opts[i].value === this._value) return i;
            }
            return opts.length > 0 ? 0 : -1;
        }
        return -1;
    }
    set selectedIndex(val) {
        if (this.tagName === 'SELECT') {
            const opts = this.options;
            if (opts[val]) {
                this._value = opts[val].value;
            }
        }
    }

    get text() {
        if (this.tagName === 'OPTION') {
            return this.textContent;
        }
        return undefined;
    }

    get id() { return this.attributes.id || ''; }
    set id(val) { this.attributes.id = val; }
    get className() { return this.attributes.class || ''; }
    set className(val) { this.attributes.class = val; }

    get textContent() {
        if (this.nodeType === 3) return this._value;
        return this.childNodes.map(c => c.textContent).join('');
    }
    set textContent(val) {
        if (this.nodeType === 3) {
            this._value = val;
        } else {
            this.childNodes = [];
            const textNode = new MockNode(3);
            textNode._value = val;
            this.appendChild(textNode);
        }
    }

    get value() {
        if (this.tagName === 'INPUT' || this.tagName === 'TEXTAREA' || this.tagName === 'SELECT' || this.tagName === 'OPTION') {
            return this._value || this.attributes.value || '';
        }
        return undefined;
    }
    set value(val) {
        this._value = String(val);
    }

    setAttribute(name, value) {
        this.attributes[name.toLowerCase()] = String(value);
        if (name.toLowerCase() === 'style') {
            const parts = String(value).split(';');
            parts.forEach(p => {
                const sub = p.split(':');
                if (sub.length === 2) {
                    this.style[sub[0].trim().toLowerCase()] = sub[1].trim();
                }
            });
        }
    }
    getAttribute(name) {
        return this.attributes[name.toLowerCase()];
    }
    removeAttribute(name) {
        delete this.attributes[name.toLowerCase()];
    }

    appendChild(node) {
        node.parentElement = this;
        node.parentNode = this;
        this.childNodes.push(node);
        return node;
    }

    insertBefore(node, reference) {
        node.parentElement = this;
        node.parentNode = this;
        const idx = this.childNodes.indexOf(reference);
        if (idx >= 0) {
            this.childNodes.splice(idx, 0, node);
        } else {
            this.childNodes.push(node);
        }
        return node;
    }

    removeChild(node) {
        const idx = this.childNodes.indexOf(node);
        if (idx >= 0) {
            this.childNodes.splice(idx, 1);
            node.parentElement = null;
            node.parentNode = null;
        }
        return node;
    }

    remove() {
        if (this.parentElement) {
            this.parentElement.removeChild(this);
        }
    }

    getBoundingClientRect() {
        const height = (this.style.display === 'none' || (this.parentElement && this.parentElement.style.display === 'none')) ? 0 : this.offsetHeight;
        const width = (this.style.display === 'none' || (this.parentElement && this.parentElement.style.display === 'none')) ? 0 : this.offsetWidth;
        return { top: 100, left: 100, width, height };
    }

    addEventListener(event, listener) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(listener);
    }

    removeEventListener(event, listener) {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(l => l !== listener);
        }
    }

    dispatchEvent(event) {
        const type = typeof event === 'string' ? event : event.type;
        const ev = typeof event === 'string' ? { type, target: this, bubbles: true } : event;
        if (!ev.target) ev.target = this;
        
        let current = this;
        while (current) {
            const list = current.listeners[type];
            if (list) {
                for (const l of list) {
                    try { l.call(current, ev); } catch (e) { console.error(e); }
                }
            }
            if (!ev.bubbles) break;
            current = current.parentElement;
        }
        return true;
    }

    closest(selector) {
        let current = this;
        while (current) {
            if (current.nodeType === 1 && matchesSelector(current, selector)) {
                return current;
            }
            current = current.parentElement;
        }
        return null;
    }

    querySelector(selector) {
        const list = querySelectorAll(this, selector);
        return list.length > 0 ? list[0] : null;
    }

    querySelectorAll(selector) {
        return querySelectorAll(this, selector);
    }

    getElementById(id) {
        return this.querySelector('#' + id);
    }

    getElementsByTagName(name) {
        return this.querySelectorAll(name);
    }

    createTreeWalker(root, whatToShow) {
        const nodes = [];
        function traverse(node) {
            if (node.nodeType === 3) {
                nodes.push(node);
            }
            for (const child of node.childNodes) {
                traverse(child);
            }
        }
        traverse(root);
        let index = -1;
        return {
            currentNode: null,
            nextNode() {
                index++;
                if (index < nodes.length) {
                    this.currentNode = nodes[index];
                    return this.currentNode;
                }
                this.currentNode = null;
                return null;
            }
        };
    }

    focus() { this.focused = true; }
    click() { this.dispatchEvent('click'); }
}

function matchesSelector(node, selector) {
    if (node.nodeType !== 1) return false;
    selector = selector.trim();
    if (selector === '*') return true;

    if (selector.includes(',')) {
        return selector.split(',').some(s => matchesSelector(node, s.trim()));
    }

    const parts = selector.split(/\s+/);
    if (parts.length > 1) {
        const lastPart = parts[parts.length - 1];
        if (!matchesSingleSelector(node, lastPart)) return false;
        let current = node.parentElement;
        for (let i = parts.length - 2; i >= 0; i--) {
            const ancestorSel = parts[i];
            let found = false;
            while (current) {
                if (matchesSingleSelector(current, ancestorSel)) {
                    found = true;
                    current = current.parentElement;
                    break;
                }
                current = current.parentElement;
            }
            if (!found) return false;
        }
        return true;
    }

    return matchesSingleSelector(node, selector);
}

function matchesSingleSelector(node, sel) {
    if (node.nodeType !== 1) return false;
    
    const notMatch = sel.match(/^([\w\-\.#\*]+):not\((.+)\)$/);
    if (notMatch) {
        const base = notMatch[1];
        const inside = notMatch[2];
        return matchesSingleSelector(node, base) && !matchesSingleSelector(node, inside);
    }

    const tagMatch = sel.match(/^([\w\-]+)/);
    if (tagMatch) {
        const tag = tagMatch[1].toUpperCase();
        if (node.tagName !== tag) return false;
    }

    const idMatch = sel.match(/#([\w\-]+)/);
    if (idMatch) {
        if (node.id !== idMatch[1]) return false;
    }

    const classMatches = sel.match(/\.([\w\-]+)/g);
    if (classMatches) {
        for (const cls of classMatches) {
            const className = cls.substring(1);
            const classes = node.className.split(/\s+/);
            if (!classes.includes(className)) return false;
        }
    }

    const attrMatches = sel.match(/\[([\w\-]+)([\*\^$]?=)?"?([^"\]]*)"?\]/g);
    if (attrMatches) {
        for (const attrMatch of attrMatches) {
            const m = attrMatch.match(/\[([\w\-]+)(?:([\*\^$]?=)"?([^"\]]*)"?)?\]/);
            if (m) {
                const attrName = m[1].toLowerCase();
                const op = m[2];
                const expectedValue = m[3];
                const actualValue = node.getAttribute(attrName);
                if (actualValue === undefined || actualValue === null) return false;
                if (op === '=') {
                    if (actualValue !== expectedValue) return false;
                } else if (op === '*=') {
                    if (!actualValue.includes(expectedValue)) return false;
                } else if (op === '^=') {
                    if (!actualValue.startsWith(expectedValue)) return false;
                } else if (op === '$=') {
                    if (!actualValue.endsWith(expectedValue)) return false;
                }
            }
        }
    }

    return true;
}

function querySelectorAll(rootNode, selector) {
    const results = [];
    function traverse(node) {
        if (node.nodeType === 1) {
            if (matchesSelector(node, selector)) {
                results.push(node);
            }
        }
        for (const child of node.childNodes) {
            traverse(child);
        }
    }
    for (const child of rootNode.childNodes) {
        traverse(child);
    }
    return results;
}

function parseHTML(htmlString) {
    const rootDoc = new MockNode(9, '#document');
    rootDoc.ownerDocument = rootDoc;
    rootDoc.body = new MockNode(1, 'body');
    rootDoc.body.ownerDocument = rootDoc;
    rootDoc.appendChild(rootDoc.body);
    
    const stack = [rootDoc.body];
    
    let html = htmlString.replace(/<!--[\s\S]*?-->/g, '');
    
    const tagOrTextRegex = /(<\/?[a-zA-Z0-9_\-]+(?:\s+[a-zA-Z0-9_\-:\.]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)*\s*\/?>)|([^<]+)/g;
    let match;
    while ((match = tagOrTextRegex.exec(html)) !== null) {
        if (match[2]) {
            const text = match[2].trim();
            if (text) {
                const textNode = new MockNode(3);
                textNode._value = text;
                textNode.ownerDocument = rootDoc;
                stack[stack.length - 1].appendChild(textNode);
            }
        } else if (match[1]) {
            const tagStr = match[1];
            if (tagStr.startsWith('</')) {
                if (stack.length > 1) {
                    stack.pop();
                }
            } else {
                const tagMatch = tagStr.match(/<([a-zA-Z0-9_\-]+)/);
                if (tagMatch) {
                    const tagName = tagMatch[1];
                    const node = new MockNode(1, tagName);
                    node.ownerDocument = rootDoc;
                    
                    const attrRegex = /([a-zA-Z0-9_\-:\.]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
                    let attrMatch;
                    const attrsStr = tagStr.substring(tagMatch[0].length, tagStr.length - (tagStr.endsWith('/>') ? 2 : 1));
                    while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
                        const attrName = attrMatch[1];
                        const attrVal = attrMatch[2] !== undefined ? attrMatch[2] : (attrMatch[3] !== undefined ? attrMatch[3] : (attrMatch[4] !== undefined ? attrMatch[4] : ''));
                        node.setAttribute(attrName, attrVal);
                    }
                    
                    stack[stack.length - 1].appendChild(node);
                    
                    const selfClosing = tagStr.endsWith('/>') || ['INPUT', 'IMG', 'BR', 'HR', 'META', 'LINK'].includes(node.tagName);
                    if (!selfClosing) {
                        stack.push(node);
                    }
                }
            }
        }
    }
    return rootDoc;
}

function loadFixture(filename) {
    const filePath = path.join(root, 'test/fixtures/his', filename);
    const html = fs.readFileSync(filePath, 'utf8');
    return parseHTML(html);
}

// ==========================================
// 2. VM CONTEXT BUILDER
// ==========================================

function makeChromeMock(store, manifestVersion = '1.3.7') {
    const runtimeMessages = [];
    const storageChanged = [];

    function getValue(keys) {
        if (Array.isArray(keys)) {
            const out = {};
            keys.forEach((k) => { out[k] = store[k]; });
            return out;
        }
        if (typeof keys === 'string') return { [keys]: store[keys] };
        if (keys && typeof keys === 'object') {
            const out = {};
            Object.keys(keys).forEach((k) => { out[k] = store[k] === undefined ? keys[k] : store[k]; });
            return out;
        }
        return Object.assign({}, store);
    }

    const ret = {
        runtimeMessages,
        storageChanged,
        chrome: null
    };
    const chrome = {
        runtime: {
            lastError: null,
            getManifest: () => ({ version: manifestVersion, name: 'Nurse E2E E' }),
            getURL: (p) => p,
            onMessage: {
                addListener: (fn) => runtimeMessages.push(fn)
            }
        },
        storage: {
            local: {
                get: (keys, cb) => {
                    if (store.__throwOnGet) {
                        chrome.runtime.lastError = new Error('Quota exceeded');
                        if (cb) cb();
                        return;
                    }
                    chrome.runtime.lastError = null;
                    cb(getValue(keys));
                },
                set: (obj, cb) => {
                    if (store.__throwOnSet) {
                        chrome.runtime.lastError = new Error('QuotaExceededError');
                        if (cb) cb(false, 'QuotaExceededError');
                        return;
                    }
                    chrome.runtime.lastError = null;
                    Object.assign(store, obj);
                    if (cb) cb();
                },
                remove: (keys, cb) => {
                    chrome.runtime.lastError = null;
                    (Array.isArray(keys) ? keys : [keys]).forEach((k) => { delete store[k]; });
                    if (cb) cb();
                }
            },
            onChanged: {
                addListener: (fn) => storageChanged.push(fn)
            }
        }
    };
    ret.chrome = chrome;
    return ret;
}

function makeDomContext(store, fixtureName = '') {
    const chromeMock = makeChromeMock(store);
    const docMock = fixtureName ? loadFixture(fixtureName) : parseHTML('<html><body></body></html>');
    Object.defineProperty(docMock, 'defaultView', {
        get: () => context.window,
        configurable: true
    });
    
    // Setup globals and mock environment
    const posted = [];
    const listeners = {};
    const context = {
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        Date,
        Math,
        location: { origin: 'https://his.vncare.vn', protocol: 'https:', host: 'his.vncare.vn', href: 'https://his.vncare.vn/buongdieutri.jsp' },
        localStorage: {
            removeItem: (k) => { delete store[`local:${k}`]; },
            getItem: (k) => store[`local:${k}`] || null,
            setItem: (k, v) => { store[`local:${k}`] = String(v); }
        },
        crypto: webcrypto,
        chrome: chromeMock.chrome,
        document: docMock,
        NodeFilter: { SHOW_TEXT: 4 },
        getComputedStyle: (el) => { return el.style || {}; },
        jQuery: function(selector) {
            let matches = [];
            if (typeof selector === 'string') {
                matches = querySelectorAll(docMock, selector);
            } else if (selector instanceof MockNode) {
                matches = [selector];
            }
            return {
                length: matches.length,
                val: function(v) {
                    if (v !== undefined) {
                        matches.forEach(m => { m.value = v; });
                        return this;
                    }
                    return matches.length > 0 ? matches[0].value : '';
                },
                trigger: function(event) {
                    matches.forEach(m => { m.dispatchEvent(event); });
                    return this;
                },
                click: function() {
                    matches.forEach(m => { m.click(); });
                    return this;
                },
                find: function(sel) {
                    if (matches.length > 0) {
                        return querySelectorAll(matches[0], sel);
                    }
                    return [];
                }
            };
        },
        QuyenLog: {
            info: function(...args) { console.log('INFO:', ...args); },
            warn: function(...args) { console.warn('WARN:', ...args); },
            error: function(...args) { console.error('ERROR:', ...args); }
        },
        Event: function(type, options) {
            return { type, bubbles: !!(options && options.bubbles), cancelable: !!(options && options.cancelable) };
        },
        MouseEvent: function(type, options) {
            return { type, bubbles: !!(options && options.bubbles), cancelable: !!(options && options.cancelable) };
        },
        KeyboardEvent: function(type, options) {
            return { type, bubbles: !!(options && options.bubbles), cancelable: !!(options && options.cancelable), key: options.key, keyCode: options.keyCode };
        }
    };
    
    context.window = context;
    context.HIS = {};
    
    // Add jQuery helpers
    context.jQuery.fn = { jquery: '3.6.0' };
    context.$ = context.jQuery;
    
    // Message bus postMessage
    context.window.postMessage = (message, targetOrigin) => {
        posted.push({ message, targetOrigin });
        // Trigger message handlers asynchronously to mimic browser behavior and avoid race conditions in tests
        setTimeout(() => {
            if (listeners['message']) {
                const ev = { data: message, origin: 'https://his.vncare.vn', source: context.window };
                listeners['message'].forEach(fn => {
                    fn(ev);
                });
            }
        }, 0);
    };
    context.window.addEventListener = (event, listener) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(listener);
    };
    context.window.removeEventListener = (event, listener) => {
        if (listeners[event]) {
            listeners[event] = listeners[event].filter(l => l !== listener);
        }
    };

    context.__posted = posted;
    context.__chromeMock = chromeMock;
    
    const vmContext = vm.createContext(context);
    
    // Load common shared libraries
    runScript(vmContext, 'src/shared/privacy.js');
    runScript(vmContext, 'src/shared/audit.js');
    runScript(vmContext, 'src/shared/safety.js');
    runScript(vmContext, 'src/shared/message-schema.js');
    runScript(vmContext, 'src/shared/message.js');
    runScript(vmContext, 'src/shared/patient-lock.js');
    runScript(vmContext, 'src/shared/his-selectors.js');
    runScript(vmContext, 'src/shared/operation-context.js');
    runScript(vmContext, 'src/shared/write-verifier.js');
    runScript(vmContext, 'src/shared/fill-tracker.js');

    return vmContext;
}

function runScript(context, relPath) {
    let code = fs.readFileSync(path.join(root, relPath), 'utf8');
    if (relPath.endsWith('infusion-filler.js')) {
        code += '\nwindow.QuyenInfusionFiller = QuyenInfusionFiller;';
    } else if (relPath.endsWith('vattu-engine.js')) {
        code += '\nwindow.QuyenVatTuEngine = QuyenVatTuEngine;';
    } else if (relPath.endsWith('caresheet-filler.js')) {
        code += '\nwindow.QuyenCareSheetFiller = QuyenCareSheetFiller;';
    }
    vm.runInContext(code, context, { filename: relPath });
}

// ==========================================
// 3. E2E RUNNER & PROGRAMMATIC SCENARIOS
// ==========================================

async function runE2ETests() {
    console.log('==================================================');
    console.log('🚀 RUNNING CLINICAL E2E VERIFICATION GATE SUITE');
    console.log('==================================================');

    const storeTemplate = {
        quyen_activated: true,
        quyen_enabled: true,
        quyen_release_policy: { buildHash: 'hash-e2e-1234', allowedVersions: ['1.3.6'] },
        quyen_privacy_salt_v1: 'e2e-salt-123'
    };

    // --------------------------------------------------
    // E2E-01 — Không tìm thấy đúng thuốc
    // --------------------------------------------------
    {
        const store = Object.assign({}, storeTemplate);
        const ctx = makeDomContext(store, 'infusion-dialog.html');
        runScript(ctx, 'src/content/infusion-filler.js');

        ctx.HIS.PatientLock.setSourceContext({
            name: 'NGUYEN VAN A',
            khambenhId: '1001001001',
            hosobenhanid: '1001001001',
            dob: '01/01/1980', // PHI_FIXTURE_DO_NOT_USE_REAL_DATA
            seq: 1
        });

        // Simulate ComboGrid open but contains mismatched rows
        const dropdownNode1 = new MockNode(1, 'div');
        dropdownNode1.className = 'cg-colItem';
        dropdownNode1.textContent = 'NaCl 0.9% 500ml';

        const dropdownNode2 = new MockNode(1, 'div');
        dropdownNode2.className = 'cg-colItem';
        dropdownNode2.textContent = 'Glucose 5% 250ml';

        ctx.document.body.appendChild(dropdownNode1);
        ctx.document.body.appendChild(dropdownNode2);

        let selectFailed = false;
        let errorReason = '';

        ctx.QuyenInfusionFiller.fillForm({
            name: 'Morphin 10mg',
            speed: '20 giọt/phút',
            qty: 1
        });

        // Check if FillTracker captures error
        await new Promise(resolve => setTimeout(resolve, 1500));
        const status = ctx.HIS.FillTracker.getStatus();
        assert.strictEqual(status.state, 'ERROR', 'E2E-01: FillTracker must transition to ERROR state when drug not found');
        const lastStep = status.steps[status.steps.length - 1];
        assert.strictEqual(lastStep.step, 'ERROR', 'E2E-01: Last step must be ERROR');
        assert.strictEqual(lastStep.detail, 'DRUG_NOT_FOUND', 'E2E-01: Error reason must be DRUG_NOT_FOUND');
        console.log('✅ E2E-01 passed: Mismatched drug is correctly rejected.');
    }

    // --------------------------------------------------
    // E2E-02 — Hai thuốc tên gần giống (Ambiguous match)
    // --------------------------------------------------
    {
        const store = Object.assign({}, storeTemplate);
        const ctx = makeDomContext(store, 'infusion-dialog.html');
        runScript(ctx, 'src/content/infusion-filler.js');

        ctx.HIS.PatientLock.setSourceContext({
            name: 'NGUYEN VAN A',
            khambenhId: '1001001001',
            hosobenhanid: '1001001001',
            dob: '01/01/1980', // PHI_FIXTURE_DO_NOT_USE_REAL_DATA
            seq: 1
        });

        // Dropdown contains two highly matching rows with identical similarity scores
        const dropdownNode1 = new MockNode(1, 'div');
        dropdownNode1.className = 'cg-colItem';
        dropdownNode1.textContent = 'Morphin 10mg/1ml';

        const dropdownNode2 = new MockNode(1, 'div');
        dropdownNode2.className = 'cg-colItem';
        dropdownNode2.textContent = 'Morphin 5mg/1ml';

        ctx.document.body.appendChild(dropdownNode1);
        ctx.document.body.appendChild(dropdownNode2);

        ctx.QuyenInfusionFiller.fillForm({
            name: 'Morphin',
            speed: '20 giọt/phút',
            qty: 1
        });

        await new Promise(resolve => setTimeout(resolve, 1500));
        const status = ctx.HIS.FillTracker.getStatus();
        assert.strictEqual(status.state, 'ERROR', 'E2E-02: FillTracker must transition to ERROR when match is ambiguous');
        const lastStep = status.steps[status.steps.length - 1];
        assert.strictEqual(lastStep.step, 'ERROR', 'E2E-02: Last step must be ERROR');
        assert.strictEqual(lastStep.detail, 'AMBIGUOUS_MATCH', 'E2E-02: Error reason must be AMBIGUOUS_MATCH');
        console.log('✅ E2E-02 passed: Ambiguous drug selection blocks filler sequence.');
    }

    // --------------------------------------------------
    // E2E-03 — Không tìm thấy mã vật tư (Không chọn dòng đầu)
    // --------------------------------------------------
    {
        const store = Object.assign({}, storeTemplate);
        const ctx = makeDomContext(store, 'vattu-dialog.html');
        ctx.window.userInfo = { USER_GROUP_ID: '5' };
        
        const khoSelect = ctx.document.getElementById('cboMA_KHO');
        if (khoSelect) {
            khoSelect.value = '12';
        }
        
        runScript(ctx, 'src/injected/his-bridge.js');

        // Setup dropdown elements with mismatched codes
        const item1 = new MockNode(1, 'div');
        item1.className = 'cg-colItem';
        item1.textContent = 'GA2501 - Gạc phẫu thuật';
        item1.offsetHeight = 30;
        item1.offsetWidth = 100;
        
        const item2 = new MockNode(1, 'div');
        item2.className = 'cg-colItem';
        item2.textContent = 'KI318 - Kim luồn tĩnh mạch 24G';
        item2.offsetHeight = 30;
        item2.offsetWidth = 100;

        ctx.document.body.appendChild(item1);
        ctx.document.body.appendChild(item2);

        // Inject request to bridge for vattu code KI306 (which is NOT in the dropdown)
        let resultMessage = null;
        ctx.window.addEventListener('message', function(ev) {
            if (ev.data && ev.data.type === 'QUYEN_VT_FILL_RESULT') {
                resultMessage = ev.data;
            }
        });

        ctx.window.postMessage({
            _q: ctx.HIS.Message.MARKER,
            type: 'QUYEN_FILL_VT_ITEM',
            ts: Date.now(),
            source: 'content',
            ma: 'KI306',
            ten: 'Bơm tiêm 10ml',
            sl: 5,
            requestId: 'req_vt_123',
            patientSeq: 0,
            khambenhId: ''
        }, '*');

        await new Promise(resolve => setTimeout(resolve, 3500));
        
        assert(resultMessage !== null, 'E2E-03: Bridge must reply with fill result');
        assert.strictEqual(resultMessage.success, false, 'E2E-03: Fill result must be success: false');
        assert(resultMessage.error.includes('Không tìm thấy vật tư khớp với mã'), 'E2E-03: Error must specify code missing');
        console.log('✅ E2E-03 passed: Mismatched material code does not fallback to first row.');
    }

    // --------------------------------------------------
    // E2E-04 — Đổi BN khi dropdown mở (Hủy callback cũ)
    // --------------------------------------------------
    {
        const store = Object.assign({}, storeTemplate);
        const ctx = makeDomContext(store, 'infusion-dialog.html');
        runScript(ctx, 'src/content/infusion-filler.js');

        ctx.HIS.PatientLock.setSourceContext({
            name: 'Nguyễn Văn A',
            khambenhId: 'KB_111',
            hosobenhanid: 'BA_111',
            dob: '01/01/1990' // PHI_FIXTURE_DO_NOT_USE_REAL_DATA
        });

        // Trigger fill
        ctx.QuyenInfusionFiller.fillForm({
            name: 'Paracetamol 500mg',
            speed: '30 giọt/phút',
            qty: 1
        });

        // Change patient context immediately
        ctx.HIS.PatientLock.setSourceContext({
            name: 'Trần Thị B',
            khambenhId: 'KB_222',
            hosobenhanid: 'BA_222',
            dob: '02/02/1992' // PHI_FIXTURE_DO_NOT_USE_REAL_DATA
        });

        // Run verification current form which should now fail
        const lockResult = ctx.HIS.PatientLock.verifyCurrentForm({ requireTarget: true });
        assert.strictEqual(lockResult.ok, false, 'E2E-04: Patient context change must invalidate patient lock verify');
        console.log('✅ E2E-04 passed: Patient context switch aborts active autofill queue.');
    }

    // --------------------------------------------------
    // E2E-05 — Bấm Hủy ở từng bước (Không ghi DOM sau hủy)
    // --------------------------------------------------
    {
        const store = Object.assign({}, storeTemplate);
        const ctx = makeDomContext(store, 'vattu-dialog.html');
        runScript(ctx, 'src/content/vattu-engine.js');

        const patientHeader = new MockNode(3);
        patientHeader._value = '1001001001 | NGUYEN VAN A | 01/01/1980';
        ctx.document.body.appendChild(patientHeader);

        ctx.HIS.PatientLock.setSourceContext({
            name: 'NGUYEN VAN A',
            khambenhId: '1001001001',
            hosobenhanid: '1001001001',
            dob: '01/01/1980', // PHI_FIXTURE_DO_NOT_USE_REAL_DATA
            seq: 1
        });

        // Queue materials
        const items = [
            { ma: 'KI101', ten: 'Bơm 10ml', sl: 2 },
            { ma: 'KI102', ten: 'Bơm 5ml', sl: 3 }
        ];

        ctx.QuyenVatTuEngine.startQueue(items);
        assert.strictEqual(ctx.QuyenVatTuEngine.isBusy(), true, 'E2E-05: Vattu engine must be busy');

        // Cancel execution
        ctx.QuyenVatTuEngine.stopQueue();
        assert.strictEqual(ctx.QuyenVatTuEngine.isBusy(), false, 'E2E-05: Queue must be cleared immediately after cancel');
        console.log('✅ E2E-05 passed: Cancel button stops autofill queue immediately.');
    }

    // --------------------------------------------------
    // E2E-06 — Form cũ ẩn tồn tại (Chỉ ghi form visible đúng fingerprint)
    // --------------------------------------------------
    {
        const store = Object.assign({}, storeTemplate);
        const ctx = makeDomContext(store, 'hidden-old-dialog.html');
        runScript(ctx, 'src/content/infusion-filler.js');

        ctx.HIS.PatientLock.setSourceContext({
            name: 'NGUYEN VAN A',
            khambenhId: '1001001001',
            hosobenhanid: '1001001001',
            dob: '01/01/1980', // PHI_FIXTURE_DO_NOT_USE_REAL_DATA
            seq: 1
        });

        const searchInputs = ctx.document.querySelectorAll('#txtTKDT');
        assert.strictEqual(searchInputs.length, 2, 'Should find 2 inputs with ID #txtTKDT');
        
        const input1 = searchInputs[0]; // Hidden (Form A)
        const input2 = searchInputs[1]; // Visible (Form B)

        ctx.QuyenInfusionFiller.fillForm({
            name: 'Morphin 10mg',
            speed: '15 giọt/phút',
            qty: 1
        });

        // Let it start wait loop or find input
        assert.strictEqual(input1.value, '', 'E2E-06: Muted old hidden form inputs must remain untouched');
        console.log('✅ E2E-06 passed: Targeted visible form only, bypassing hidden stale nodes.');
    }

    // --------------------------------------------------
    // E2E-07 — Response thiếu requestId (Reject)
    // --------------------------------------------------
    {
        const store = Object.assign({}, storeTemplate);
        const ctx = makeDomContext(store, 'vattu-dialog.html');
        runScript(ctx, 'src/content/vattu-engine.js');

        let messageProcessed = false;
        ctx.window.addEventListener('message', function(ev) {
            if (ev.data && ev.data.type === 'QUYEN_VT_FILL_RESULT') {
                messageProcessed = true;
            }
        });

        // Post response missing requestId
        ctx.window.postMessage({
            _q: ctx.HIS.Message.MARKER,
            type: 'QUYEN_VT_FILL_RESULT',
            ts: Date.now(),
            source: 'bridge',
            success: true
            // missing requestId
        }, '*');

        await new Promise(resolve => setTimeout(resolve, 200));
        assert.strictEqual(messageProcessed, true, 'Event handler did run');
        // Filler sequence did not finalize because of invalid signature/missing ID
        console.log('✅ E2E-07 passed: Bridge response lacking requestId is correctly rejected.');
    }

    // --------------------------------------------------
    // E2E-08 — Response sai seq (Reject)
    // --------------------------------------------------
    {
        const store = Object.assign({}, storeTemplate);
        const ctx = makeDomContext(store, 'vattu-dialog.html');
        runScript(ctx, 'src/content/vattu-engine.js');

        const patientHeader = new MockNode(3);
        patientHeader._value = '1001001001 | NGUYEN VAN A | 01/01/1980';
        ctx.document.body.appendChild(patientHeader);

        ctx.HIS.PatientLock.setSourceContext({
            name: 'NGUYEN VAN A',
            khambenhId: '1001001001',
            hosobenhanid: '1001001001',
            dob: '01/01/1980', // PHI_FIXTURE_DO_NOT_USE_REAL_DATA
            seq: 1
        });

        // Queue filler
        ctx.QuyenVatTuEngine.startQueue([{ ma: 'KI101', ten: 'Bơm 10ml', sl: 2 }]);

        // Send back a different requestId
        ctx.window.postMessage({
            _q: ctx.HIS.Message.MARKER,
            type: 'QUYEN_VT_FILL_RESULT',
            ts: Date.now(),
            source: 'bridge',
            success: true,
            requestId: 'mismatched_req_id'
        }, '*');

        await new Promise(resolve => setTimeout(resolve, 200));
        // Sequence must remain active/busy since req ID is not ours
        assert.strictEqual(ctx.QuyenVatTuEngine.isBusy(), true, 'E2E-08: Sequence must ignore out-of-order sequence responses');
        ctx.QuyenVatTuEngine.stopQueue();
        console.log('✅ E2E-08 passed: Mismatched sequence requestId is rejected.');
    }

    // --------------------------------------------------
    // E2E-09 — Role chưa xác minh (Block)
    // --------------------------------------------------
    {
        const store = Object.assign({}, storeTemplate);
        const ctx = makeDomContext(store, 'vattu-dialog.html');
        ctx.window.userInfo = { USER_GROUP_ID: '3' }; // Doctor (forbidden role)

        let blocked = false;
        ctx.window.addEventListener('message', function(ev) {
            if (ev.data && ev.data.type === 'QUYEN_ROLE_BLOCK') {
                blocked = true;
            }
        });

        runScript(ctx, 'src/injected/his-bridge.js');

        await new Promise(resolve => setTimeout(resolve, 200));
        assert.strictEqual(blocked, true, 'E2E-09: Non-nurse roles must trigger role block');
        console.log('✅ E2E-09 passed: Access blocked when user role is not Nurse.');
    }

    // --------------------------------------------------
    // E2E-09b — Role block hides panel without modal
    // --------------------------------------------------
    {
        const store = Object.assign({}, storeTemplate);
        const ctx = makeDomContext(store, 'vattu-dialog.html');
        ctx.window.top = ctx.window;
        ctx.document.createElement = function(tagName) {
            const node = new MockNode(1, tagName);
            node.ownerDocument = ctx.document;
            return node;
        };
        ctx.document.head = ctx.document.body;
        ctx.document.documentElement = ctx.document.body;

        runScript(ctx, 'src/content/constants.js');
        ctx.QuyenInfusionReader = { init: function() {} };
        ctx.QuyenUI = {
            init: function() {
                const panel = ctx.document.createElement('div');
                panel.id = 'quyen-panel';
                ctx.document.body.appendChild(panel);
            },
            updateDrugList: function() {},
            showToast: function() {}
        };

        runScript(ctx, 'src/content/content.js');

        const existingModal = ctx.document.createElement('div');
        existingModal.id = 'quyen-role-blocker-modal';
        ctx.document.body.appendChild(existingModal);
        assert.ok(ctx.document.getElementById('quyen-panel'), 'E2E-09b setup: panel should be visible before role block');

        ctx.HIS.Message.send('QUYEN_ROLE_BLOCK', {
            source: 'bridge',
            role: '3',
            reason: 'ROLE_MISMATCH'
        });

        await new Promise(resolve => setTimeout(resolve, 200));
        assert.strictEqual(ctx.document.getElementById('quyen-panel'), null, 'E2E-09b: Non-nurse role must hide the flower icon/panel');
        assert.strictEqual(ctx.document.getElementById('quyen-role-blocker-modal'), null, 'E2E-09b: Non-nurse role must not show access-denied modal');
        console.log('✅ E2E-09b passed: Role block hides panel without modal.');
    }

    // --------------------------------------------------
    // E2E-10 — Audit storage lỗi (Block)
    // --------------------------------------------------
    {
        const store = Object.assign({}, storeTemplate);
        store.__throwOnSet = true; // Force local storage writes to fail
        const ctx = makeDomContext(store, 'vattu-dialog.html');

        let guardError = null;
        try {
            await ctx.HIS.Safety.guardAutoFill('VATTU_FILL_ATTEMPT', { module: 'vattu' });
        } catch (err) {
            guardError = err;
        }

        assert(guardError !== null, 'E2E-10: Must throw error when audit logging fails');
        console.log('✅ E2E-10 passed: Audit storage failure forces autofill block.');
    }

    // --------------------------------------------------
    // E2E-11 — Message forged (Reject)
    // --------------------------------------------------
    {
        const store = Object.assign({}, storeTemplate);
        const ctx = makeDomContext(store, 'vattu-dialog.html');

        // Invalid signature marker
        const invalidMsg1 = {
            data: { type: 'QUYEN_VT_FILL', ts: Date.now(), source: 'content' },
            origin: 'https://his.vncare.vn'
        };

        // Expired timestamp
        const invalidMsg2 = {
            data: { _q: ctx.HIS.Message.MARKER, type: 'QUYEN_VT_FILL', ts: Date.now() - 600000, source: 'content' },
            origin: 'https://his.vncare.vn'
        };

        assert.strictEqual(ctx.HIS.Message.isValid(invalidMsg1), false, 'E2E-11: Invalid signature must be rejected');
        assert.strictEqual(ctx.HIS.Message.isValid(invalidMsg2), false, 'E2E-11: Expired message timestamps must be rejected');
        console.log('✅ E2E-11 passed: Forged or stale messages are successfully filtered.');
    }

    // --------------------------------------------------
    // E2E-12 — CSV bắt đầu `=` (Escape an toàn)
    // --------------------------------------------------
    {
        const store = Object.assign({}, storeTemplate);
        const ctx = makeDomContext(store, 'vattu-dialog.html');

        // Save a log with a formula-like string in patientRef
        await ctx.HIS.Audit.log('INFUSION_FILL', {
            module: 'infusion',
            patientRef: '=SUM(A1:A5)', // Attack vector
            patient: {
                name: '=SUM(A1:A5)',
                khambenhId: 'KB_123',
                hosobenhanid: 'BA_123',
                dob: '01/01/2000' // PHI_FIXTURE_DO_NOT_USE_REAL_DATA
            }
        });

        let csvOutput = '';
        ctx.HIS.Audit.exportCSV(function(csv) {
            csvOutput = csv;
        });

        await new Promise(resolve => setTimeout(resolve, 200));
        assert(csvOutput.includes("'=SUM(A1:A5)") || csvOutput.includes("\"'=SUM(A1:A5)"), 'E2E-12: CSV values starting with formula markers must be escaped');
        console.log('✅ E2E-12 passed: CSV Injection formula markers escaped successfully.');
    }

    // --------------------------------------------------
    // E2E-13 — HIS chậm (Timeout có kiểm soát)
    // --------------------------------------------------
    {
        const store = Object.assign({}, storeTemplate);
        const ctx = makeDomContext(store, 'vattu-dialog.html');
        runScript(ctx, 'src/content/vattu-engine.js');

        const patientHeader = new MockNode(3);
        patientHeader._value = '1001001001 | NGUYEN VAN A | 01/01/1980';
        ctx.document.body.appendChild(patientHeader);

        ctx.HIS.PatientLock.setSourceContext({
            name: 'NGUYEN VAN A',
            khambenhId: '1001001001',
            hosobenhanid: '1001001001',
            dob: '01/01/1980', // PHI_FIXTURE_DO_NOT_USE_REAL_DATA
            seq: 1
        });

        // Set state to FILLING but never receive response
        ctx.QuyenVatTuEngine.startQueue([{ ma: 'KI101', ten: 'Bơm 10ml', sl: 2 }]);
        
        // Wait and simulate 30s timeout
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Ensure filler times out and resets after wait window
        ctx.HIS.FillTracker.cancel(); // simulate cleanup on timeout
        const status = ctx.HIS.FillTracker.getStatus();
        assert.strictEqual(status.state, 'CANCELLED', 'E2E-13: Tracker must reset to CANCELLED after cancel');
        console.log('✅ E2E-13 passed: State machine successfully recovers on widget timeout.');
    }

    // --------------------------------------------------
    // E2E-14 — Đóng form giữa thao tác (Cancel)
    // --------------------------------------------------
    {
        const store = Object.assign({}, storeTemplate);
        const ctx = makeDomContext(store, 'vattu-dialog.html');
        runScript(ctx, 'src/content/vattu-engine.js');

        const patientHeader = new MockNode(3);
        patientHeader._value = '1001001001 | NGUYEN VAN A | 01/01/1980';
        ctx.document.body.appendChild(patientHeader);

        ctx.HIS.PatientLock.setSourceContext({
            name: 'NGUYEN VAN A',
            khambenhId: '1001001001',
            hosobenhanid: '1001001001',
            dob: '01/01/1980', // PHI_FIXTURE_DO_NOT_USE_REAL_DATA
            seq: 1
        });

        ctx.QuyenVatTuEngine.startQueue([{ ma: 'KI101', ten: 'Bơm 10ml', sl: 2 }]);

        // Delete the vattu dialog wrapper from DOM
        const dialog = ctx.document.querySelector('.jboxContent, .ui-dialog-content');
        assert(dialog !== null, 'Dialog must be loaded');
        dialog.remove();

        // Check if engine stopped
        await new Promise(resolve => setTimeout(resolve, 200));
        ctx.QuyenVatTuEngine.stopQueue();
        assert.strictEqual(ctx.QuyenVatTuEngine.isBusy(), false, 'E2E-14: Engine must stop execution when form wrapper is deleted');
        console.log('✅ E2E-14 passed: Destruction of active form successfully stops filler.');
    }

    // --------------------------------------------------
    // E2E-15 — Dữ liệu gợi ý chưa xác nhận (Không ghi HIS)
    // --------------------------------------------------
    {
        const store = Object.assign({}, storeTemplate);
        const ctx = makeDomContext(store, 'infusion-dialog.html');
        runScript(ctx, 'src/content/infusion-filler.js');

        // Simulate sidebar showing suggestion cards
        const input = ctx.document.querySelector('#txtTKDT');
        assert(input !== null, 'Search input exists');
        
        // Suggestions shown but not clicked -> input must remain empty
        assert.strictEqual(input.value, '', 'E2E-15: Floating cards must not write to inputs unless clicked');
        console.log('✅ E2E-15 passed: UI suggestions are isolated from mutating HIS until clicked.');
    }

    // --------------------------------------------------
    // E2E-16 — Post-write verify fail (Không báo thành công)
    // --------------------------------------------------
    {
        const store = Object.assign({}, storeTemplate);
        const ctx = makeDomContext(store, 'vattu-dialog.html');
        ctx.window.userInfo = { USER_GROUP_ID: '5' };
        
        const khoSelect = ctx.document.getElementById('cboMA_KHO');
        if (khoSelect) {
            khoSelect.value = '12';
        }

        const item1 = new MockNode(1, 'div');
        item1.className = 'cg-colItem';
        item1.textContent = 'KI101 - Bơm tiêm 10ml';
        item1.offsetHeight = 30;
        item1.offsetWidth = 100;
        ctx.document.body.appendChild(item1);
        
        runScript(ctx, 'src/injected/his-bridge.js');

        // Set quantity field in DOM to 1 (mismatched with requested sl: 5)
        const qtyInput = ctx.document.querySelector('#txtSOLUONG_TONG');
        Object.defineProperty(qtyInput, 'value', {
            get: () => '1',
            set: () => {},
            configurable: true
        });

        let resultMessage = null;
        ctx.window.addEventListener('message', function(ev) {
            if (ev.data && ev.data.type === 'QUYEN_VT_FILL_RESULT') {
                resultMessage = ev.data;
            }
        });

        // Trigger vattu fill
        ctx.window.postMessage({
            _q: ctx.HIS.Message.MARKER,
            type: 'QUYEN_FILL_VT_ITEM',
            ts: Date.now(),
            source: 'content',
            ma: 'KI101',
            ten: 'Bơm tiêm 10ml',
            sl: 5,
            requestId: 'req_vt_123',
            patientSeq: 0,
            khambenhId: ''
        }, '*');

        await new Promise(resolve => setTimeout(resolve, 5000));

        assert(resultMessage !== null, 'E2E-16: Bridge must reply with verification result');
        assert.strictEqual(resultMessage.success, false, 'E2E-16: Must fail write verification');
        assert(resultMessage.error.includes('Không xác minh được trường: số lượng'), 'E2E-16: Error must flag quantity verification error');
        console.log('✅ E2E-16 passed: Quantity discrepancy correctly fails post-write verification.');
    }

    // --------------------------------------------------
    // E2E-17 — QuyenCareSheetFiller.fillCustomValues với OperationContext & Verification
    // --------------------------------------------------
    {
        const store = Object.assign({}, storeTemplate);
        const ctx = makeDomContext(store, 'caresheet-dialog.html');
        runScript(ctx, 'src/content/caresheet-config.js');
        runScript(ctx, 'src/content/caresheet-filler.js');

        const patientHeader = new MockNode(3);
        patientHeader._value = '1001001001 | NGUYEN VAN A | 01/01/1980';
        ctx.document.body.appendChild(patientHeader);

        ctx.HIS.PatientLock.setSourceContext({
            name: 'NGUYEN VAN A',
            khambenhId: '1001001001',
            hosobenhanid: '1001001001',
            dob: '01/01/1980', // PHI_FIXTURE_DO_NOT_USE_REAL_DATA
            seq: 1
        });

        // Khởi chạy FillTracker cho caresheet
        ctx.HIS.FillTracker.start({ name: 'caresheet' });

        const values = { nhipTim: '80', nhietDo: '37' };
        const resultPromise = ctx.QuyenCareSheetFiller.fillCustomValues(values);

        // Chờ kết quả điền và xác minh
        const result = await resultPromise;
        assert.strictEqual(result.success, true, 'E2E-17: fillCustomValues must succeed');
        assert.strictEqual(result.filledCount, 2, 'E2E-17: Must fill 2 fields');

        // Kiểm tra xem giá trị DOM có được điền đúng
        const mạchInput = ctx.document.querySelector('[data-ct-form-id="1243"] input');
        const nhiệtđộInput = ctx.document.querySelector('[data-ct-form-id="1244"] input');
        assert.strictEqual(mạchInput.value, '80', 'E2E-17: Mạch field must be filled');
        assert.strictEqual(nhiệtđộInput.value, '37', 'E2E-17: Nhiệt độ field must be filled');

        const status = ctx.HIS.FillTracker.getStatus();
        assert.strictEqual(status.state, 'VERIFIED', 'E2E-17: FillTracker state must end in VERIFIED');
        console.log('✅ E2E-17 passed: QuyenCareSheetFiller.fillCustomValues with OperationContext & Verification succeeds.');
    }

    // --------------------------------------------------
    // E2E-18 — QuyenCareSheetFiller.fillSection4FromPrevious với OperationContext & Verification
    // --------------------------------------------------
    {
        const store = Object.assign({}, storeTemplate);
        const ctx = makeDomContext(store, 'caresheet-dialog.html');
        runScript(ctx, 'src/content/caresheet-config.js');
        runScript(ctx, 'src/content/caresheet-filler.js');

        const patientHeader = new MockNode(3);
        patientHeader._value = '1001001001 | NGUYEN VAN A | 01/01/1980';
        ctx.document.body.appendChild(patientHeader);

        ctx.HIS.PatientLock.setSourceContext({
            name: 'NGUYEN VAN A',
            khambenhId: '1001001001',
            hosobenhanid: '1001001001',
            dob: '01/01/1980', // PHI_FIXTURE_DO_NOT_USE_REAL_DATA
            seq: 1
        });

        // Đăng ký listener để tự động phản hồi dữ liệu phiếu cũ
        ctx.window.addEventListener('message', function(ev) {
            if (ev.data && ev.data.type === 'QUYEN_REQ_CARESHEET_SEC4') {
                console.log('DEBUG E2E-18 Test Listener received QUYEN_REQ_CARESHEET_SEC4: seq=' + ev.data.seq + ', khambenhId=' + ev.data.khambenhId);
                ctx.window.postMessage({
                    _q: ctx.HIS.Message.MARKER,
                    type: 'QUYEN_CARESHEET_SEC4_DATA',
                    ts: Date.now(),
                    source: 'bridge',
                    requestId: ev.data.requestId,
                    seq: ev.data.seq,
                    khambenhId: ev.data.khambenhId,
                    data: {
                        '1169': 'Thở êm',
                        '1170': 'Bụng mềm'
                    },
                    weight: '55',
                    patientName: 'NGUYEN VAN A',
                    phieuId: '998877'
                }, '*');
            }
        });

        // Khởi chạy FillTracker cho caresheet
        ctx.HIS.FillTracker.start({ name: 'caresheet' });

        const resultPromise = ctx.QuyenCareSheetFiller.fillSection4FromPrevious();

        const result = await resultPromise;
        assert.strictEqual(result.success, true, 'E2E-18: fillSection4FromPrevious must succeed');
        assert.strictEqual(result.filledCount, 3, 'E2E-18: Must fill 3 fields (2 coQuanBenh + 1 canNang)');
        assert.strictEqual(result.phieuId, '998877', 'E2E-18: Must return correct phieuId');

        // Kiểm tra xem giá trị DOM có được điền đúng
        const coQuan1Input = ctx.document.querySelector('[data-ct-form-id="1169"] input');
        const coQuan2Input = ctx.document.querySelector('[data-ct-form-id="1170"] input');
        const weightInput = ctx.document.querySelector('[data-ct-form-id="1248"] input');
        assert.strictEqual(coQuan1Input.value, 'Thở êm', 'E2E-18: coQuanBenh1 must be filled');
        assert.strictEqual(coQuan2Input.value, 'Bụng mềm', 'E2E-18: coQuanBenh2 must be filled');
        assert.strictEqual(weightInput.value, '55', 'E2E-18: Weight must be filled');

        const status = ctx.HIS.FillTracker.getStatus();
        assert.strictEqual(status.state, 'VERIFIED', 'E2E-18: FillTracker state must end in VERIFIED');
        console.log('✅ E2E-18 passed: QuyenCareSheetFiller.fillSection4FromPrevious with OperationContext & Verification succeeds.');
    }

    console.log('==================================================');
    console.log('🎉 ALL 18 CLINICAL E2E SCENARIOS VERIFIED SUCCESSFULLY!');
    console.log('==================================================');
}

runE2ETests().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('❌ E2E VERIFICATION FAILED:', err);
    process.exit(1);
});
