// ==UserScript==
// @name         SmartBase מילוי מהיר לכרטיס עבודה
// @namespace    https://smartbase-quickfill.local/
// @version      1.3.0
// @description  מילוי מהיר של כרטיסי עבודה ב-SmartBase: מסלולים קבועים עם עריכת עצירה, 40 מטרות מועדפות, רכבים, ת"ז קבועה ומעבר אוטומטי בין שלבים.
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

  const SCRIPT_VERSION = '1.3.0';

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
      theme: 'dark', // Focused dark mode by default
      purposeCounts: { 'תפקיד': 1 },
      lastOdometers: {},
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
  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.closest('#sb-qf-host')) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
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

  // Search the entire visible DOM (outside excludeRoot) for a dropdown option matching targetText
  function findVisibleOptionInDocument(targetText, excludeRoot) {
    const cleanTarget = String(targetText || '').trim();
    if (!cleanTarget) return null;

    // 1. Check standard Angular CDK / Material / ARIA / Ionic / PrimeNG option elements first
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
      '.MuiMenuItem-root'
    ].join(', ');

    const priorityNodes = Array.from(document.querySelectorAll(prioritySelectors))
      .filter(el => isVisible(el) && (!excludeRoot || !excludeRoot.contains(el)));

    let match = priorityNodes.find(el => el.textContent.trim() === cleanTarget);
    if (match) return match;
    match = priorityNodes.find(el => el.textContent.trim().includes(cleanTarget));
    if (match) return match;

    // 2. Fallback: ANY newly visible leaf/short element in overlays/modals/menus/lists matching exact text
    const genericNodes = Array.from(document.querySelectorAll('li, button, a, p, span, div'))
      .filter(el => {
        if (!isVisible(el)) return false;
        if (excludeRoot && excludeRoot.contains(el)) return false;
        if (el.children.length > 2) return false;
        const t = el.textContent.trim();
        return t === cleanTarget;
      });

    if (genericNodes.length > 0) {
      // Prefer elements that are inside an overlay/dialog/popover or highest in DOM order (latest rendered)
      const inOverlay = genericNodes.find(el =>
        el.closest('.cdk-overlay-container, [role="listbox"], [role="dialog"], [role="menu"], .modal, .popover, .dropdown-menu, ul')
      );
      return inOverlay || genericNodes[genericNodes.length - 1];
    }
    return null;
  }

  // Handles native <select>, Angular mat-select, custom read-only dropdowns, and searchable autocomplete inputs
  async function fillSmartDropdownOrInput(el, targetText, excludeCard) {
    if (!el || !targetText) return false;
    const cleanTarget = String(targetText).trim();

    if (el.tagName === 'SELECT') {
      return setNativeInputValue(el, cleanTarget);
    }

    const isTextInput = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && !el.readOnly;
    if (isTextInput) {
      robustClick(el);
      setNativeInputValue(el, cleanTarget);
      // Poll up to 800ms for autocomplete suggestions to appear and click matching item
      for (let i = 0; i < 6; i++) {
        await delay(140);
        const opt = findVisibleOptionInDocument(cleanTarget, excludeCard || el.parentElement);
        if (opt) {
          robustClick(opt);
          await delay(140);
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
      // Check if an overlay search input appeared
      if (i === 1) {
        const overlaySearch = document.querySelector(
          '.cdk-overlay-container input[type="text"], .cdk-overlay-container input[type="search"], .cdk-overlay-container input:not([type="hidden"]):not([type="checkbox"])'
        );
        if (overlaySearch && isVisible(overlaySearch)) {
          setNativeInputValue(overlaySearch, cleanTarget);
          await delay(220);
        }
      }
      const opt = findVisibleOptionInDocument(cleanTarget, excludeCard || el);
      if (opt) {
        robustClick(opt);
        await delay(160);
        highlightPageEl(el);
        return true;
      }
    }
    return false;
  }

  // Dedicated Bulletproof Handler for "הוספת עצירה" on real SmartBase Step 1
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

    // Real SmartBase: locate the "לאן נוסעים" card
    const routeCard = findCardContainer('לאן נוסעים') || document;
    const inputSel = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, mat-select, [role="combobox"]';
    const getVisibleRouteInputs = () => Array.from(routeCard.querySelectorAll(inputSel)).filter(isVisible);

    const beforeInputs = getVisibleRouteInputs();
    let stopInput = null;

    // If a stop field is ALREADY open (>= 3 inputs in route card: origin, stop, dest), use the middle one
    if (beforeInputs.length >= 3) {
      stopInput = beforeInputs[1];
    } else {
      // Find the "הוספת עצירה" text node AND its clickable row / purple '+' circle button
      const textNodes = Array.from(routeCard.querySelectorAll('span, p, div, button, label, a'))
        .filter(el => isVisible(el) && el.children.length <= 2 && el.textContent.trim().includes('הוספת עצירה'));

      // Sort smallest / deepest element first (the actual label "הוספת עצירה")
      textNodes.sort((a, b) => a.textContent.trim().length - b.textContent.trim().length);
      const labelEl = textNodes[0] || findField('addStopBtn');

      const clickTargets = [];
      if (labelEl) {
        clickTargets.push(labelEl);
        // Also check parent clickable row & any button/icon sibling inside that row (the purple '+' circle)
        const rowEl = labelEl.closest('button, [role="button"], .row, div');
        if (rowEl && rowEl !== routeCard && rowEl.getBoundingClientRect().height < 90) {
          const plusBtn = rowEl.querySelector('button, mat-icon, svg, [role="button"]');
          if (plusBtn && plusBtn !== labelEl) clickTargets.push(plusBtn);
          if (rowEl !== labelEl) clickTargets.push(rowEl);
        }
      }

      const beforeSet = new Set(beforeInputs);
      for (const target of clickTargets) {
        robustClick(target);
        // Wait up to 750ms for a NEW input to appear in the route card
        for (let attempt = 0; attempt < 6; attempt++) {
          await delay(130);
          const afterInputs = getVisibleRouteInputs();
          const newlyAdded = afterInputs.find(inp => !beforeSet.has(inp));
          if (newlyAdded) {
            stopInput = newlyAdded;
            break;
          }
        }
        if (stopInput) break;
      }
    }

    if (!stopInput) {
      // Last fallback: check calibrated selector
      const calStop = appData.customSelectors && appData.customSelectors.stop
        ? document.querySelector(appData.customSelectors.stop)
        : null;
      if (calStop && isVisible(calStop)) stopInput = calStop;
    }

    if (stopInput) {
      await fillSmartDropdownOrInput(stopInput, cleanStop, routeCard);
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
      const ok = await fillSmartDropdownOrInput(attemptEl, cleanPurpose, purposeCard);
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

  function detectCurrentPageStep() {
    const bodyText = document.body ? document.body.innerText : '';
    if (bodyText.includes('חתימה דיגיטלית') || bodyText.includes('קראתי והבנתי את ההנחיות') || bodyText.includes('אישור וחתימה')) {
      if (findField('ackCheckbox') || findField('odometer')) return 3;
    }
    if (bodyText.includes('שיבוץ רכב וצוות') || bodyText.includes('בחירת מפקד משלח')) {
      return 2;
    }
    if (bodyText.includes('תכנון הנסיעה') || bodyText.includes('לאן נוסעים?')) {
      return 1;
    }
    return extState.step;
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

  function tryLearnPersonNameNearInput(inputEl, idVal, roleLabel) {
    const cleanId = String(idVal || '').replace(/\D/g, '');
    if (cleanId.length !== 9 || cleanId === appData.myId) return;
    if (appData.people.some(p => p.id === cleanId)) return;

    setTimeout(() => {
      let discoveredName = '';
      if (inputEl) {
        const card = inputEl.closest('mat-card, section, form, div') || inputEl.parentElement;
        if (card) {
          const texts = Array.from(card.querySelectorAll('p, span, div, strong'))
            .filter(n => n !== inputEl && !n.contains(inputEl) && isVisible(n))
            .map(n => n.textContent.trim())
            .filter(t => t.length >= 3 && t.length <= 45 && /[\u0590-\u05FF]/.test(t));

          const match = texts.find(t =>
            t.includes('זוהה') ||
            (!t.includes('תעודת זהות') && !t.includes('בחירת') && !t.includes('נייד') && !t.includes('אני ') && t.split(' ').length >= 2)
          );
          if (match) {
            discoveredName = match
              .replace(/✓|זוהה ב-SmartBase:?/g, '')
              .replace(new RegExp(`\\(?${cleanId}\\)?`, 'g'), '')
              .trim();
          }
        }
      }
      const finalName = discoveredName ? `${discoveredName} (${roleLabel})` : `${roleLabel} (${cleanId.slice(-4)})`;
      appData.people.push({ name: finalName, id: cleanId, role: roleLabel });
      saveData();
      showToast(`נשמר אוטומטית למאגר: ${finalName}`);
    }, 650);
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
        bottom: 92px;
        left: 16px;
        z-index: 2147483646;
        background: linear-gradient(135deg, #0f172a 0%, #312e81 100%);
        color: #ffffff;
        border: 2px solid #818cf8;
        border-radius: 9999px;
        padding: 11px 17px;
        font-size: 14px;
        font-weight: 800;
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.45);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 7px;
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
              <h2 class="sheet-title">מילוי מהיר • SmartBase</h2>
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
      extState.step = detectCurrentPageStep();
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

      <button id="ext-run-step1" type="button" class="run-btn">
        ⚡ מלא שלב 1 ועבור לשלב 2
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

    shadow.getElementById('ext-run-step1').addEventListener('click', async () => {
      const cleanOrigin = extState.quickOrigin.trim();
      const cleanStop = extState.quickStop.trim();
      const cleanDest = extState.quickDest.trim();

      if (!cleanOrigin || !cleanDest) {
        showToast('יש למלא לפחות מוצא ויעד');
        return;
      }

      const savedIdx = autoSaveRouteIfNew(cleanOrigin, cleanStop, cleanDest, extState.quickPurpose, extState.quickTripType);
      if (savedIdx !== null) extState.selectedRouteIdx = String(savedIdx);
      recordPurposeUsage(extState.quickPurpose);

      closeDrawer();
      await delay(120);

      let filled = 0;
      const routeCard = findCardContainer('לאן נוסעים');

      const originEl = findField('origin');
      if (originEl) { await fillSmartDropdownOrInput(originEl, cleanOrigin, routeCard); filled++; }

      if (cleanStop) {
        const stopOk = await addAndFillStopOnStep1(cleanStop);
        if (stopOk) filled++;
      }

      const destEl = findField('dest');
      if (destEl) { await fillSmartDropdownOrInput(destEl, cleanDest, routeCard); filled++; }

      if (extState.quickPurpose) {
        const purposeOk = await selectPurposeOnStep1(extState.quickPurpose);
        if (purposeOk) filled++;
      }

      const tripBtn = findButtonByText([extState.quickTripType]);
      if (tripBtn) { robustClick(tripBtn); filled++; }

      if (filled === 0) {
        showToast('פתח תחילה "מילוי כרטיס עבודה" (שלב 1) ב-SmartBase');
        return;
      }

      await delay(280);
      const nextBtn = findField('nextStep1Btn');
      const isDisabled = nextBtn && (nextBtn.disabled || nextBtn.getAttribute('aria-disabled') === 'true');
      if (nextBtn && !isDisabled) {
        robustClick(nextBtn);
        extState.step = 2;
        showToast('שלב 1 מולא • עבר אוטומטית לשלב 2 ✓');
        await delay(400);
        openDrawer(false);
      } else {
        showToast('שלב 1 מולא — בדוק את השדות ולחץ המשך');
      }
    });
  }

  function renderStep2() {
    const peopleOpts = appData.people.length
      ? appData.people.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${escapeHtml(p.id)})</option>`).join('')
      : '<option value="">אין אנשים שמורים ברשימה</option>';

    bodyEl.innerHTML = `
      <div class="card">
        ${extState.editingMyId ? `
          <div class="row">
            <input id="ext-inline-myid" class="input" type="text" inputmode="numeric" maxlength="9" value="${escapeHtml(appData.myId)}" placeholder="הזן 9 ספרות של הת&quot;ז שלך" />
            <button id="ext-save-inline-myid" type="button" class="sm-btn emerald">שמור</button>
          </div>
        ` : `
          <div class="row">
            <div>
              <span class="sub-lbl" style="margin:0;">תעודת הזהות הקבועה שלי</span>
              <strong style="font-size:15px;">${escapeHtml(appData.myId || 'לא הוגדרה')}</strong>
            </div>
            <button id="ext-edit-inline-myid" type="button" class="sm-btn">✏️ ערוך</button>
          </div>
        `}
      </div>

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
            <option value="">-- בחר מהמאגר או הזן ת"ז חדשה --</option>
            ${peopleOpts}
          </select>
          <input id="ext-custom-driver-id" class="input" type="text" inputmode="numeric" maxlength="9" value="${escapeHtml(extState.driverCustomId)}" placeholder="או הזן ת&quot;ז חדשה (9 ספרות)" />
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
            <option value="">-- בחר מהמאגר או הזן ת"ז חדשה --</option>
            ${peopleOpts}
          </select>
          <input id="ext-custom-cmd-id" class="input" type="text" inputmode="numeric" maxlength="9" value="${escapeHtml(extState.cmdCustomId)}" placeholder="או הזן ת&quot;ז חדשה (9 ספרות)" />
        ` : ''}
      </div>

      <div class="card">
        <label class="lbl" style="margin:0;">מפקד משלח (נייד אוטומטי)</label>
        <select id="ext-sel-disp-person" class="select">
          <option value="">-- בחר משלח או הזן ת"ז חדשה --</option>
          ${peopleOpts}
        </select>
        <input id="ext-custom-disp-id" class="input" type="text" inputmode="numeric" maxlength="9" value="${escapeHtml(extState.dispCustomId)}" placeholder="או הזן ת&quot;ז משלח חדש (9 ספרות)" />
      </div>

      <button id="ext-run-step2" type="button" class="run-btn">
        ⚡ מלא שלב 2 ועבור לשלב 3
      </button>
    `;

    const editBtn = shadow.getElementById('ext-edit-inline-myid');
    if (editBtn) editBtn.addEventListener('click', () => { extState.editingMyId = true; render(); });

    const saveBtn = shadow.getElementById('ext-save-inline-myid');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const val = shadow.getElementById('ext-inline-myid').value.replace(/\D/g, '').slice(0, 9);
        if (val.length !== 9) { showToast('יש להזין 9 ספרות'); return; }
        appData.myId = val;
        saveData();
        extState.editingMyId = false;
        showToast('תעודת הזהות הקבועה עודכנה ✓');
        render();
      });
    }

    shadow.getElementById('ext-sel-vehicle').addEventListener('change', e => { extState.selectedVehiclePlate = e.target.value; });
    shadow.querySelectorAll('[data-d-choice]').forEach(b => b.addEventListener('click', () => { extState.driverChoice = b.getAttribute('data-d-choice'); render(); }));
    shadow.querySelectorAll('[data-c-choice]').forEach(b => b.addEventListener('click', () => { extState.cmdChoice = b.getAttribute('data-c-choice'); render(); }));

    const selDrv = shadow.getElementById('ext-sel-driver-person');
    if (selDrv) {
      selDrv.value = extState.driverCustomId ? '' : extState.driverPersonId;
      selDrv.addEventListener('change', e => { extState.driverPersonId = e.target.value; extState.driverCustomId = ''; });
    }
    const custDrv = shadow.getElementById('ext-custom-driver-id');
    if (custDrv) {
      custDrv.addEventListener('input', e => {
        const c = e.target.value.replace(/\D/g, '').slice(0, 9);
        e.target.value = c;
        extState.driverCustomId = c;
        if (c && selDrv) selDrv.value = '';
      });
    }

    const selCmd = shadow.getElementById('ext-sel-cmd-person');
    if (selCmd) {
      selCmd.value = extState.cmdCustomId ? '' : extState.cmdPersonId;
      selCmd.addEventListener('change', e => { extState.cmdPersonId = e.target.value; extState.cmdCustomId = ''; });
    }
    const custCmd = shadow.getElementById('ext-custom-cmd-id');
    if (custCmd) {
      custCmd.addEventListener('input', e => {
        const c = e.target.value.replace(/\D/g, '').slice(0, 9);
        e.target.value = c;
        extState.cmdCustomId = c;
        if (c && selCmd) selCmd.value = '';
      });
    }

    const selDisp = shadow.getElementById('ext-sel-disp-person');
    if (selDisp) {
      selDisp.value = extState.dispCustomId ? '' : extState.dispPersonId;
      selDisp.addEventListener('change', e => { extState.dispPersonId = e.target.value; extState.dispCustomId = ''; });
    }
    const custDisp = shadow.getElementById('ext-custom-disp-id');
    if (custDisp) {
      custDisp.addEventListener('input', e => {
        const c = e.target.value.replace(/\D/g, '').slice(0, 9);
        e.target.value = c;
        extState.dispCustomId = c;
        if (c && selDisp) selDisp.value = '';
      });
    }

    shadow.getElementById('ext-run-step2').addEventListener('click', async () => {
      if ((extState.driverChoice === 'me' || extState.cmdChoice === 'me') && appData.myId.length !== 9) {
        showToast('יש להזין תחילה תעודת זהות קבועה (9 ספרות) למעלה');
        extState.editingMyId = true;
        render();
        return;
      }

      closeDrawer();
      await delay(100);

      if (extState.selectedVehiclePlate) {
        const plateEl = findField('plate');
        if (plateEl) setNativeInputValue(plateEl, extState.selectedVehiclePlate);
      }

      if (extState.driverChoice === 'me') {
        const btn = findButtonByText(['אני נהג']);
        if (btn) robustClick(btn);
        await delay(180);
        const drvEl = findField('driverId');
        if (drvEl && isVisible(drvEl) && appData.myId) setNativeInputValue(drvEl, appData.myId);
      } else {
        const btn = findButtonByText(['בחירת נהג']);
        if (btn) robustClick(btn);
        await delay(220);
        const drvId = extState.driverCustomId || extState.driverPersonId;
        const drvEl = findField('driverId');
        if (drvEl && drvId) {
          setNativeInputValue(drvEl, drvId);
          if (extState.driverCustomId) {
            tryLearnPersonNameNearInput(drvEl, drvId, 'נהג');
            extState.driverPersonId = drvId;
            extState.driverCustomId = '';
          }
        }
      }

      if (extState.cmdChoice === 'me') {
        const btn = findButtonByText(['אני מפקד משימה', 'אני מפקד']);
        if (btn) robustClick(btn);
        await delay(180);
        const cmdEl = findField('cmdId');
        if (cmdEl && isVisible(cmdEl) && appData.myId) setNativeInputValue(cmdEl, appData.myId);
      } else {
        const btn = findButtonByText(['בחירת מפקד משימה', 'בחירת מפקד']);
        if (btn) robustClick(btn);
        await delay(220);
        const cmdId = extState.cmdCustomId || extState.cmdPersonId;
        const cmdEl = findField('cmdId');
        if (cmdEl && cmdId) {
          setNativeInputValue(cmdEl, cmdId);
          if (extState.cmdCustomId) {
            tryLearnPersonNameNearInput(cmdEl, cmdId, 'מפקד משימה');
            extState.cmdPersonId = cmdId;
            extState.cmdCustomId = '';
          }
        }
      }

      const dispId = extState.dispCustomId || extState.dispPersonId;
      if (dispId) {
        const dispEl = findField('dispId');
        if (dispEl) {
          setNativeInputValue(dispEl, dispId);
          if (extState.dispCustomId) {
            tryLearnPersonNameNearInput(dispEl, dispId, 'משלח');
            extState.dispPersonId = dispId;
            extState.dispCustomId = '';
          }
        }
      }

      await delay(550);
      const nextBtn = findField('nextStep2Btn');
      const isDisabled = nextBtn && (nextBtn.disabled || nextBtn.getAttribute('aria-disabled') === 'true');
      if (nextBtn && !isDisabled) {
        robustClick(nextBtn);
        extState.step = 3;
        showToast('שלב 2 מולא • עבר אוטומטית לשלב 3 ✓');
        await delay(400);
        openDrawer(false);
      } else {
        showToast('שלב 2 מולא — בדוק את השדות ולחץ המשך');
      }
    });
  }

  function renderStep3() {
    const plate = extState.selectedVehiclePlate;
    const lastOdo = plate && appData.lastOdometers ? appData.lastOdometers[plate] : '';

    bodyEl.innerHTML = `
      <div class="card emerald" style="font-size:13px;font-weight:700;">
        ✓ סימון ההנחיות, הזנת קילומטראז' ופתיחת חתימה בנגיעה אחת.
      </div>

      <div class="card">
        <div class="row">
          <label class="lbl" style="margin:0;">קילומטראז' נוכחי ברכב</label>
          ${lastOdo ? `<span style="font-size:12px;font-weight:800;color:var(--emerald-border);">אחרון: ${escapeHtml(lastOdo)} ק"מ</span>` : ''}
        </div>
        <input id="ext-q-odo" class="input odo-big" type="text" inputmode="numeric" value="${escapeHtml(extState.quickOdometer)}" placeholder="${lastOdo ? escapeHtml(lastOdo) : '84250'}" />
      </div>

      <button id="ext-run-step3-sign" type="button" class="run-btn">
        ⚡ אשר הנחיות, מלא ק"מ ופתח חתימה
      </button>
    `;

    shadow.getElementById('ext-q-odo').addEventListener('input', e => {
      const clean = e.target.value.replace(/\D/g, '');
      e.target.value = clean;
      extState.quickOdometer = clean;
    });

    shadow.getElementById('ext-run-step3-sign').addEventListener('click', async () => {
      closeDrawer();
      await delay(100);

      const ackEl = findField('ackCheckbox');
      if (ackEl) {
        const innerInput = ackEl.tagName === 'INPUT' ? ackEl : ackEl.querySelector('input[type="checkbox"]');
        if (!innerInput || !innerInput.checked) {
          robustClick(ackEl);
          if (innerInput && !innerInput.checked) robustClick(innerInput);
        }
      }

      const cleanOdo = extState.quickOdometer.replace(/\D/g, '');
      if (cleanOdo && extState.selectedVehiclePlate) {
        appData.lastOdometers[extState.selectedVehiclePlate] = cleanOdo;
        saveData();
      }

      if (!findField('odometer')) {
        const openSignBtn = findButtonByText(['פתח חתימה', 'חתימה דיגיטלית', 'חתימה', 'המשך']);
        if (openSignBtn) {
          robustClick(openSignBtn);
          await delay(350);
        }
      }

      if (cleanOdo) {
        const odoEl = findField('odometer');
        if (odoEl) setNativeInputValue(odoEl, cleanOdo);
      }

      showToast('ההנחיות אושרו • חלון החתימה והק"מ מוכן ✓');
    });
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
