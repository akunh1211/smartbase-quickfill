// ==UserScript==
// @name         SmartBase מילוי מהיר לכרטיס עבודה
// @namespace    https://smartbase-quickfill.local/
// @version      1.7.0
// @description  מילוי מהיר של כרטיסי עבודה ב-SmartBase: אשף רציף של כל השלבים ומילוי אוטומטי מלא מהבית ועד החתימה.
// @author       SmartBase QuickFill
// @downloadURL  https://akunh1211.github.io/smartbase-quickfill/smartbase-quickfill.user.js
// @updateURL    https://akunh1211.github.io/smartbase-quickfill/smartbase-quickfill.user.js
// @match        https://smartbase.digital.idf.il/*
// @match        *://*.smartbase.digital.idf.il/*
// @match        *://*/*smartbase*
// @match        file:///*smartbase*.html
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_VERSION = '1.7.0';

  // Allow hot-upgrading if an older version was already mounted
  const existingHost = document.getElementById('sb-qf-host');
  if (window.__SMARTBASE_QUICKFILL_VERSION__ === SCRIPT_VERSION && existingHost) return;
  if (existingHost) existingHost.remove();
  window.__SMARTBASE_QUICKFILL_LOADED__ = true;
  window.__SMARTBASE_QUICKFILL_VERSION__ = SCRIPT_VERSION;

  // Hide local demo's built-in FAB if running on smartbase.html test page
  const demoFab = document.getElementById('ext-fab');
  if (demoFab && document.getElementById('ext-drawer')) {
    demoFab.style.display = 'none';
  }

  const STORAGE_KEY = 'sb_quickfill_v2';

  const TRIP_PURPOSES = [
    'תפקיד', 'נסיעה פרטית', 'אחזקה', 'חניית לילה', 'נסיעת מבחן לרכב',
    'מבחן שליטה', 'טיפול שבועי', 'טיפול חודשי', 'טיפול תלת', 'רענון נהג מילואים',
    'הכשרה כביש יום', 'הכשרה כביש לילה', 'הכשרה שטח יום', 'הכשרה שטח לילה', 'הכרת הרכב עיוני ומעשי',
    'הכרת גזרה', 'טיפול דו-שבועי', 'תרגולת 3.07', 'רענון נהג מילואים בשטח', 'הכשרת נגרר',
    'לינת בית', 'רענון מעשי למלגזה', 'לימוד נהיגה', 'ציר קיצון', 'רענון נהג',
    'הובלת חומ"ס', 'רענון חומ"ס', 'הדרכת נהיגה', 'מפגש כביש מסלול', 'נהיגה חשוכה',
    'רענון נהיגה חשוכה', 'גרירת מטוס', 'נהיגה עצמית', 'ביצוע היתר 52', 'תוכן רפואי היתר 52',
    'נסיעה למוסך ללא מסמכי רכב', 'הכשרת צמ"ה', 'הכשרת רכב חשמלי', 'הכשרת מלגזה', 'היתר גרור 58'
  ];

  const FIELD_DEFS = [
    { key: 'origin', label: 'מוצא (שלב 1)', card: 'לאן נוסעים', hints: ['מוצא', 'בסיס מוצא', 'origin'] },
    { key: 'addStopBtn', label: 'כפתור הוספת עצירה', card: 'לאן נוסעים', hints: ['הוספת עצירה', 'הוסף עצירה'], isButton: true },
    { key: 'stop', label: 'תחנת עצירה (שלב 1)', card: 'לאן נוסעים', hints: ['עצירה', 'תחנת עצירה', 'ביניים', 'stop'] },
    { key: 'dest', label: 'יעד (שלב 1)', card: 'לאן נוסעים', hints: ['יעד', 'יעד נסיעה', 'dest'] },
    { key: 'purpose', label: 'מטרת הנסיעה (שלב 1)', card: 'מהי מטרת הנסיעה', hints: ['מהי מטרת הנסיעה', 'מטרת הנסיעה', 'תפקיד', 'purpose'] },
    { key: 'nextStep1Btn', label: 'כפתור המשך (שלב 1 ← 2)', hints: ['המשך', 'המשך לשיבוץ'], isButton: true },
    { key: 'plate', label: 'מספר הרכב (שלב 2)', card: 'מספר הרכב', hints: ["מס' לוחית רישוי/צ'", 'לוחית רישוי', 'מספר הרכב', 'plate'] },
    { key: 'driverId', label: 'ת"ז נהג (שלב 2)', card: 'בחירת נהג', hints: ['תעודת זהות', 'נהג', 'driver'] },
    { key: 'cmdId', label: 'ת"ז מפקד משימה (שלב 2)', card: 'בחירת מפקד משימה', hints: ['תעודת זהות', 'מפקד משימה', 'cmd'] },
    { key: 'dispId', label: 'ת"ז מפקד משלח (שלב 2)', card: 'בחירת מפקד משלח', hints: ['תעודת זהות', 'משלח', 'disp'] },
    { key: 'nextStep2Btn', label: 'כפתור המשך (שלב 2 ← 3)', hints: ['המשך', 'המשך לאישור'], isButton: true },
    { key: 'ackCheckbox', label: 'קראתי והבנתי (שלב 3)', hints: ['קראתי והבנתי את ההנחיות', 'קראתי והבנתי', 'הנחיות'] },
    { key: 'odometer', label: 'קילומטראז\' (שלב 3)', card: 'קילומטראז', hints: ['ק"מ', 'קילומטראז', 'קילומטר', 'odometer'] }
  ];

  // ---------------------------------------------------------------------------
  // 1. Local Storage & Clipboard
  // ---------------------------------------------------------------------------
  function getDefaultData() {
    return {
      myId: '',
      theme: 'dark',
      purposeCounts: { 'תפקיד': 1 },
      lastOdometers: {},
      pendingNameLookup: {},
      customSelectors: {},
      routes: [
        {
          name: 'בית הלל ◄ מרחב צפון ◄ בית הלל',
          origin: 'בית הלל',
          stop: 'מרחב צפון',
          dest: 'בית הלל',
          purpose: 'תפקיד',
          tripType: 'נסיעה מנהלתית'
        }
      ],
      vehicles: [],
      people: []
    };
  }

  function storageGet(key) {
    try {
      if (window.AndroidStorage && typeof window.AndroidStorage.get === 'function') {
        const v = window.AndroidStorage.get(key);
        if (v) return v;
      }
    } catch (_) {}
    try {
      if (typeof GM_getValue === 'function') {
        const v = GM_getValue(key, null);
        if (v !== null && v !== undefined) return v;
      }
    } catch (_) {}
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      if (window.AndroidStorage && typeof window.AndroidStorage.set === 'function') {
        window.AndroidStorage.set(key, value);
      }
    } catch (_) {}
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, value);
      }
    } catch (_) {}
    try {
      localStorage.setItem(key, value);
    } catch (_) {}
  }

  async function copyToClipboard(text, promptTitle) {
    try {
      if (window.AndroidStorage && typeof window.AndroidStorage.copyText === 'function') {
        window.AndroidStorage.copyText(text);
        return true;
      }
    } catch (_) {}
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}
    window.prompt(promptTitle || 'העתק:', text);
    return false;
  }

  function loadData() {
    try {
      const raw = storageGet(STORAGE_KEY);
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const def = getDefaultData();
      if (!parsed || typeof parsed !== 'object') return def;
      return {
        myId: typeof parsed.myId === 'string' ? parsed.myId.replace(/\D/g, '').slice(0, 9) : '',
        theme: parsed.theme === 'light' ? 'light' : 'dark',
        purposeCounts: parsed.purposeCounts && typeof parsed.purposeCounts === 'object' ? parsed.purposeCounts : def.purposeCounts,
        lastOdometers: parsed.lastOdometers && typeof parsed.lastOdometers === 'object' ? parsed.lastOdometers : {},
        pendingNameLookup: parsed.pendingNameLookup && typeof parsed.pendingNameLookup === 'object' ? parsed.pendingNameLookup : {},
        customSelectors: parsed.customSelectors && typeof parsed.customSelectors === 'object' ? parsed.customSelectors : {},
        routes: Array.isArray(parsed.routes) ? parsed.routes : def.routes,
        vehicles: Array.isArray(parsed.vehicles) ? parsed.vehicles : [],
        people: Array.isArray(parsed.people) ? parsed.people : []
      };
    } catch (_) {
      return getDefaultData();
    }
  }

  let appData = loadData();

  function saveData() {
    try {
      storageSet(STORAGE_KEY, JSON.stringify(appData));
    } catch (_) {
      showToast('לא ניתן לשמור לאחסון המקומי');
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Helpers & State
  // ---------------------------------------------------------------------------
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getSortedTripPurposes() {
    const counts = appData.purposeCounts || {};
    return TRIP_PURPOSES
      .map((purpose, idx) => ({ purpose, count: Number(counts[purpose] || 0), idx }))
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.idx - b.idx))
      .map(item => item.purpose);
  }

  function recordPurposeUsage(purpose) {
    if (!purpose || !TRIP_PURPOSES.includes(purpose)) return;
    if (!appData.purposeCounts || typeof appData.purposeCounts !== 'object') appData.purposeCounts = {};
    appData.purposeCounts[purpose] = Number(appData.purposeCounts[purpose] || 0) + 1;
    saveData();
  }

  function autoSaveRouteIfNew(origin, stop, dest, purpose, tripType) {
    const o = String(origin || '').trim();
    const s = String(stop || '').trim();
    const d = String(dest || '').trim();
    if (!o || !d) return null;

    const existingIdx = appData.routes.findIndex(
      r => (r.origin || '').trim() === o && (r.stop || '').trim() === s && (r.dest || '').trim() === d
    );
    if (existingIdx !== -1) {
      appData.routes[existingIdx].purpose = purpose || appData.routes[existingIdx].purpose || 'תפקיד';
      appData.routes[existingIdx].tripType = tripType || appData.routes[existingIdx].tripType || 'נסיעה מנהלתית';
      saveData();
      return existingIdx;
    }

    const routeName = `${o}${s ? ` ◄ ${s}` : ''} ◄ ${d}`;
    appData.routes.unshift({
      name: routeName,
      origin: o,
      stop: s,
      dest: d,
      purpose: purpose || 'תפקיד',
      tripType: tripType || 'נסיעה מנהלתית'
    });
    saveData();
    showToast(`מסלול חדש נשמר אוטומטית: ${routeName}`);
    return 0;
  }

  const extState = {
    open: false,
    tab: 'fill',
    step: 1,
    editingMyId: !appData.myId,
    showAdvanced: false,
    selectedRouteIdx: appData.routes.length > 0 ? '0' : '',
    quickOrigin: appData.routes[0]?.origin || '',
    quickStop: appData.routes[0]?.stop || '',
    quickDest: appData.routes[0]?.dest || '',
    quickPurpose: appData.routes[0]?.purpose || 'תפקיד',
    quickTripType: appData.routes[0]?.tripType || 'נסיעה מנהלתית',
    selectedVehiclePlate: appData.vehicles[0]?.plate || '',
    driverChoice: 'me',
    driverPersonId: appData.people[0]?.id || '',
    driverCustomId: '',
    cmdChoice: 'me',
    cmdPersonId: appData.people[0]?.id || '',
    cmdCustomId: '',
    dispPersonId: appData.people[0]?.id || '',
    dispCustomId: '',
    quickOdometer: '',
    calibratingKey: null
  };

  // ---------------------------------------------------------------------------
  // 3. Robust Angular / Material DOM Engine for smartbase.digital.idf.il
  // ---------------------------------------------------------------------------
  // Bulletproof visibility check: walks ancestors to reject Angular <mat-stepper> inactive panes
  // hidden via height:0 + overflow:hidden, opacity:0, visibility:hidden, or horizontal offscreen transforms!
  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.closest('#sb-qf-host')) return false;
    if (el.closest('[aria-hidden="true"], [aria-expanded="false"], .mat-horizontal-stepper-content-inactive, .cdk-visually-hidden')) return false;

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return false;
    if (rect.right <= 4 || rect.left >= window.innerWidth - 4) return false;

    let isFixed = style.position === 'fixed';
    let p = el.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      const ps = window.getComputedStyle(p);
      if (ps.display === 'none' || ps.visibility === 'hidden' || parseFloat(ps.opacity) === 0) return false;
      if (!isFixed) {
        const clipsX = ps.overflowX === 'hidden' || ps.overflowX === 'clip';
        const clipsY = ps.overflowY === 'hidden' || ps.overflowY === 'clip';
        if (clipsX || clipsY) {
          const pr = p.getBoundingClientRect();
          if (pr.width <= 2 || pr.height <= 2) return false;
          if (clipsX && (rect.right <= pr.left + 2 || rect.left >= pr.right - 2)) return false;
          if (clipsY && p.scrollHeight <= p.clientHeight + 2 && (rect.bottom <= pr.top + 2 || rect.top >= pr.bottom - 2)) return false;
        }
      }
      if (ps.position === 'fixed') isFixed = true;
      p = p.parentElement;
    }
    return true;
  }

  function hasVisibleText(phrase) {
    const nodes = document.querySelectorAll('*');
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (el.children.length === 0 && el.textContent && el.textContent.trim().includes(phrase)) {
        if (isVisible(el)) return true;
      }
    }
    return false;
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function highlightPageEl(el) {
    if (!el || !el.style) return;
    const prevOutline = el.style.outline;
    const prevBg = el.style.backgroundColor;
    el.style.outline = '2px solid #22c55e';
    el.style.backgroundColor = 'rgba(34, 197, 94, 0.22)';
    setTimeout(() => {
      el.style.outline = prevOutline;
      el.style.backgroundColor = prevBg;
    }, 1050);
  }

  // Full pointer + mouse + native click simulation for Angular/Ionic/Material listeners
  function robustClick(el) {
    if (!el) return;
    try { el.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch (_) {}
    const opts = { bubbles: true, cancelable: true, view: window };
    try { el.dispatchEvent(new PointerEvent('pointerdown', opts)); } catch (_) {}
    try { el.dispatchEvent(new MouseEvent('mousedown', opts)); } catch (_) {}
    try { el.dispatchEvent(new PointerEvent('pointerup', opts)); } catch (_) {}
    try { el.dispatchEvent(new MouseEvent('mouseup', opts)); } catch (_) {}
    try { el.click(); } catch (_) {}
  }

  function setNativeInputValue(el, value) {
    if (!el) return false;
    const strVal = String(value ?? '');
    el.focus();

    if (el.tagName === 'SELECT') {
      const opts = Array.from(el.options);
      const match = opts.find(o => o.value === strVal || o.text.trim() === strVal || o.text.includes(strVal));
      el.value = match ? match.value : strVal;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      highlightPageEl(el);
      return true;
    }

    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, strVal);
    else el.value = strVal;

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
    highlightPageEl(el);
    return true;
  }

  // Search the entire visible DOM (excluding ONLY the trigger/input itself — NOT the whole card!)
  function findVisibleOptionInDocument(targetText, excludeEl) {
    const cleanTarget = String(targetText || '').trim();
    if (!cleanTarget) return null;

    const isExcluded = (el) => excludeEl && (el === excludeEl || excludeEl.contains(el) || el.contains(excludeEl));

    // 1. Check standard Angular CDK / Material / ARIA / Ionic / PrimeNG / autocomplete option elements first
    const prioritySelectors = [
      '.cdk-overlay-container mat-option',
      '.cdk-overlay-container [role="option"]',
      '.cdk-overlay-container .mdc-list-item',
      '.cdk-overlay-container li',
      '.cdk-overlay-container button',
      'mat-option',
      '[role="option"]',
      'ion-select-option',
      'p-dropdownitem',
      '.ng-option',
      '.MuiMenuItem-root',
      'ul li'
    ].join(', ');

    const priorityNodes = Array.from(document.querySelectorAll(prioritySelectors))
      .filter(el => isVisible(el) && !isExcluded(el));

    let match = priorityNodes.find(el => el.textContent.trim() === cleanTarget);
    if (match) return match;
    match = priorityNodes.find(el => el.textContent.trim().includes(cleanTarget));
    if (match) return match;

    // 2. Fallback: ANY visible leaf/short element in overlays/modals/lists matching exact text
    const genericNodes = Array.from(document.querySelectorAll('li, button, a, p, span, div'))
      .filter(el => {
        if (!isVisible(el) || isExcluded(el)) return false;
        if (el.children.length > 2) return false;
        const t = el.textContent.trim();
        return t === cleanTarget;
      });

    if (genericNodes.length > 0) {
      const inOverlay = genericNodes.find(el =>
        el.closest('.cdk-overlay-container, [role="listbox"], [role="dialog"], [role="menu"], .modal, .popover, .dropdown-menu, ul')
      );
      return inOverlay || genericNodes[genericNodes.length - 1];
    }
    return null;
  }

  // Handles native <select>, Angular mat-select, custom read-only dropdowns, and searchable autocomplete inputs
  async function fillSmartDropdownOrInput(el, targetText) {
    if (!el || !targetText) return false;
    const cleanTarget = String(targetText).trim();

    if (el.tagName === 'SELECT') {
      return setNativeInputValue(el, cleanTarget);
    }

    const isTextInput = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && !el.readOnly;
    if (isTextInput) {
      robustClick(el);
      setNativeInputValue(el, cleanTarget);
      // Poll up to 900ms for autocomplete suggestions to appear (in overlay OR inside card!) and click matching item
      for (let i = 0; i < 7; i++) {
        await delay(140);
        const opt = findVisibleOptionInDocument(cleanTarget, el);
        if (opt) {
          robustClick(opt);
          await delay(160);
          highlightPageEl(el);
          return true;
        }
      }
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    }

    // Read-only dropdown / mat-select / custom clickable trigger
    robustClick(el);
    for (let i = 0; i < 8; i++) {
      await delay(150);
      if (i === 1) {
        const overlaySearch = document.querySelector(
          '.cdk-overlay-container input[type="text"], .cdk-overlay-container input[type="search"], .cdk-overlay-container input:not([type="hidden"]):not([type="checkbox"])'
        );
        if (overlaySearch && isVisible(overlaySearch)) {
          setNativeInputValue(overlaySearch, cleanTarget);
          await delay(220);
        }
      }
      const opt = findVisibleOptionInDocument(cleanTarget, el);
      if (opt) {
        robustClick(opt);
        await delay(180);
        highlightPageEl(el);
        return true;
      }
    }
    return false;
  }

  // Dedicated Handler for "הוספת עצירה" on real SmartBase Step 1:
  // Click ONLY the exact text "הוספת עצירה" (NOT the '+' icon!) -> wait for "עצירה שנוספה" input -> fill & pick option.
  async function addAndFillStopOnStep1(stopText) {
    const cleanStop = String(stopText || '').trim();
    if (!cleanStop) return false;

    // Demo page shortcut
    const demoStopInput = document.querySelector('#input-stop');
    const demoToggleBtn = document.querySelector('#btn-toggle-stop');
    if (demoStopInput && demoToggleBtn) {
      if (!isVisible(demoStopInput)) {
        robustClick(demoToggleBtn);
        await delay(180);
      }
      setNativeInputValue(demoStopInput, cleanStop);
      return true;
    }

    const routeCard = findCardContainer('לאן נוסעים') || document;
    const inputSel = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, mat-select, [role="combobox"]';
    const getVisibleRouteInputs = () => Array.from(routeCard.querySelectorAll(inputSel)).filter(isVisible);

    const findAddedStopInput = (beforeSet) => {
      const current = getVisibleRouteInputs();
      // 1. Direct match by SmartBase's exact label "עצירה שנוספה"
      const byLabel = current.find(el => getAccessibleLabel(el).includes('עצירה שנוספה') || getAccessibleLabel(el).includes('עצירה'));
      if (byLabel && (!beforeSet || !beforeSet.has(byLabel))) return byLabel;
      // 2. Any newly added input that didn't exist before clicking "הוספת עצירה"
      if (beforeSet) {
        const newly = current.find(el => !beforeSet.has(el));
        if (newly) return newly;
      }
      // 3. If 3+ inputs exist (origin, stop, dest), return the middle one
      if (current.length >= 3) return current[1];
      return null;
    };

    const beforeInputs = getVisibleRouteInputs();
    let stopInput = beforeInputs.length >= 3 ? findAddedStopInput(null) : null;

    if (!stopInput) {
      const beforeSet = new Set(beforeInputs);

      // Search ALL visible elements across document (excluding #sb-qf-host) for exact text "הוספת עצירה"
      const exactTextEls = Array.from(document.querySelectorAll('*'))
        .filter(el => {
          if (!isVisible(el)) return false;
          if (el.tagName === 'SVG' || el.tagName === 'PATH' || el.tagName === 'MAT-ICON') return false;
          const t = el.textContent.trim();
          return t === 'הוספת עצירה';
        });

      // Deepest / innermost element carrying the exact phrase "הוספת עצירה" first (never the '+' icon!)
      exactTextEls.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);

      const targets = [];
      if (exactTextEls.length > 0) {
        targets.push(exactTextEls[0]);
        if (exactTextEls[0].parentElement && exactTextEls[0].parentElement !== routeCard) {
          targets.push(exactTextEls[0].parentElement);
        }
      }

      for (const target of targets) {
        robustClick(target);
        for (let attempt = 0; attempt < 9; attempt++) {
          await delay(140);
          const found = findAddedStopInput(beforeSet);
          if (found) {
            stopInput = found;
            break;
          }
        }
        if (stopInput) break;
      }
    }

    if (!stopInput && appData.customSelectors && appData.customSelectors.stop) {
      const calStop = document.querySelector(appData.customSelectors.stop);
      if (calStop && isVisible(calStop)) stopInput = calStop;
    }

    if (stopInput) {
      await fillSmartDropdownOrInput(stopInput, cleanStop);
      return true;
    }
    return false;
  }

  // Dedicated Bulletproof Handler for "מהי מטרת הנסיעה?" read-only dropdown on real SmartBase
  async function selectPurposeOnStep1(targetPurpose) {
    const cleanPurpose = String(targetPurpose || '').trim();
    if (!cleanPurpose) return false;

    // Demo page / native select shortcut
    const demoSel = document.querySelector('#input-purpose');
    if (demoSel) {
      return setNativeInputValue(demoSel, cleanPurpose);
    }

    // Calibrated selector shortcut
    if (appData.customSelectors && appData.customSelectors.purpose) {
      const calEl = document.querySelector(appData.customSelectors.purpose);
      if (calEl && isVisible(calEl)) {
        return await fillSmartDropdownOrInput(calEl, cleanPurpose, calEl.closest('mat-card, section, div'));
      }
    }

    // Locate the "מהי מטרת הנסיעה" card container (even if it contains NO <input>!)
    const purposeCard = findCardContainerFlexible('מהי מטרת הנסיעה');
    if (!purposeCard) return false;

    // 1. Check for standard select/mat-select/combobox inside the card
    let trigger = purposeCard.querySelector('select, mat-select, .mat-mdc-select, [role="combobox"], [role="listbox"], ng-select, p-dropdown, ion-select, input');

    // 2. If it's a custom clickable div showing the currently selected purpose (e.g. "תפקיד") + arrow icon
    if (!trigger || !isVisible(trigger)) {
      const candidates = Array.from(purposeCard.querySelectorAll('button, [role="button"], .mat-form-field-infix, .mat-mdc-form-field-infix, mat-form-field, div, span, p'))
        .filter(el => {
          if (!isVisible(el)) return false;
          const t = el.textContent.trim();
          if (!t || t.includes('מהי מטרת הנסיעה')) return false;
          return TRIP_PURPOSES.some(p => t === p || t.includes(p));
        });

      // Prefer the deepest element that matches a trip purpose, or its clickable wrapper
      candidates.sort((a, b) => a.textContent.trim().length - b.textContent.trim().length);
      if (candidates.length > 0) {
        trigger = candidates[0];
      }
    }

    if (!trigger) {
      // Fallback: any clickable area below the heading in purposeCard (e.g. the SVG chevron arrow)
      const arrow = purposeCard.querySelector('svg, mat-icon, i');
      trigger = (arrow && arrow.parentElement) || purposeCard;
    }

    // If the currently displayed value ALREADY equals cleanPurpose, highlight and succeed immediately!
    const currentText = (trigger.value || trigger.textContent || '').trim();
    if (currentText === cleanPurpose) {
      highlightPageEl(trigger);
      return true;
    }

    // Try clicking the trigger; if list doesn't open, also try clicking its clickable wrapper & chevron arrow
    const triggerAttempts = [trigger];
    if (trigger.parentElement && trigger.parentElement !== purposeCard) {
      triggerAttempts.push(trigger.parentElement);
    }
    const chevron = purposeCard.querySelector('svg, mat-icon');
    if (chevron && !triggerAttempts.includes(chevron)) {
      triggerAttempts.push(chevron.parentElement || chevron);
    }

    for (const attemptEl of triggerAttempts) {
      const ok = await fillSmartDropdownOrInput(attemptEl, cleanPurpose);
      if (ok) {
        highlightPageEl(purposeCard);
        return true;
      }
    }
    return false;
  }

  function getAccessibleLabel(el) {
    const parts = [];
    ['aria-label', 'placeholder', 'name', 'formcontrolname', 'id'].forEach(attr => {
      const v = el.getAttribute(attr);
      if (v) parts.push(v);
    });
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) parts.push(lbl.textContent);
    }
    const matField = el.closest('mat-form-field, .mat-mdc-form-field, .mat-form-field, label');
    if (matField) parts.push(matField.textContent);
    else if (el.parentElement) {
      const sib = el.parentElement.querySelector('label, span, h3, h4');
      if (sib && sib !== el) parts.push(sib.textContent);
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  function findButtonByText(textVariants, root = document) {
    const list = Array.isArray(textVariants) ? textVariants : [textVariants];
    const buttons = Array.from(root.querySelectorAll('button, [role="button"], a.btn, input[type="button"], input[type="submit"], .mat-mdc-button, .mat-button'))
      .filter(isVisible);

    for (const txt of list) {
      const exact = buttons.find(b => b.textContent.trim() === txt);
      if (exact) return exact;
    }
    for (const txt of list) {
      const partial = buttons.find(b => b.textContent.trim().includes(txt));
      if (partial) return partial;
    }
    const clickables = Array.from(root.querySelectorAll('div, span, p, label'))
      .filter(el => el.children.length <= 2 && isVisible(el));
    for (const txt of list) {
      const match = clickables.find(el => el.textContent.trim() === txt);
      if (match) return match;
    }
    return null;
  }

  // Flexible card finder that also works for cards with custom non-<input> dropdowns (like "מהי מטרת הנסיעה?")
  function findCardContainerFlexible(headingText) {
    if (!headingText) return null;
    const nodes = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, p, span, div, label, mat-card-title'))
      .filter(el => el.children.length === 0 && isVisible(el) && el.textContent.trim().includes(headingText));

    for (const heading of nodes) {
      let cur = heading.parentElement;
      for (let depth = 0; cur && depth < 6; depth++) {
        const rect = cur.getBoundingClientRect();
        const hasBody = cur.textContent.trim().length > heading.textContent.trim().length + 2 ||
          cur.querySelector('input, select, mat-select, [role="combobox"], button, svg');
        if (hasBody && rect.height >= 75 && rect.height < window.innerHeight * 0.85) {
          return cur;
        }
        cur = cur.parentElement;
      }
    }
    return null;
  }

  function findCardContainer(headingText) {
    if (!headingText) return null;
    const nodes = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, p, span, div, label, mat-card-title'))
      .filter(el => el.children.length === 0 && isVisible(el) && el.textContent.trim().includes(headingText));

    for (const heading of nodes) {
      let cur = heading.parentElement;
      for (let depth = 0; cur && depth < 6; depth++) {
        const hasInteractive = cur.querySelector('input, select, mat-select, [role="combobox"], button');
        if (hasInteractive && cur.getBoundingClientRect().height < window.innerHeight * 0.85) {
          return cur;
        }
        cur = cur.parentElement;
      }
    }
    return findCardContainerFlexible(headingText);
  }

  function findField(key) {
    const customSel = appData.customSelectors && appData.customSelectors[key];
    if (customSel) {
      try {
        const el = document.querySelector(customSel);
        if (el && !el.closest('#sb-qf-host')) return el;
      } catch (_) {}
    }

    const knownIds = {
      origin: '#input-origin',
      addStopBtn: '#btn-toggle-stop',
      stop: '#input-stop',
      dest: '#input-dest',
      purpose: '#input-purpose',
      nextStep1Btn: '#btn-next-to-step2',
      plate: '#input-vehicle-plate',
      driverId: '#input-driver-id',
      cmdId: '#input-cmd-id',
      dispId: '#input-disp-id',
      nextStep2Btn: '#btn-next-to-step3',
      ackCheckbox: '#checkbox-ack-guidelines',
      odometer: '#input-odometer'
    };
    if (knownIds[key]) {
      const el = document.querySelector(knownIds[key]);
      if (el) return el;
    }

    const def = FIELD_DEFS.find(f => f.key === key);
    if (!def) return null;

    const scopeRoot = (def.card && findCardContainer(def.card)) || document;

    if (def.isButton) {
      return findButtonByText(def.hints, scopeRoot) || findButtonByText(def.hints, document);
    }

    if (key === 'ackCheckbox') {
      const cbs = Array.from(document.querySelectorAll('input[type="checkbox"], mat-checkbox, [role="checkbox"]'))
        .filter(el => !el.closest('#sb-qf-host'));
      return cbs.find(cb => def.hints.some(h => getAccessibleLabel(cb).includes(h))) || cbs.find(isVisible) || null;
    }

    const inputSelector = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea, mat-select, .mat-mdc-select, [role="combobox"]';

    if (scopeRoot !== document) {
      const cardInputs = Array.from(scopeRoot.querySelectorAll(inputSelector)).filter(isVisible);
      for (const hint of def.hints) {
        const found = cardInputs.find(el => getAccessibleLabel(el).toLowerCase().includes(hint.toLowerCase()));
        if (found) return found;
      }
      if (cardInputs.length === 1) return cardInputs[0];
      if (key === 'origin' && cardInputs.length >= 2) return cardInputs[0];
      if (key === 'dest' && cardInputs.length >= 2) return cardInputs[cardInputs.length - 1];
      if (key === 'dispId' && cardInputs.length >= 1) return cardInputs[0];
    }

    const allInputs = Array.from(document.querySelectorAll(inputSelector)).filter(isVisible);
    for (const hint of def.hints) {
      const found = allInputs.find(el => getAccessibleLabel(el).toLowerCase().includes(hint.toLowerCase()));
      if (found) return found;
    }
    return null;
  }

  function waitForCondition(predicateFn, timeoutMs = 3500, intervalMs = 150) {
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        try {
          const res = predicateFn();
          if (res) { resolve(res); return; }
        } catch (_) {}
        if (Date.now() - start >= timeoutMs) { resolve(null); return; }
        setTimeout(check, intervalMs);
      };
      check();
    });
  }

  async function waitForOverlayToClose(timeoutMs = 700) {
    await waitForCondition(() => {
      const backdrop = document.querySelector('.cdk-overlay-backdrop');
      return !backdrop || !isVisible(backdrop);
    }, timeoutMs, 80);
    await delay(100);
  }

  // Scroll down & wait until SmartBase's on-screen "המשך" button is visible and enabled, then click it
  async function clickEnabledNextButton(fieldKey, timeoutMs = 2800) {
    try { window.scrollTo(0, document.body.scrollHeight); } catch (_) {}
    const btn = await waitForCondition(() => {
      const el = findField(fieldKey);
      if (!el || !isVisible(el)) return null;
      const style = window.getComputedStyle(el);
      const disabled =
        el.disabled ||
        el.getAttribute('aria-disabled') === 'true' ||
        el.classList.contains('mat-button-disabled') ||
        style.pointerEvents === 'none';
      return disabled ? null : el;
    }, timeoutMs, 150);
    if (btn) {
      try { btn.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch (_) {}
      await delay(140);
      robustClick(btn);
      return true;
    }
    return false;
  }

  // Auto-open "מילוי כרטיס עבודה" directly from SmartBase Home ("עדכונים") screen!
  async function ensureOnWorkTicketStep1() {
    if (detectCurrentPageStep() === 1) return true;

    const findTicketRow = () => {
      const exactNodes = Array.from(document.querySelectorAll('*'))
        .filter(el => isVisible(el) && el.children.length <= 2 && el.textContent.trim() === 'מילוי כרטיס עבודה');
      if (exactNodes.length === 0) return null;
      exactNodes.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
      return exactNodes[0];
    };

    // 1. Check if the "פתיחת פעולה חדשה" sheet is already open
    let ticketTextNode = findTicketRow();
    if (!ticketTextNode) {
      const newActionBtn = findButtonByText(['פעולה חדשה', '+ פעולה חדשה']);
      if (newActionBtn) {
        robustClick(newActionBtn);
      } else {
        const exact = Array.from(document.querySelectorAll('*')).find(el => isVisible(el) && el.children.length <= 2 && el.textContent.trim().includes('פעולה חדשה'));
        if (exact) robustClick(exact);
      }
      ticketTextNode = await waitForCondition(findTicketRow, 2800, 140);
      // Let the bottom-sheet slide-up animation settle completely before clicking!
      if (ticketTextNode) await delay(420);
    }

    if (ticketTextNode) {
      const rowEl = ticketTextNode.closest('button, a, li, mat-list-item, ion-item, [role="button"], [role="listitem"]') ||
        (ticketTextNode.parentElement && ticketTextNode.parentElement.getBoundingClientRect().height < 110 ? ticketTextNode.parentElement : null);

      // Click once cleanly and wait up to 7 seconds for SmartBase network load to reach Step 1!
      robustClick(rowEl || ticketTextNode);
      let arrived = await waitForCondition(() => detectCurrentPageStep() === 1, 3200, 150);
      if (!arrived && rowEl) {
        robustClick(ticketTextNode);
        arrived = await waitForCondition(() => detectCurrentPageStep() === 1, 4500, 150);
      }
      if (arrived) {
        await delay(350);
        return true;
      }
    }
    return detectCurrentPageStep() === 1;
  }

  // Strictly checks ON-SCREEN visible headings in natural order (1 -> 2 -> 3, with modal priority)
  function detectCurrentPageStep() {
    try { window.scrollTo(0, 0); } catch (_) {}
    if (hasVisibleText('חתימה דיגיטלית')) return 3;
    if (hasVisibleText('תכנון הנסיעה') || hasVisibleText('לאן נוסעים?')) return 1;
    if (hasVisibleText('שיבוץ רכב וצוות') || hasVisibleText('בחירת מפקד משלח')) return 2;
    if (hasVisibleText('אישור וחתימה') || hasVisibleText('קראתי והבנתי את ההנחיות')) return 3;
    return 0;
  }

  function buildUniqueSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return `#${CSS.escape(el.id)}`;
    for (const attr of ['formcontrolname', 'name', 'data-testid']) {
      const val = el.getAttribute(attr);
      if (val) {
        const sel = `${el.tagName.toLowerCase()}[${attr}="${CSS.escape(val)}"]`;
        if (document.querySelectorAll(sel).length === 1) return sel;
      }
    }
    const path = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.body && path.length < 5) {
      let part = cur.tagName.toLowerCase();
      const parent = cur.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
      }
      path.unshift(part);
      cur = parent;
    }
    return path.join(' > ');
  }

  function registerPersonIdForAutoName(idVal, roleKey, roleLabel) {
    const cleanId = String(idVal || '').replace(/\D/g, '');
    if (cleanId.length !== 9 || cleanId === appData.myId) return;

    if (!appData.pendingNameLookup || typeof appData.pendingNameLookup !== 'object') {
      appData.pendingNameLookup = {};
    }
    appData.pendingNameLookup[roleKey] = cleanId;

    const existing = appData.people.find(p => p.id === cleanId);
    if (!existing) {
      appData.people.push({ name: 'ממתין לשם', id: cleanId, role: roleLabel, needsName: true });
      showToast(`ת"ז ${cleanId} נשמרה — השם יושלם אוטומטית בפתיחת הכרטיס`);
    }
    saveData();
  }

  // Automatically pulls real Hebrew names from an open SmartBase work ticket ("צוות משימה")
  // and updates any saved person who entered a new ID without a name!
  function scrapeOpenTicketNamesAndOdometer() {
    const bodyText = document.body ? document.body.innerText : '';
    if (!bodyText.includes('צוות משימה')) return;

    const roleMap = [
      { key: 'driver', label: 'נהג' },
      { key: 'disp', label: 'מפקד משלח' },
      { key: 'cmd', label: 'מפקד משימה' }
    ];

    let updatedNames = [];

    for (const role of roleMap) {
      const pendingId = appData.pendingNameLookup && appData.pendingNameLookup[role.key];
      // Also check if any saved person has needsName:true for this role
      const isPlaceholderName = (p) =>
        Boolean(p.needsName) ||
        p.name === 'ממתין לשם' ||
        /^(משלח|נהג|מפקד משימה)\s*\(\d{4}\)$/.test(String(p.name || '').trim());

      const targetPerson =
        (pendingId && appData.people.find(p => p.id === pendingId)) ||
        appData.people.find(p => isPlaceholderName(p) && (p.role === role.label || (role.key === 'disp' && p.role === 'משלח')));

      if (!targetPerson) continue;

      // Find the exact role label element (e.g. "מפקד משלח", "נהג", "מפקד משימה") under "צוות משימה"
      const roleNodes = Array.from(document.querySelectorAll('*'))
        .filter(el => isVisible(el) && el.children.length === 0 && el.textContent.trim() === role.label);

      for (const roleNode of roleNodes) {
        // Look at previous sibling or parent's children for the Hebrew full name right above the role label
        let nameText = '';
        if (roleNode.previousElementSibling && isVisible(roleNode.previousElementSibling)) {
          nameText = roleNode.previousElementSibling.textContent.trim();
        }
        if (!nameText && roleNode.parentElement) {
          const sibTexts = Array.from(roleNode.parentElement.children)
            .filter(c => c !== roleNode && isVisible(c))
            .map(c => c.textContent.trim())
            .filter(t => t.length >= 3 && t.length <= 40 && /[\u0590-\u05FF]/.test(t) && !t.includes('ענ"א') && !t.includes('ק"מ'));
          if (sibTexts.length > 0) nameText = sibTexts[0];
        }

        if (nameText && nameText.length >= 3 && /[\u0590-\u05FF]/.test(nameText) && nameText !== role.label) {
          const prevName = targetPerson.name;
          if (targetPerson.needsName || prevName === 'ממתין לשם' || prevName.includes('(')) {
            targetPerson.name = nameText;
            targetPerson.needsName = false;
            if (appData.pendingNameLookup && appData.pendingNameLookup[role.key] === targetPerson.id) {
              delete appData.pendingNameLookup[role.key];
            }
            updatedNames.push(nameText);
            break;
          }
        }
      }
    }

    // Bonus: auto-update last odometer from "פרטי הרכב" (e.g. "מספר רכב צ- 727198", "ק"מ סופי 32397")
    const plateMatch = bodyText.match(/מספר רכב\s*צ?-?\s*(\d{4,9})/);
    const odoMatch = bodyText.match(/ק"מ סופי\s*(\d{2,7})/) || bodyText.match(/ק"מ התחלתי\s*(\d{2,7})/);
    if (plateMatch && odoMatch) {
      const p = plateMatch[1];
      const o = odoMatch[1];
      if (!appData.lastOdometers) appData.lastOdometers = {};
      if (appData.lastOdometers[p] !== o) {
        appData.lastOdometers[p] = o;
        saveData();
      }
    }

    if (updatedNames.length > 0) {
      saveData();
      showToast(`✓ שם נשמר מהכרטיס: ${updatedNames.join(', ')}`);
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Shadow DOM UI — Focused Dark Mode (Default) + Light Toggle, High Contrast
  // ---------------------------------------------------------------------------
  const host = document.createElement('div');
  host.id = 'sb-qf-host';
  host.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;direction:rtl;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; -webkit-tap-highlight-color: transparent; }

      :host {
        direction: rtl;
        /* Dark Focus Mode (default) — crisp contrast, zero glare, rapid scanning */
        --bg-sheet: #0b101d;
        --bg-header: #060912;
        --bg-card: #131b2e;
        --bg-card-accent: #161f38;
        --bg-input: #0a0f1c;
        --bg-subtle: #1c2640;
        --border: #263250;
        --border-accent: #4c43c7;
        --text: #f8fafc;
        --text-muted: #94a3b8;
        --primary: #6c5ce7;
        --primary-hover: #5b4ce6;
        --emerald: #10b981;
        --emerald-bg: rgba(16, 185, 129, 0.14);
        --emerald-border: #34d399;
        --danger: #fb7185;
      }

      .theme-light {
        --bg-sheet: #ffffff;
        --bg-header: #0f172a;
        --bg-card: #f8fafc;
        --bg-card-accent: #eef2ff;
        --bg-input: #ffffff;
        --bg-subtle: #f1f5f9;
        --border: #cbd5e1;
        --border-accent: #a5b4fc;
        --text: #0f172a;
        --text-muted: #475569;
        --primary: #5b4ce6;
        --primary-hover: #4637cc;
        --emerald: #059669;
        --emerald-bg: #ecfdf5;
        --emerald-border: #34d399;
        --danger: #e11d48;
      }

      .quickfill-fab {
        position: fixed;
        top: 58px;
        right: 10px;
        z-index: 2147483646;
        background: linear-gradient(135deg, #0f172a 0%, #312e81 100%);
        color: #ffffff;
        border: 1.5px solid #818cf8;
        border-radius: 9999px;
        padding: 7px 13px;
        font-size: 12px;
        font-weight: 800;
        box-shadow: 0 6px 18px rgba(15, 23, 42, 0.35);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        transition: transform 0.15s ease;
      }
      .quickfill-fab:active { transform: scale(0.95); }

      .drawer-overlay {
        display: none;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        background: rgba(2, 6, 23, 0.78);
        backdrop-filter: blur(5px);
        align-items: flex-end;
        justify-content: center;
      }
      .drawer-overlay.open { display: flex; }

      .sheet {
        background: var(--bg-sheet);
        color: var(--text);
        width: 100%;
        max-width: 460px;
        max-height: 90vh;
        border-radius: 26px 26px 0 0;
        border-top: 1px solid var(--border);
        box-shadow: 0 -14px 48px rgba(0, 0, 0, 0.55);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      @media (min-width: 640px) {
        .drawer-overlay { align-items: center; padding: 16px; }
        .sheet { border-radius: 26px; border: 1px solid var(--border); }
      }

      .sheet-header {
        padding: 14px 16px;
        background: var(--bg-header);
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .sheet-title-wrap { display: flex; align-items: center; gap: 9px; }
      .sheet-title { font-size: 15px; font-weight: 900; margin: 0; letter-spacing: -0.01em; }
      .sheet-sub { font-size: 12px; color: #a5b4fc; margin: 2px 0 0; font-weight: 600; }
      .header-actions { display: flex; align-items: center; gap: 8px; }
      .icon-btn {
        width: 36px; height: 36px; border-radius: 9999px; border: 1px solid rgba(255,255,255,0.14);
        background: rgba(255, 255, 255, 0.08); color: #ffffff;
        font-size: 15px; font-weight: 700; cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center;
      }

      .tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        background: var(--bg-subtle);
        padding: 4px;
        margin: 12px 14px 6px;
        border-radius: 14px;
        gap: 4px;
      }
      .tab-btn {
        border: none;
        background: transparent;
        padding: 10px 8px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 800;
        color: var(--text-muted);
        cursor: pointer;
        transition: all .15s;
      }
      .tab-btn.active {
        background: var(--primary);
        color: #ffffff;
        box-shadow: 0 3px 10px rgba(91, 76, 230, 0.35);
      }

      .step-bar {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        padding: 4px 14px 4px;
      }
      .step-chip {
        border: 1px solid var(--border);
        background: var(--bg-card);
        color: var(--text-muted);
        border-radius: 11px;
        padding: 8px 4px;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
      }
      .step-chip.active {
        background: rgba(108, 92, 231, 0.22);
        border-color: var(--primary);
        color: var(--text);
      }

      .body {
        padding: 12px 14px 20px;
        overflow-y: auto;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .card {
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 13px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .card.accent { background: var(--bg-card-accent); border-color: var(--border-accent); }
      .card.emerald { background: var(--emerald-bg); border-color: var(--emerald-border); color: var(--text); }

      .lbl { display: block; font-size: 13px; font-weight: 800; color: var(--text); margin-bottom: 4px; }
      .sub-lbl { display: block; font-size: 12px; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; }
      .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }

      .input, .select {
        width: 100%;
        min-height: 44px;
        padding: 10px 12px;
        border-radius: 13px;
        border: 1.5px solid var(--border);
        background: var(--bg-input);
        color: var(--text);
        font-size: 15px;
        font-weight: 700;
        outline: none;
      }
      .input::placeholder { color: var(--text-muted); font-weight: 500; }
      .input:focus, .select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(108, 92, 231, 0.22); }
      .input.stop-edit {
        border: 2px solid var(--emerald-border);
        background: var(--emerald-bg);
      }
      .input.odo-big {
        font-size: 20px;
        letter-spacing: 0.06em;
        text-align: center;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      .quick-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 6px;
      }
      .q-chip {
        border: 1px solid var(--border);
        background: var(--bg-card);
        color: var(--text);
        padding: 7px 11px;
        border-radius: 9999px;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
      }
      .q-chip.active {
        background: var(--primary);
        border-color: var(--primary);
        color: #ffffff;
      }

      .pill-btn {
        min-height: 44px;
        padding: 10px 12px;
        border-radius: 13px;
        font-size: 14px;
        font-weight: 800;
        border: 1.5px solid var(--border);
        background: var(--bg-input);
        color: var(--text);
        cursor: pointer;
        width: 100%;
        transition: all .14s;
      }
      .pill-btn.active {
        background: var(--primary);
        border-color: var(--primary);
        color: #ffffff;
        box-shadow: 0 4px 14px rgba(108, 92, 231, 0.35);
      }

      .run-btn {
        width: 100%;
        min-height: 52px;
        padding: 14px 16px;
        border-radius: 16px;
        border: none;
        background: linear-gradient(135deg, #6c5ce7 0%, #4f46e5 100%);
        color: #ffffff;
        font-size: 15px;
        font-weight: 900;
        box-shadow: 0 10px 26px rgba(91, 76, 230, 0.42);
        cursor: pointer;
      }
      .run-btn:active { opacity: 0.88; transform: scale(0.99); }

      .dark-btn {
        width: 100%;
        min-height: 42px;
        padding: 10px;
        border-radius: 12px;
        border: none;
        background: var(--primary);
        color: #ffffff;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
      }
      .sm-btn {
        min-height: 36px;
        padding: 7px 12px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg-subtle);
        color: var(--text);
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
        white-space: nowrap;
      }
      .sm-btn.primary { background: var(--primary); border-color: var(--primary); color: #ffffff; }
      .sm-btn.emerald { background: var(--emerald); border-color: var(--emerald); color: #ffffff; }

      .list-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: var(--bg-input);
        border: 1px solid var(--border);
        padding: 9px 11px;
        border-radius: 12px;
        font-size: 13px;
        gap: 8px;
      }
      .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; color: var(--text); }
      .del-btn { border: none; background: transparent; color: var(--danger); font-size: 12px; font-weight: 800; cursor: pointer; padding: 4px 8px; }

      .toast {
        display: none;
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483647;
        background: #0f172a;
        color: #ffffff;
        border: 1px solid #4f46e5;
        font-size: 13px;
        font-weight: 800;
        padding: 10px 18px;
        border-radius: 16px;
        box-shadow: 0 12px 28px rgba(0,0,0,0.45);
        max-width: 92vw;
        text-align: center;
      }
      .toast.show { display: block; }

      .calib-banner {
        display: none;
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483647;
        background: #dc2626;
        color: #fff;
        padding: 10px 14px;
        border-radius: 14px;
        font-size: 13px;
        font-weight: 800;
        align-items: center;
        gap: 10px;
        box-shadow: 0 10px 25px rgba(220,38,38,0.45);
      }
      .calib-banner.show { display: flex; }
    </style>

    <button id="qf-fab" type="button" class="quickfill-fab">
      <span>⚡</span>
      <span>מילוי מהיר</span>
    </button>

    <div id="qf-toast" class="toast"></div>
    <div id="qf-calib-banner" class="calib-banner">
      <span id="qf-calib-text">גע בשדה בדף...</span>
      <button id="qf-calib-cancel" type="button" class="sm-btn">ביטול</button>
    </div>

    <div id="qf-drawer" class="drawer-overlay">
      <div id="qf-sheet" class="sheet">
        <div class="sheet-header">
          <div class="sheet-title-wrap">
            <span style="font-size:20px;">⚡</span>
            <div>
              <h2 class="sheet-title">מילוי מהיר • SmartBase <span style="font-size:11px;opacity:0.65;font-weight:700;">v1.7</span></h2>
              <p id="qf-subtitle" class="sheet-sub">שלב 1 • תכנון נסיעה ומסלולים</p>
            </div>
          </div>
          <div class="header-actions">
            <button id="qf-theme-toggle" type="button" class="icon-btn" title="החלף מצב כהה/בהיר">☀️</button>
            <button id="qf-close" type="button" class="icon-btn">✕</button>
          </div>
        </div>

        <div class="tabs">
          <button id="tab-fill" type="button" class="tab-btn active">⚡ מילוי מהיר</button>
          <button id="tab-manage" type="button" class="tab-btn">⚙️ ניהול רשימות ות"ז</button>
        </div>

        <div id="qf-step-bar" class="step-bar">
          <button type="button" class="step-chip" data-step="1">1. נסיעה</button>
          <button type="button" class="step-chip" data-step="2">2. רכב וצוות</button>
          <button type="button" class="step-chip" data-step="3">3. חתימה וק"מ</button>
        </div>

        <div id="qf-body" class="body"></div>
      </div>
    </div>
  `;

  const fab = shadow.getElementById('qf-fab');
  const drawer = shadow.getElementById('qf-drawer');
  const sheet = shadow.getElementById('qf-sheet');
  const closeBtn = shadow.getElementById('qf-close');
  const themeBtn = shadow.getElementById('qf-theme-toggle');
  const subtitleEl = shadow.getElementById('qf-subtitle');
  const stepBar = shadow.getElementById('qf-step-bar');
  const bodyEl = shadow.getElementById('qf-body');
  const toastEl = shadow.getElementById('qf-toast');
  const calibBanner = shadow.getElementById('qf-calib-banner');
  const calibText = shadow.getElementById('qf-calib-text');
  const calibCancel = shadow.getElementById('qf-calib-cancel');

  function applyTheme() {
    const isLight = appData.theme === 'light';
    sheet.classList.toggle('theme-light', isLight);
    themeBtn.textContent = isLight ? '🌙' : '☀️';
  }

  let toastTimer = null;
  function showToast(msg) {
    if (!msg) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
  }

  function openDrawer(autoDetect = true) {
    if (autoDetect && extState.tab === 'fill') {
      const detected = detectCurrentPageStep();
      extState.step = detected > 0 ? detected : 1;
    }
    extState.open = true;
    applyTheme();
    drawer.classList.add('open');
    render();
  }

  function closeDrawer() {
    extState.open = false;
    drawer.classList.remove('open');
  }

  // ---------------------------------------------------------------------------
  // 5. Render Views (Focused, Scannable, Zero Clutter)
  // ---------------------------------------------------------------------------
  function render() {
    applyTheme();
    shadow.getElementById('tab-fill').classList.toggle('active', extState.tab === 'fill');
    shadow.getElementById('tab-manage').classList.toggle('active', extState.tab === 'manage');
    stepBar.style.display = extState.tab === 'fill' ? 'grid' : 'none';

    shadow.querySelectorAll('.step-chip').forEach(btn => {
      btn.classList.toggle('active', Number(btn.getAttribute('data-step')) === extState.step);
    });

    if (extState.tab === 'manage') {
      subtitleEl.textContent = 'ניהול ת"ז קבועה, מסלולים, רכבים ואנשים';
      renderManage();
    } else if (extState.step === 1) {
      subtitleEl.textContent = 'שלב 1 • תכנון נסיעה ומסלולים';
      renderStep1();
    } else if (extState.step === 2) {
      subtitleEl.textContent = 'שלב 2 • רכב, נהג, מפקד משימה ומשלח';
      renderStep2();
    } else {
      subtitleEl.textContent = 'שלב 3 • אישור הנחיות, חתימה וקילומטראז\'';
      renderStep3();
    }
  }

  // ---------------------------------------------------------------------------
  // 5B. Full End-to-End Autopilot Runner (Home -> Step 1 -> Step 2 -> Step 3 -> Signature!)
  // ---------------------------------------------------------------------------
  let isAutopilotRunning = false;

  async function executeStep1OnPage() {
    const cleanOrigin = extState.quickOrigin.trim();
    const cleanStop = extState.quickStop.trim();
    const cleanDest = extState.quickDest.trim();

    const routeCard = findCardContainer('לאן נוסעים');
    const originEl = findField('origin');
    if (originEl && cleanOrigin) {
      await fillSmartDropdownOrInput(originEl, cleanOrigin);
      await waitForOverlayToClose();
    }

    if (cleanStop) {
      await addAndFillStopOnStep1(cleanStop);
      await waitForOverlayToClose();
    }

    const destEl = findField('dest');
    if (destEl && cleanDest) {
      await fillSmartDropdownOrInput(destEl, cleanDest);
      await waitForOverlayToClose();
    }

    if (extState.quickPurpose) {
      await selectPurposeOnStep1(extState.quickPurpose);
      await waitForOverlayToClose();
    }

    const tripBtn = findButtonByText([extState.quickTripType]);
    if (tripBtn) {
      robustClick(tripBtn);
      await delay(200);
    }

    const clickedNext = await clickEnabledNextButton('nextStep1Btn', 3500);
    if (!clickedNext) return false;

    const arrivedStep2 = await waitForCondition(() => detectCurrentPageStep() === 2, 6000, 150);
    await delay(300);
    return Boolean(arrivedStep2);
  }

  async function executeStep2OnPage() {
    const NEW_ID_VAL = '__NEW__';

    if (extState.selectedVehiclePlate) {
      const plateEl = findField('plate');
      if (plateEl) {
        setNativeInputValue(plateEl, extState.selectedVehiclePlate);
        await delay(150);
      }
    }

    if (extState.driverChoice === 'me') {
      const btn = findButtonByText(['אני נהג']);
      if (btn) robustClick(btn);
      await delay(200);
      const drvEl = findField('driverId');
      if (drvEl && isVisible(drvEl) && appData.myId) setNativeInputValue(drvEl, appData.myId);
    } else {
      const btn = findButtonByText(['בחירת נהג']);
      if (btn) robustClick(btn);
      await delay(260);
      const drvId = extState.driverPersonId === NEW_ID_VAL ? extState.driverCustomId : extState.driverPersonId;
      const drvEl = findField('driverId');
      if (drvEl && drvId) {
        setNativeInputValue(drvEl, drvId);
        if (extState.driverPersonId === NEW_ID_VAL && drvId.length === 9) {
          registerPersonIdForAutoName(drvId, 'driver', 'נהג');
          extState.driverPersonId = drvId;
          extState.driverCustomId = '';
        }
      }
    }

    if (extState.cmdChoice === 'me') {
      const btn = findButtonByText(['אני מפקד משימה', 'אני מפקד']);
      if (btn) robustClick(btn);
      await delay(200);
      const cmdEl = findField('cmdId');
      if (cmdEl && isVisible(cmdEl) && appData.myId) setNativeInputValue(cmdEl, appData.myId);
    } else {
      const btn = findButtonByText(['בחירת מפקד משימה', 'בחירת מפקד']);
      if (btn) robustClick(btn);
      await delay(260);
      const cmdId = extState.cmdPersonId === NEW_ID_VAL ? extState.cmdCustomId : extState.cmdPersonId;
      const cmdEl = findField('cmdId');
      if (cmdEl && cmdId) {
        setNativeInputValue(cmdEl, cmdId);
        if (extState.cmdPersonId === NEW_ID_VAL && cmdId.length === 9) {
          registerPersonIdForAutoName(cmdId, 'cmd', 'מפקד משימה');
          extState.cmdPersonId = cmdId;
          extState.cmdCustomId = '';
        }
      }
    }

    const dispId = extState.dispPersonId === NEW_ID_VAL ? extState.dispCustomId : extState.dispPersonId;
    if (dispId) {
      const dispEl = findField('dispId');
      if (dispEl) {
        setNativeInputValue(dispEl, dispId);
        dispEl.dispatchEvent(new Event('blur', { bubbles: true }));
        if (extState.dispPersonId === NEW_ID_VAL && dispId.length === 9) {
          registerPersonIdForAutoName(dispId, 'disp', 'מפקד משלח');
          extState.dispPersonId = dispId;
          extState.dispCustomId = '';
        }
      }
    }

    // Wait for SmartBase to resolve dispatcher's auto-phone & enable "המשך"
    await delay(800);
    const clickedNext = await clickEnabledNextButton('nextStep2Btn', 4000);
    if (!clickedNext) return false;

    const arrivedStep3 = await waitForCondition(() => {
      const txt = document.body ? document.body.innerText : '';
      return detectCurrentPageStep() === 3 || txt.includes('שמרנו את המשימה שלך');
    }, 6500, 150);
    await delay(300);
    return Boolean(arrivedStep3);
  }

  async function executeStep3OnPage() {
    const bodyNow = document.body ? document.body.innerText : '';
    if (bodyNow.includes('שמרנו את המשימה שלך')) {
      showToast('✓ הכרטיס נשמר בעמוד "עדכונים" (ממתין לחתימת הנהג)');
      return true;
    }

    const cleanOdo = extState.quickOdometer.replace(/\D/g, '');
    if (cleanOdo && extState.selectedVehiclePlate) {
      appData.lastOdometers[extState.selectedVehiclePlate] = cleanOdo;
      saveData();
    }

    // 1. Scroll down & check "קראתי והבנתי את ההנחיות." ONCE (never double-toggle!)
    const ackEl = findField('ackCheckbox');
    if (ackEl) {
      try { ackEl.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch (_) {}
      await delay(150);
      const innerInput = ackEl.tagName === 'INPUT' ? ackEl : ackEl.querySelector('input[type="checkbox"]');
      const alreadyChecked = innerInput ? innerInput.checked : ackEl.getAttribute('aria-checked') === 'true';
      if (!alreadyChecked) {
        // Click label/mat-checkbox once and verify
        robustClick(ackEl);
        await delay(250);
        const nowChecked = innerInput ? innerInput.checked : ackEl.getAttribute('aria-checked') === 'true';
        if (!nowChecked && innerInput && innerInput !== ackEl) {
          robustClick(innerInput);
        }
      }
    }

    // 2. Wait up to 1.4s to see if checking the box automatically opens the "חתימה דיגיטלית" modal
    let odoEl = await waitForCondition(() => {
      const txt = document.body ? document.body.innerText : '';
      if (txt.includes('חתימה דיגיטלית')) return findField('odometer') || true;
      return null;
    }, 1400, 150);

    // 3. If modal didn't auto-open on checkbox check, click a visible signature/continue button on Step 3
    if (!odoEl) {
      const openSignBtn = findButtonByText(['פתח חתימה', 'חתימה דיגיטלית', 'חתימה', 'אישור וחתימה', 'המשך']);
      if (openSignBtn && !openSignBtn.disabled) {
        robustClick(openSignBtn);
        odoEl = await waitForCondition(() => {
          const txt = document.body ? document.body.innerText : '';
          if (txt.includes('חתימה דיגיטלית')) return findField('odometer') || true;
          if (txt.includes('שמרנו את המשימה שלך')) return 'SAVED';
          return null;
        }, 2200, 150);
      }
    }

    if (odoEl === 'SAVED') {
      showToast('✓ הכרטיס נשמר בעמוד "עדכונים" (ממתין לחתימת הנהג)');
      return true;
    }

    // 4. Fill odometer inside the "חתימה דיגיטלית" modal!
    if (cleanOdo) {
      await delay(150);
      const targetOdo = (odoEl && odoEl !== true) ? odoEl : findField('odometer');
      if (targetOdo) {
        setNativeInputValue(targetOdo, cleanOdo);
        targetOdo.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    }

    showToast('✓ הכל מולא! חתום עם האצבע ושמור');
    return true;
  }

  async function runFullAutopilot() {
    if (isAutopilotRunning) return;

    const cleanOrigin = extState.quickOrigin.trim();
    const cleanStop = extState.quickStop.trim();
    const cleanDest = extState.quickDest.trim();

    if (!cleanOrigin || !cleanDest) {
      extState.step = 1;
      render();
      showToast('יש למלא מוצא ויעד בשלב 1');
      return;
    }

    // Persist route & purpose popularity once for the full ticket
    const savedIdx = autoSaveRouteIfNew(cleanOrigin, cleanStop, cleanDest, extState.quickPurpose, extState.quickTripType);
    if (savedIdx !== null) extState.selectedRouteIdx = String(savedIdx);
    recordPurposeUsage(extState.quickPurpose);

    isAutopilotRunning = true;
    closeDrawer();

    try {
      let pageStep = detectCurrentPageStep();

      if (pageStep === 0) {
        showToast('⚡ פותח כרטיס עבודה חדש...');
        const opened = await ensureOnWorkTicketStep1();
        if (!opened) {
          showToast('לא הצלחתי לפתוח כרטיס אוטומטית — פתח ידנית ונסה שוב');
          return;
        }
        pageStep = 1;
      }

      if (pageStep === 1) {
        showToast('⚡ ממלא שלב 1/3 (מסלול, עצירה ומטרה)...');
        const ok1 = await executeStep1OnPage();
        if (!ok1) {
          showToast('שלב 1 מולא — בדוק את השדות ולחץ המשך');
          return;
        }
        pageStep = 2;
      }

      if (pageStep === 2) {
        showToast('⚡ ממלא שלב 2/3 (רכב, צוות ומשלח)...');
        const ok2 = await executeStep2OnPage();
        if (!ok2) {
          showToast('שלב 2 מולא — בדוק את השדות ולחץ המשך');
          return;
        }
        pageStep = 3;
      }

      if (pageStep === 3) {
        showToast('⚡ מאשר שלב 3/3 ופותח חתימה...');
        await executeStep3OnPage();
      }
    } finally {
      isAutopilotRunning = false;
    }
  }

  function renderStep1() {
    const sortedPurposes = getSortedTripPurposes();
    const counts = appData.purposeCounts || {};
    const topPurposes = sortedPurposes.slice(0, 3);

    bodyEl.innerHTML = `
      <div class="card accent">
        <div class="row">
          <label class="lbl" style="margin:0;">מסלול קבוע</label>
          <span style="font-size:11px;font-weight:700;color:#a5b4fc;">נשמר אוטומטית</span>
        </div>

        <select id="ext-sel-route" class="select">
          <option value="">-- מסלול חדש / הזנה ידנית --</option>
          ${appData.routes.map((r, idx) => `<option value="${idx}" ${String(extState.selectedRouteIdx) === String(idx) ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
        </select>

        <div class="grid-2">
          <div>
            <label class="sub-lbl">מוצא</label>
            <input id="ext-q-origin" class="input" type="text" value="${escapeHtml(extState.quickOrigin)}" placeholder="בסיס מוצא" />
          </div>
          <div>
            <label class="sub-lbl">יעד</label>
            <input id="ext-q-dest" class="input" type="text" value="${escapeHtml(extState.quickDest)}" placeholder="יעד נסיעה" />
          </div>
        </div>

        <div>
          <label class="sub-lbl" style="color:var(--emerald-border);">עצירה בדרך (עריכה מהירה — השאר ריק אם אין)</label>
          <input id="ext-q-stop" class="input stop-edit" type="text" value="${escapeHtml(extState.quickStop)}" placeholder="למשל: חצור / מרחב צפון" />
        </div>
      </div>

      <div class="card">
        <label class="lbl" style="margin:0;">מטרת הנסיעה (המועדפות בראש)</label>
        <div class="quick-chips">
          ${topPurposes.map(p => `
            <button type="button" data-q-purpose-chip="${escapeHtml(p)}" class="q-chip ${extState.quickPurpose === p ? 'active' : ''}">
              ★ ${escapeHtml(p)}
            </button>
          `).join('')}
        </div>
        <select id="ext-q-purpose" class="select">
          ${sortedPurposes.map(p => {
            const c = Number(counts[p] || 0);
            const label = c > 0 ? `★ ${p} (${c})` : p;
            return `<option value="${escapeHtml(p)}" ${extState.quickPurpose === p ? 'selected' : ''}>${escapeHtml(label)}</option>`;
          }).join('')}
        </select>
      </div>

      <div class="card">
        <span class="lbl" style="margin:0;">סוג הנסיעה</span>
        <div class="grid-2">
          <button type="button" data-q-trip="נסיעה מנהלתית" class="pill-btn ${extState.quickTripType === 'נסיעה מנהלתית' ? 'active' : ''}">נסיעה מנהלתית</button>
          <button type="button" data-q-trip="נסיעה מבצעית" class="pill-btn ${extState.quickTripType === 'נסיעה מבצעית' ? 'active' : ''}">נסיעה מבצעית</button>
        </div>
      </div>

      <button id="ext-next-step1" type="button" class="run-btn">
        המשך לשלב 2: רכב וצוות ←
      </button>
    `;

    shadow.getElementById('ext-sel-route').addEventListener('change', e => {
      extState.selectedRouteIdx = e.target.value;
      if (e.target.value !== '') {
        const r = appData.routes[Number(e.target.value)];
        if (r) {
          extState.quickOrigin = r.origin || '';
          extState.quickStop = r.stop || '';
          extState.quickDest = r.dest || '';
          extState.quickPurpose = TRIP_PURPOSES.includes(r.purpose) ? r.purpose : 'תפקיד';
          extState.quickTripType = r.tripType || 'נסיעה מנהלתית';
          render();
        }
      }
    });

    shadow.getElementById('ext-q-origin').addEventListener('input', e => { extState.quickOrigin = e.target.value; });
    shadow.getElementById('ext-q-stop').addEventListener('input', e => { extState.quickStop = e.target.value; });
    shadow.getElementById('ext-q-dest').addEventListener('input', e => { extState.quickDest = e.target.value; });
    shadow.getElementById('ext-q-purpose').addEventListener('change', e => { extState.quickPurpose = e.target.value; render(); });

    shadow.querySelectorAll('[data-q-purpose-chip]').forEach(btn => {
      btn.addEventListener('click', () => {
        extState.quickPurpose = btn.getAttribute('data-q-purpose-chip');
        render();
      });
    });

    shadow.querySelectorAll('[data-q-trip]').forEach(btn => {
      btn.addEventListener('click', () => {
        extState.quickTripType = btn.getAttribute('data-q-trip');
        render();
      });
    });

    shadow.getElementById('ext-next-step1').addEventListener('click', () => {
      if (!extState.quickOrigin.trim() || !extState.quickDest.trim()) {
        showToast('יש למלא לפחות מוצא ויעד');
        return;
      }
      extState.step = 2;
      render();
    });
  }

  function renderStep2() {
    const NEW_ID_VAL = '__NEW__';
    const peopleOpts = appData.people
      .map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${escapeHtml(p.id)})</option>`)
      .join('');

    const isDriverNew = extState.driverPersonId === NEW_ID_VAL;
    const isCmdNew = extState.cmdPersonId === NEW_ID_VAL;
    const isDispNew = extState.dispPersonId === NEW_ID_VAL;

    bodyEl.innerHTML = `
      <div class="card">
        <label class="lbl" style="margin:0;">מספר הרכב</label>
        <select id="ext-sel-vehicle" class="select">
          <option value="">-- בחר רכב שמור --</option>
          ${appData.vehicles.map(v => `<option value="${escapeHtml(v.plate)}" ${extState.selectedVehiclePlate === v.plate ? 'selected' : ''}>${escapeHtml(v.name)} (${escapeHtml(v.plate)})</option>`).join('')}
        </select>
      </div>

      <div class="card">
        <span class="lbl" style="margin:0;">נהג</span>
        <div class="grid-2">
          <button type="button" data-d-choice="me" class="pill-btn ${extState.driverChoice === 'me' ? 'active' : ''}">אני נהג</button>
          <button type="button" data-d-choice="person" class="pill-btn ${extState.driverChoice === 'person' ? 'active' : ''}">בחירת נהג</button>
        </div>
        ${extState.driverChoice === 'person' ? `
          <select id="ext-sel-driver-person" class="select">
            <option value="${NEW_ID_VAL}">➕ הזנת תעודת זהות חדשה...</option>
            <option value="">-- בחר נהג מהרשימה --</option>
            ${peopleOpts}
          </select>
          ${isDriverNew ? `
            <input id="ext-custom-driver-id" class="input" type="text" inputmode="numeric" maxlength="9" value="${escapeHtml(extState.driverCustomId)}" placeholder="הזן 9 ספרות של הנהג" />
          ` : ''}
        ` : ''}
      </div>

      <div class="card">
        <span class="lbl" style="margin:0;">מפקד משימה</span>
        <div class="grid-2">
          <button type="button" data-c-choice="me" class="pill-btn ${extState.cmdChoice === 'me' ? 'active' : ''}">אני מפקד</button>
          <button type="button" data-c-choice="person" class="pill-btn ${extState.cmdChoice === 'person' ? 'active' : ''}">בחירת מפקד</button>
        </div>
        ${extState.cmdChoice === 'person' ? `
          <select id="ext-sel-cmd-person" class="select">
            <option value="${NEW_ID_VAL}">➕ הזנת תעודת זהות חדשה...</option>
            <option value="">-- בחר מפקד משימה מהרשימה --</option>
            ${peopleOpts}
          </select>
          ${isCmdNew ? `
            <input id="ext-custom-cmd-id" class="input" type="text" inputmode="numeric" maxlength="9" value="${escapeHtml(extState.cmdCustomId)}" placeholder="הזן 9 ספרות של מפקד המשימה" />
          ` : ''}
        ` : ''}
      </div>

      <div class="card">
        <label class="lbl" style="margin:0;">מפקד משלח (נייד אוטומטי)</label>
        <select id="ext-sel-disp-person" class="select">
          <option value="${NEW_ID_VAL}">➕ הזנת תעודת זהות חדשה...</option>
          <option value="">-- בחר משלח מהרשימה --</option>
          ${peopleOpts}
        </select>
        ${isDispNew ? `
          <input id="ext-custom-disp-id" class="input" type="text" inputmode="numeric" maxlength="9" value="${escapeHtml(extState.dispCustomId)}" placeholder="הזן 9 ספרות של המשלח" />
        ` : ''}
      </div>

      <div class="row" style="gap:8px;">
        <button id="ext-back-step1" type="button" class="sm-btn" style="min-height:52px;padding:0 16px;">→ חזור</button>
        <button id="ext-next-step2" type="button" class="run-btn" style="flex:1;">המשך לשלב 3: ק"מ וחתימה ←</button>
      </div>
    `;

    shadow.getElementById('ext-sel-vehicle').addEventListener('change', e => { extState.selectedVehiclePlate = e.target.value; });
    shadow.querySelectorAll('[data-d-choice]').forEach(b => b.addEventListener('click', () => { extState.driverChoice = b.getAttribute('data-d-choice'); render(); }));
    shadow.querySelectorAll('[data-c-choice]').forEach(b => b.addEventListener('click', () => { extState.cmdChoice = b.getAttribute('data-c-choice'); render(); }));

    const selDrv = shadow.getElementById('ext-sel-driver-person');
    if (selDrv) {
      selDrv.value = extState.driverPersonId || '';
      selDrv.addEventListener('change', e => {
        extState.driverPersonId = e.target.value;
        if (e.target.value !== NEW_ID_VAL) extState.driverCustomId = '';
        render();
      });
    }
    const custDrv = shadow.getElementById('ext-custom-driver-id');
    if (custDrv) {
      custDrv.addEventListener('input', e => {
        const c = e.target.value.replace(/\D/g, '').slice(0, 9);
        e.target.value = c;
        extState.driverCustomId = c;
      });
    }

    const selCmd = shadow.getElementById('ext-sel-cmd-person');
    if (selCmd) {
      selCmd.value = extState.cmdPersonId || '';
      selCmd.addEventListener('change', e => {
        extState.cmdPersonId = e.target.value;
        if (e.target.value !== NEW_ID_VAL) extState.cmdCustomId = '';
        render();
      });
    }
    const custCmd = shadow.getElementById('ext-custom-cmd-id');
    if (custCmd) {
      custCmd.addEventListener('input', e => {
        const c = e.target.value.replace(/\D/g, '').slice(0, 9);
        e.target.value = c;
        extState.cmdCustomId = c;
      });
    }

    const selDisp = shadow.getElementById('ext-sel-disp-person');
    if (selDisp) {
      selDisp.value = extState.dispPersonId || '';
      selDisp.addEventListener('change', e => {
        extState.dispPersonId = e.target.value;
        if (e.target.value !== NEW_ID_VAL) extState.dispCustomId = '';
        render();
      });
    }
    const custDisp = shadow.getElementById('ext-custom-disp-id');
    if (custDisp) {
      custDisp.addEventListener('input', e => {
        const c = e.target.value.replace(/\D/g, '').slice(0, 9);
        e.target.value = c;
        extState.dispCustomId = c;
      });
    }

    shadow.getElementById('ext-back-step1').addEventListener('click', () => { extState.step = 1; render(); });
    shadow.getElementById('ext-next-step2').addEventListener('click', () => { extState.step = 3; render(); });
  }

  function renderStep3() {
    const plate = extState.selectedVehiclePlate;
    const lastOdo = plate && appData.lastOdometers ? appData.lastOdometers[plate] : '';
    const routePreview = `${extState.quickOrigin || '—'}${extState.quickStop ? ` ◄ ${extState.quickStop}` : ''} ◄ ${extState.quickDest || '—'}`;
    const driverTxt = extState.driverChoice === 'me' ? 'אני' : (extState.driverPersonId === '__NEW__' ? extState.driverCustomId : extState.driverPersonId || 'לא נבחר');
    const cmdTxt = extState.cmdChoice === 'me' ? 'אני' : (extState.cmdPersonId === '__NEW__' ? extState.cmdCustomId : extState.cmdPersonId || 'לא נבחר');

    bodyEl.innerHTML = `
      <div class="card accent" style="font-size:12px;gap:5px;">
        <div style="font-weight:900;font-size:13px;">📋 סיכום לפני מילוי אוטומטי מלא:</div>
        <div><strong>מסלול:</strong> ${escapeHtml(routePreview)}</div>
        <div><strong>מטרה וסוג:</strong> ${escapeHtml(extState.quickPurpose)} • ${escapeHtml(extState.quickTripType)}</div>
        <div><strong>רכב וצוות:</strong> ${escapeHtml(plate || 'לא נבחר')} • נהג: ${escapeHtml(driverTxt)} • מפקד: ${escapeHtml(cmdTxt)}</div>
      </div>

      <div class="card">
        <div class="row">
          <label class="lbl" style="margin:0;">קילומטראז' נוכחי ברכב</label>
          ${lastOdo ? `<span style="font-size:12px;font-weight:800;color:var(--emerald-border);">אחרון: ${escapeHtml(lastOdo)} ק"מ</span>` : ''}
        </div>
        <input id="ext-q-odo" class="input odo-big" type="text" inputmode="numeric" value="${escapeHtml(extState.quickOdometer)}" placeholder="${lastOdo ? escapeHtml(lastOdo) : '84250'}" />
      </div>

      <div class="row" style="gap:8px;">
        <button id="ext-back-step2" type="button" class="sm-btn" style="min-height:52px;padding:0 16px;">→ חזור</button>
        <button id="ext-run-all" type="button" class="run-btn" style="flex:1;">
          ⚡ מלא כרטיס עבודה מלא (שלב 1 ← 3)
        </button>
      </div>
    `;

    shadow.getElementById('ext-q-odo').addEventListener('input', e => {
      const clean = e.target.value.replace(/\D/g, '');
      e.target.value = clean;
      extState.quickOdometer = clean;
    });

    shadow.getElementById('ext-back-step2').addEventListener('click', () => { extState.step = 2; render(); });
    shadow.getElementById('ext-run-all').addEventListener('click', runFullAutopilot);
  }

  function renderManage() {
    bodyEl.innerHTML = `
      <div class="card">
        <label class="lbl" style="margin:0;">תעודת הזהות הקבועה שלי</label>
        <div class="row">
          <input id="mgmt-my-id" class="input" type="text" inputmode="numeric" maxlength="9" value="${escapeHtml(appData.myId)}" placeholder="9 ספרות" />
          <button id="mgmt-save-my-id" type="button" class="sm-btn primary">שמור</button>
        </div>
      </div>

      <div class="card">
        <span class="lbl" style="margin:0;">מסלולים קבועים</span>
        <input id="new-route-name" class="input" type="text" placeholder="שם מסלול (אופציונלי — נוצר אוטומטית)" />
        <div class="grid-3">
          <input id="new-route-origin" class="input" type="text" placeholder="מוצא" />
          <input id="new-route-stop" class="input" type="text" placeholder="עצירה" />
          <input id="new-route-dest" class="input" type="text" placeholder="יעד" />
        </div>
        <button id="btn-add-route" type="button" class="dark-btn">+ הוסף מסלול</button>
        ${appData.routes.map((r, idx) => `
          <div class="list-row">
            <span class="truncate">${escapeHtml(r.name)}</span>
            <button type="button" class="del-btn" data-del-route="${idx}">מחק</button>
          </div>
        `).join('')}
      </div>

      <div class="card">
        <span class="lbl" style="margin:0;">רכבים שמורים</span>
        <div class="grid-2">
          <input id="new-veh-name" class="input" type="text" placeholder="כינוי (היילקס)" />
          <input id="new-veh-plate" class="input" type="text" placeholder="מס' צ' / רישוי" />
        </div>
        <button id="btn-add-veh" type="button" class="dark-btn">+ הוסף רכב</button>
        ${appData.vehicles.map((v, idx) => `
          <div class="list-row">
            <span class="truncate">${escapeHtml(v.name)} — ${escapeHtml(v.plate)}</span>
            <button type="button" class="del-btn" data-del-veh="${idx}">מחק</button>
          </div>
        `).join('')}
      </div>

      <div class="card">
        <span class="lbl" style="margin:0;">אנשי צוות / משלחים (ללא טלפון)</span>
        <div class="grid-2">
          <input id="new-person-name" class="input" type="text" placeholder="שם (דני משלח)" />
          <input id="new-person-id" class="input" type="text" inputmode="numeric" maxlength="9" placeholder="תעודת זהות" />
        </div>
        <button id="btn-add-person" type="button" class="dark-btn">+ הוסף אדם</button>
        ${appData.people.map((p, idx) => `
          <div class="list-row">
            <span class="truncate">${escapeHtml(p.name)} — ${escapeHtml(p.id)}</span>
            <button type="button" class="del-btn" data-del-person="${idx}">מחק</button>
          </div>
        `).join('')}
      </div>

      <div class="card accent">
        <span class="lbl" style="margin:0;">📤 שיתוף רשימות יחידה (ללא ת"ז אישית)</span>
        <div class="grid-2">
          <button id="btn-export-cfg" type="button" class="sm-btn primary" style="width:100%;">📋 העתק קוד</button>
          <button id="btn-import-cfg" type="button" class="sm-btn" style="width:100%;">📥 ייבא קוד</button>
        </div>
      </div>

      <button id="btn-toggle-adv" type="button" class="sm-btn" style="width:100%;">
        🔧 ${extState.showAdvanced ? 'הסתר כיול שדות מתקדם' : 'כיול שדות מתקדם (אם שדה לא מתמלא)'}
      </button>

      ${extState.showAdvanced ? `
        <div class="card">
          <span class="sub-lbl">לחץ "כייל" ואז גע בשדה האמיתי בדף SmartBase:</span>
          ${FIELD_DEFS.map(def => {
            const saved = appData.customSelectors[def.key];
            return `
              <div class="list-row">
                <span class="truncate">${saved ? '🟢 ' : ''}${escapeHtml(def.label)}</span>
                <div style="display:flex;gap:4px;">
                  <button type="button" class="sm-btn" data-cal="${def.key}">כייל</button>
                  ${saved ? `<button type="button" class="del-btn" data-cal-clear="${def.key}">איפוס</button>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    `;

    shadow.getElementById('mgmt-save-my-id').addEventListener('click', () => {
      const val = shadow.getElementById('mgmt-my-id').value.replace(/\D/g, '').slice(0, 9);
      if (val.length !== 9) { showToast('יש להזין 9 ספרות'); return; }
      appData.myId = val;
      extState.editingMyId = false;
      saveData();
      showToast('תעודת הזהות הקבועה נשמרה ✓');
    });

    shadow.getElementById('btn-add-route').addEventListener('click', () => {
      const origin = shadow.getElementById('new-route-origin').value.trim();
      const stop = shadow.getElementById('new-route-stop').value.trim();
      const dest = shadow.getElementById('new-route-dest').value.trim();
      const rawName = shadow.getElementById('new-route-name').value.trim();
      if (!origin || !dest) { showToast('יש למלא לפחות מוצא ויעד'); return; }
      const name = rawName || `${origin}${stop ? ` ◄ ${stop}` : ''} ◄ ${dest}`;
      appData.routes.push({ name, origin, stop, dest, purpose: 'תפקיד', tripType: 'נסיעה מנהלתית' });
      extState.selectedRouteIdx = String(appData.routes.length - 1);
      extState.quickOrigin = origin;
      extState.quickStop = stop;
      extState.quickDest = dest;
      saveData();
      showToast('המסלול נשמר ✓');
      render();
    });

    shadow.getElementById('btn-add-veh').addEventListener('click', () => {
      const name = shadow.getElementById('new-veh-name').value.trim();
      const plate = shadow.getElementById('new-veh-plate').value.trim();
      if (!name || !plate) { showToast('יש למלא כינוי ומספר רכב'); return; }
      appData.vehicles.push({ name, plate });
      extState.selectedVehiclePlate = plate;
      saveData();
      showToast('הרכב נשמר ✓');
      render();
    });

    shadow.getElementById('btn-add-person').addEventListener('click', () => {
      const name = shadow.getElementById('new-person-name').value.trim();
      const id = shadow.getElementById('new-person-id').value.replace(/\D/g, '').slice(0, 9);
      if (!name || id.length !== 9) { showToast('יש למלא שם ות"ז בת 9 ספרות'); return; }
      appData.people.push({ name, id, role: 'צוות' });
      extState.dispPersonId = id;
      saveData();
      showToast('איש הצוות נשמר ✓');
      render();
    });

    shadow.querySelectorAll('[data-del-route]').forEach(b => b.addEventListener('click', () => {
      const idx = Number(b.getAttribute('data-del-route'));
      appData.routes.splice(idx, 1);
      if (extState.selectedRouteIdx !== '') {
        const cur = Number(extState.selectedRouteIdx);
        if (cur === idx) extState.selectedRouteIdx = appData.routes.length ? '0' : '';
        else if (cur > idx) extState.selectedRouteIdx = String(cur - 1);
      }
      saveData();
      render();
    }));

    shadow.querySelectorAll('[data-del-veh]').forEach(b => b.addEventListener('click', () => {
      const idx = Number(b.getAttribute('data-del-veh'));
      const rem = appData.vehicles.splice(idx, 1)[0];
      if (rem && extState.selectedVehiclePlate === rem.plate) extState.selectedVehiclePlate = appData.vehicles[0]?.plate || '';
      saveData();
      render();
    }));

    shadow.querySelectorAll('[data-del-person]').forEach(b => b.addEventListener('click', () => {
      const idx = Number(b.getAttribute('data-del-person'));
      const rem = appData.people.splice(idx, 1)[0];
      if (rem) {
        if (extState.driverPersonId === rem.id) extState.driverPersonId = appData.people[0]?.id || '';
        if (extState.cmdPersonId === rem.id) extState.cmdPersonId = appData.people[0]?.id || '';
        if (extState.dispPersonId === rem.id) extState.dispPersonId = appData.people[0]?.id || '';
      }
      saveData();
      render();
    }));

    shadow.getElementById('btn-export-cfg').addEventListener('click', async () => {
      const payload = JSON.stringify({
        v: 1,
        routes: appData.routes,
        vehicles: appData.vehicles,
        people: appData.people,
        customSelectors: appData.customSelectors
      });
      await copyToClipboard(payload, 'העתק את קוד השיתוף:');
      showToast('קוד היחידה הועתק ✓');
    });

    shadow.getElementById('btn-import-cfg').addEventListener('click', () => {
      const raw = window.prompt('הדבק כאן את קוד השיתוף שקיבלת:');
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw.trim());
        if (!parsed || typeof parsed !== 'object') throw new Error('invalid');
        if (Array.isArray(parsed.routes)) appData.routes = parsed.routes;
        if (Array.isArray(parsed.vehicles)) appData.vehicles = parsed.vehicles;
        if (Array.isArray(parsed.people)) appData.people = parsed.people;
        if (parsed.customSelectors && typeof parsed.customSelectors === 'object') {
          appData.customSelectors = { ...appData.customSelectors, ...parsed.customSelectors };
        }
        saveData();
        showToast('הגדרות היחידה יובאו בהצלחה ✓');
        render();
      } catch (_) {
        showToast('קוד לא תקין');
      }
    });

    shadow.getElementById('btn-toggle-adv').addEventListener('click', () => {
      extState.showAdvanced = !extState.showAdvanced;
      render();
    });

    shadow.querySelectorAll('[data-cal]').forEach(btn => {
      btn.addEventListener('click', () => startCalibration(btn.getAttribute('data-cal')));
    });
    shadow.querySelectorAll('[data-cal-clear]').forEach(btn => {
      btn.addEventListener('click', () => {
        delete appData.customSelectors[btn.getAttribute('data-cal-clear')];
        saveData();
        render();
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 6. Calibration Picker
  // ---------------------------------------------------------------------------
  function startCalibration(key) {
    const def = FIELD_DEFS.find(f => f.key === key);
    if (!def) return;
    extState.calibratingKey = key;
    closeDrawer();
    calibText.textContent = `גע בשדה: "${def.label}" בדף`;
    calibBanner.classList.add('show');
    document.addEventListener('click', onCalibrateClick, true);
  }

  function stopCalibration() {
    extState.calibratingKey = null;
    calibBanner.classList.remove('show');
    document.removeEventListener('click', onCalibrateClick, true);
  }

  function onCalibrateClick(evt) {
    if (!extState.calibratingKey) return;
    if (evt.target.closest && evt.target.closest('#sb-qf-host')) return;
    evt.preventDefault();
    evt.stopPropagation();

    const selector = buildUniqueSelector(evt.target);
    if (selector) {
      appData.customSelectors[extState.calibratingKey] = selector;
      saveData();
      highlightPageEl(evt.target);
      showToast('השדה כויל בהצלחה ✓');
    }
    stopCalibration();
    extState.tab = 'manage';
    extState.showAdvanced = true;
    openDrawer(false);
  }

  // ---------------------------------------------------------------------------
  // 7. Wire Events & Auto-Hide on Login Screen
  // ---------------------------------------------------------------------------
  function syncFabVisibility() {
    const url = (window.location.href || '').toLowerCase();
    const txt = document.body ? document.body.innerText : '';
    const isLoginScreen =
      url.includes('login') ||
      url.includes('auth') ||
      (txt.includes('מספר תעודת הזהות שלי') && txt.includes('התחברות') && !txt.includes('מילוי כרטיס עבודה'));
    fab.style.display = isLoginScreen ? 'none' : 'inline-flex';
    scrapeOpenTicketNamesAndOdometer();
  }

  applyTheme();
  syncFabVisibility();
  window.addEventListener('hashchange', () => setTimeout(syncFabVisibility, 250));
  setInterval(syncFabVisibility, 1200);

  fab.addEventListener('click', () => openDrawer(true));
  closeBtn.addEventListener('click', closeDrawer);
  drawer.addEventListener('click', e => { if (e.target === drawer) closeDrawer(); });
  calibCancel.addEventListener('click', () => { stopCalibration(); openDrawer(false); });

  themeBtn.addEventListener('click', () => {
    appData.theme = appData.theme === 'dark' ? 'light' : 'dark';
    saveData();
    applyTheme();
  });

  shadow.getElementById('tab-fill').addEventListener('click', () => { extState.tab = 'fill'; render(); });
  shadow.getElementById('tab-manage').addEventListener('click', () => { extState.tab = 'manage'; render(); });

  shadow.querySelectorAll('.step-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      extState.step = Number(btn.getAttribute('data-step'));
      render();
    });
  });
})();
