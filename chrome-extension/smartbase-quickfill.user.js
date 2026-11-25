// ==UserScript==
// @name         SmartBase מילוי מהיר לכרטיס עבודה
// @namespace    https://smartbase-quickfill.local/
// @version      1.0.0
// @description  מילוי מהיר של כרטיסי עבודה ב-SmartBase: מסלולים קבועים עם עריכת עצירה, מטרות מועדפות, רכבים, זיכרון קילומטראז', ת"ז קבועה ושיתוף הגדרות יחידה.
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

  // Prevent double injection
  if (window.__SMARTBASE_QUICKFILL_LOADED__) return;
  window.__SMARTBASE_QUICKFILL_LOADED__ = true;

  // If running on the local demo page that already has its own built-in drawer,
  // hide the demo's built-in FAB so the real Userscript takes over cleanly.
  const demoFab = document.getElementById('ext-fab');
  if (demoFab && document.getElementById('ext-drawer')) {
    demoFab.style.display = 'none';
  }

  const STORAGE_KEY = 'sb_quickfill_prod_v1';

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

  // Field definitions tuned to real SmartBase (https://smartbase.digital.idf.il)
  const FIELD_DEFS = [
    { key: 'origin', label: 'מוצא (שלב 1)', hints: ['מוצא', 'בסיס מוצא', 'origin'] },
    { key: 'addStopBtn', label: 'כפתור הוספת עצירה', hints: ['הוספת עצירה', 'הוסף עצירה'], isButton: true },
    { key: 'stop', label: 'תחנת עצירה (שלב 1)', hints: ['עצירה', 'תחנת עצירה', 'ביניים', 'stop'] },
    { key: 'dest', label: 'יעד (שלב 1)', hints: ['יעד', 'יעד נסיעה', 'dest'] },
    { key: 'purpose', label: 'מטרת הנסיעה (שלב 1)', hints: ['מהי מטרת הנסיעה', 'מטרת הנסיעה', 'תפקיד', 'purpose'] },
    { key: 'nextStep1Btn', label: 'כפתור המשך (שלב 1 ← 2)', hints: ['המשך', 'המשך לשיבוץ'], isButton: true },
    { key: 'plate', label: 'מספר רכב (שלב 2)', hints: ["מס' לוחית רישוי/צ'", 'לוחית רישוי', 'מספר הרכב', 'מספר רכב', 'plate'] },
    { key: 'driverId', label: 'ת"ז נהג (שלב 2)', hints: ['תעודת זהות נהג', 'נהג', 'driver'] },
    { key: 'cmdId', label: 'ת"ז מפקד משימה (שלב 2)', hints: ['מפקד משימה', 'מפקד', 'cmd'] },
    { key: 'dispId', label: 'ת"ז מפקד משלח (שלב 2)', hints: ['בחירת מפקד משלח', 'מפקד משלח', 'תעודת זהות', 'disp'] },
    { key: 'nightCmdCheckbox', label: 'אישור מפקד לילה (שלב 2)', hints: ['הוספת אישור מפקד לילה', 'מפקד לילה'] },
    { key: 'nextStep2Btn', label: 'כפתור המשך (שלב 2 ← 3)', hints: ['המשך', 'המשך לאישור'], isButton: true },
    { key: 'ackCheckbox', label: 'קראתי והבנתי (שלב 3)', hints: ['קראתי והבנתי את ההנחיות', 'קראתי והבנתי', 'הנחיות'] },
    { key: 'odometer', label: 'קילומטראז\' (שלב 3)', hints: ['ק"מ', 'קילומטראז', 'קילומטר', 'odometer'] }
  ];

  // ---------------------------------------------------------------------------
  // 1. Local Storage Abstraction (GM_getValue / localStorage fallback)
  // ---------------------------------------------------------------------------
  function getDefaultData() {
    return {
      myId: '',
      autoAdvance: true,
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
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, value);
      }
    } catch (_) {}
    try {
      localStorage.setItem(key, value);
    } catch (_) {}
  }

  function loadData() {
    try {
      const raw = storageGet(STORAGE_KEY);
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const def = getDefaultData();
      if (!parsed || typeof parsed !== 'object') return def;
      return {
        myId: typeof parsed.myId === 'string' ? parsed.myId.replace(/\D/g, '').slice(0, 9) : '',
        autoAdvance: parsed.autoAdvance !== false,
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
      showToast('שגיאה בשמירה מקומית');
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
    showToast(`מסלול חדש נשמר: ${routeName}`);
    return 0;
  }

  const uiState = {
    open: false,
    tab: 'fill', // 'fill' | 'manage' | 'calibrate'
    step: 1,
    editingMyId: !appData.myId,
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
  // 3. SPA-Safe DOM Engine (React / Angular / Vue / Native)
  // ---------------------------------------------------------------------------
  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function setNativeInputValue(el, value) {
    if (!el) return false;
    const strVal = String(value ?? '');
    el.focus();

    if (el.tagName === 'SELECT') {
      const opts = Array.from(el.options);
      const match = opts.find(o => o.value === strVal || o.text.trim() === strVal || o.text.includes(strVal));
      if (match) {
        el.value = match.value;
      } else {
        el.value = strVal;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      highlightPageEl(el);
      return true;
    }

    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(el, strVal);
    } else {
      el.value = strVal;
    }

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    highlightPageEl(el);
    return true;
  }

  async function selectCustomDropdown(triggerEl, optionText) {
    if (!triggerEl || !optionText) return false;
    if (triggerEl.tagName === 'SELECT') {
      return setNativeInputValue(triggerEl, optionText);
    }

    // Angular Material searchable autocomplete (like מוצא / יעד in SmartBase)
    if (triggerEl.tagName === 'INPUT') {
      setNativeInputValue(triggerEl, optionText);
      triggerEl.click();
      await delay(300);
    } else {
      triggerEl.click();
      await delay(280);
    }

    // Search opened option elements (Angular Material CDK overlay, Ionic, MUI, ARIA listbox)
    const candidates = Array.from(document.querySelectorAll(
      '.cdk-overlay-container mat-option, .cdk-overlay-container [role="option"], mat-option, [role="option"], ion-select-option, ion-item, .MuiMenuItem-root, li'
    )).filter(el => !el.closest('#sb-qf-host') && isVisible(el));

    const exact = candidates.find(el => el.textContent.trim() === optionText);
    const partial = exact || candidates.find(el => el.textContent.trim().includes(optionText));
    if (partial) {
      partial.click();
      await delay(120);
      return true;
    }
    return triggerEl.tagName === 'INPUT';
  }

  function highlightPageEl(el) {
    if (!el || !el.style) return;
    const prevOutline = el.style.outline;
    const prevBg = el.style.backgroundColor;
    el.style.outline = '2px solid #22c55e';
    el.style.backgroundColor = 'rgba(187, 247, 208, 0.45)';
    setTimeout(() => {
      el.style.outline = prevOutline;
      el.style.backgroundColor = prevBg;
    }, 1000);
  }

  function getAccessibleLabel(el) {
    const parts = [];
    if (el.getAttribute('aria-label')) parts.push(el.getAttribute('aria-label'));
    if (el.getAttribute('placeholder')) parts.push(el.getAttribute('placeholder'));
    if (el.getAttribute('name')) parts.push(el.getAttribute('name'));
    if (el.id) {
      parts.push(el.id);
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) parts.push(lbl.textContent);
    }
    const parentLabel = el.closest('label');
    if (parentLabel) parts.push(parentLabel.textContent);
    const parentCard = el.parentElement;
    if (parentCard) {
      const siblingLabel = parentCard.querySelector('label, h3, h4, span');
      if (siblingLabel && siblingLabel !== el) parts.push(siblingLabel.textContent);
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  function findButtonByText(textVariants) {
    const list = Array.isArray(textVariants) ? textVariants : [textVariants];
    const buttons = Array.from(document.querySelectorAll('button, [role="button"], a.btn, input[type="button"], input[type="submit"]'))
      .filter(el => !el.closest('#sb-qf-host') && isVisible(el));

    for (const txt of list) {
      const exact = buttons.find(b => b.textContent.trim() === txt);
      if (exact) return exact;
    }
    for (const txt of list) {
      const partial = buttons.find(b => b.textContent.trim().includes(txt));
      if (partial) return partial;
    }
    return null;
  }

  function findField(key) {
    // 1. Custom calibrated selector has highest priority
    const customSel = appData.customSelectors && appData.customSelectors[key];
    if (customSel) {
      try {
        const el = document.querySelector(customSel);
        if (el && !el.closest('#sb-qf-host')) return el;
      } catch (_) {}
    }

    // 2. Demo / Known IDs fallback
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

    // 3. Heuristic Hebrew label / placeholder / button text matching
    const def = FIELD_DEFS.find(f => f.key === key);
    if (!def) return null;

    if (def.isButton) {
      return findButtonByText(def.hints);
    }

    if (key === 'ackCheckbox' || key === 'nightCmdCheckbox') {
      const cbs = Array.from(document.querySelectorAll('input[type="checkbox"], mat-checkbox, [role="checkbox"]')).filter(el => !el.closest('#sb-qf-host'));
      return cbs.find(cb => def.hints.some(h => getAccessibleLabel(cb).includes(h))) || cbs.find(isVisible) || null;
    }

    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea, [role="combobox"], mat-select, .mat-mdc-select'))
      .filter(el => !el.closest('#sb-qf-host') && isVisible(el));

    for (const hint of def.hints) {
      const found = inputs.find(el => getAccessibleLabel(el).toLowerCase().includes(hint.toLowerCase()));
      if (found) return found;
    }
    return null;
  }

  function detectCurrentPageStep() {
    // Check visible elements on SmartBase page to auto-select the matching step in the drawer
    const originEl = findField('origin');
    const plateEl = findField('plate');
    const ackEl = findField('ackCheckbox');
    const odoEl = findField('odometer');

    if ((ackEl && isVisible(ackEl)) || (odoEl && isVisible(odoEl))) return 3;
    if (plateEl && isVisible(plateEl)) return 2;
    if (originEl && isVisible(originEl)) return 1;
    return uiState.step;
  }

  function buildUniqueSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.getAttribute('name')) {
      const sel = `${el.tagName.toLowerCase()}[name="${CSS.escape(el.getAttribute('name'))}"]`;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
    if (el.getAttribute('formcontrolname')) {
      const sel = `${el.tagName.toLowerCase()}[formcontrolname="${CSS.escape(el.getAttribute('formcontrolname'))}"]`;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
    if (el.getAttribute('data-testid')) {
      const sel = `[data-testid="${CSS.escape(el.getAttribute('data-testid'))}"]`;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
    const path = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.body && path.length < 5) {
      let part = cur.tagName.toLowerCase();
      const parent = cur.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
        }
      }
      path.unshift(part);
      cur = parent;
    }
    return path.join(' > ');
  }

  // Try to read a resolved person's name near an ID input on SmartBase and auto-save it
  function tryLearnPersonNameNearInput(inputEl, idVal, roleLabel) {
    const cleanId = String(idVal || '').replace(/\D/g, '');
    if (cleanId.length !== 9 || cleanId === appData.myId) return;
    if (appData.people.some(p => p.id === cleanId)) return;

    setTimeout(() => {
      let discoveredName = '';
      if (inputEl && inputEl.parentElement) {
        const container = inputEl.closest('div, section, form') || inputEl.parentElement;
        const textCandidates = Array.from(container.querySelectorAll('p, span, div, strong'))
          .filter(n => n !== inputEl && !n.contains(inputEl) && isVisible(n))
          .map(n => n.textContent.trim())
          .filter(t => t.length >= 3 && t.length <= 50 && /[\u0590-\u05FF]/.test(t));

        const match = textCandidates.find(t => t.includes('זוהה') || t.includes(cleanId));
        if (match) {
          discoveredName = match
            .replace(/✓|זוהה ב-SmartBase:?/g, '')
            .replace(new RegExp(`\\(?${cleanId}\\)?`, 'g'), '')
            .trim();
        }
      }

      const finalName = discoveredName ? `${discoveredName} (${roleLabel})` : `${roleLabel} (${cleanId.slice(-4)})`;
      appData.people.push({ name: finalName, id: cleanId, role: roleLabel });
      saveData();
      showToast(`נשמר אוטומטית למאגר: ${finalName}`);
    }, 450);
  }

  // ---------------------------------------------------------------------------
  // 4. Shadow DOM UI (Zero External Dependencies, 100% Style-Isolated)
  // ---------------------------------------------------------------------------
  const host = document.createElement('div');
  host.id = 'sb-qf-host';
  host.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;direction:rtl;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
      :host { direction: rtl; color: #1e293b; }

      .fab {
        position: fixed;
        bottom: 90px;
        left: 14px;
        z-index: 2147483646;
        background: linear-gradient(135deg, #5b4ce6 0%, #4334c9 100%);
        color: #fff;
        border: 2px solid rgba(255,255,255,0.45);
        border-radius: 9999px;
        padding: 10px 15px;
        font-size: 13px;
        font-weight: 800;
        box-shadow: 0 8px 22px rgba(42, 31, 130, 0.45);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: transform .15s ease;
        -webkit-tap-highlight-color: transparent;
      }
      .fab:active { transform: scale(0.95); }

      .overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.55);
        backdrop-filter: blur(3px);
        z-index: 2147483647;
        align-items: flex-end;
        justify-content: center;
      }
      .overlay.open { display: flex; }

      .sheet {
        background: #ffffff;
        width: 100%;
        max-width: 440px;
        max-height: 88vh;
        border-radius: 24px 24px 0 0;
        box-shadow: 0 -10px 40px rgba(0,0,0,0.3);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      @media (min-width: 640px) {
        .overlay { align-items: center; padding: 16px; }
        .sheet { border-radius: 24px; }
      }

      .header {
        background: #0f172a;
        color: #fff;
        padding: 14px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .header-title { font-size: 14px; font-weight: 800; margin: 0; }
      .header-sub { font-size: 11px; color: #c7d2fe; margin: 2px 0 0; }
      .close-btn {
        width: 32px; height: 32px; border-radius: 50%;
        border: none; background: rgba(255,255,255,0.12); color: #fff;
        font-size: 14px; font-weight: 700; cursor: pointer;
      }

      .tabs {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 4px;
        background: #f1f5f9;
        padding: 4px;
        margin: 10px 12px 4px;
        border-radius: 12px;
      }
      .tab {
        border: none; background: transparent; color: #475569;
        padding: 8px 4px; border-radius: 9px; font-size: 12px; font-weight: 700;
        cursor: pointer; transition: all .15s;
      }
      .tab.active {
        background: #fff; color: #5b4ce6;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }

      .step-pills {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        padding: 6px 12px 4px;
      }
      .step-pill {
        border: 1px solid #e2e8f0;
        background: #f8fafc;
        color: #475569;
        border-radius: 10px;
        padding: 6px 4px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
      }
      .step-pill.active {
        background: #5b4ce6;
        border-color: #5b4ce6;
        color: #fff;
      }

      .body {
        padding: 12px 14px 18px;
        overflow-y: auto;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .card {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .card.accent {
        background: #eef2ff;
        border-color: #c7d2fe;
      }
      .card.green {
        background: #ecfdf5;
        border-color: #a7f3d0;
      }

      .lbl { font-size: 12px; font-weight: 800; color: #334155; display: block; margin-bottom: 3px; }
      .sub-lbl { font-size: 11px; font-weight: 700; color: #64748b; display: block; margin-bottom: 3px; }

      .input, .select {
        width: 100%;
        padding: 9px 10px;
        border-radius: 11px;
        border: 1px solid #cbd5e1;
        background: #fff;
        color: #0f172a;
        font-size: 13px;
        font-weight: 600;
        outline: none;
      }
      .input:focus, .select:focus { border-color: #5b4ce6; box-shadow: 0 0 0 2px rgba(91,76,230,0.15); }
      .input.stop-highlight { border: 2px solid #34d399; }

      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
      .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }

      .btn {
        border: none;
        border-radius: 14px;
        padding: 12px 14px;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
        width: 100%;
        transition: opacity .15s;
      }
      .btn:active { opacity: 0.85; }
      .btn-primary { background: #5b4ce6; color: #fff; box-shadow: 0 6px 16px rgba(91,76,230,0.3); }
      .btn-dark { background: #0f172a; color: #fff; padding: 9px 12px; font-size: 12px; }
      .btn-outline { background: #fff; color: #5b4ce6; border: 1.5px solid #5b4ce6; padding: 8px 10px; font-size: 12px; }
      .btn-outline.active { background: #5b4ce6; color: #fff; }
      .btn-sm { width: auto; padding: 6px 10px; font-size: 11px; border-radius: 10px; }
      .btn-danger { background: transparent; color: #e11d48; border: none; font-size: 11px; font-weight: 800; cursor: pointer; padding: 4px 6px; }

      .list-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #fff;
        border: 1px solid #e2e8f0;
        padding: 7px 10px;
        border-radius: 10px;
        font-size: 12px;
        font-weight: 600;
      }
      .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

      .toast {
        position: fixed;
        top: 14px;
        left: 50%;
        transform: translateX(-50%);
        background: #0f172a;
        color: #fff;
        padding: 10px 16px;
        border-radius: 14px;
        font-size: 12px;
        font-weight: 800;
        box-shadow: 0 10px 25px rgba(0,0,0,0.3);
        z-index: 2147483647;
        display: none;
        max-width: 90vw;
        text-align: center;
      }
      .toast.show { display: block; }

      .calib-banner {
        position: fixed;
        top: 14px;
        left: 50%;
        transform: translateX(-50%);
        background: #dc2626;
        color: #fff;
        padding: 10px 16px;
        border-radius: 14px;
        font-size: 13px;
        font-weight: 800;
        box-shadow: 0 10px 30px rgba(220,38,38,0.45);
        z-index: 2147483647;
        display: none;
        align-items: center;
        gap: 10px;
      }
      .calib-banner.show { display: flex; }
    </style>

    <button id="qf-fab" class="fab" type="button">⚡ מילוי מהיר</button>

    <div id="qf-toast" class="toast"></div>
    <div id="qf-calib-banner" class="calib-banner">
      <span id="qf-calib-text">לחץ על השדה בדף...</span>
      <button id="qf-calib-cancel" type="button" style="background:#fff;color:#dc2626;border:none;border-radius:8px;padding:4px 8px;font-weight:800;cursor:pointer;">ביטול</button>
    </div>

    <div id="qf-overlay" class="overlay">
      <div class="sheet">
        <div class="header">
          <div>
            <h2 class="header-title">⚡ SmartBase מילוי מהיר</h2>
            <p id="qf-subtitle" class="header-sub">שלב 1 • תכנון נסיעה</p>
          </div>
          <button id="qf-close" class="close-btn" type="button">✕</button>
        </div>

        <div class="tabs">
          <button id="tab-fill" class="tab active" type="button">⚡ מילוי</button>
          <button id="tab-manage" class="tab" type="button">⚙️ רשימות</button>
          <button id="tab-calibrate" class="tab" type="button">🔧 כיול</button>
        </div>

        <div id="qf-step-pills" class="step-pills">
          <button class="step-pill" data-step="1" type="button">1. נסיעה</button>
          <button class="step-pill" data-step="2" type="button">2. רכב וצוות</button>
          <button class="step-pill" data-step="3" type="button">3. חתימה וק"מ</button>
        </div>

        <div id="qf-body" class="body"></div>
      </div>
    </div>
  `;

  const fab = shadow.getElementById('qf-fab');
  const overlay = shadow.getElementById('qf-overlay');
  const closeBtn = shadow.getElementById('qf-close');
  const subtitleEl = shadow.getElementById('qf-subtitle');
  const bodyEl = shadow.getElementById('qf-body');
  const stepPillsEl = shadow.getElementById('qf-step-pills');
  const toastEl = shadow.getElementById('qf-toast');
  const calibBanner = shadow.getElementById('qf-calib-banner');
  const calibText = shadow.getElementById('qf-calib-text');
  const calibCancel = shadow.getElementById('qf-calib-cancel');

  let toastTimer = null;
  function showToast(msg) {
    if (!msg) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
  }

  function openDrawer(autoDetect = true) {
    if (autoDetect && uiState.tab === 'fill') {
      uiState.step = detectCurrentPageStep();
    }
    uiState.open = true;
    overlay.classList.add('open');
    render();
  }

  function closeDrawer() {
    uiState.open = false;
    overlay.classList.remove('open');
  }

  // ---------------------------------------------------------------------------
  // 5. Render Views
  // ---------------------------------------------------------------------------
  function render() {
    shadow.getElementById('tab-fill').classList.toggle('active', uiState.tab === 'fill');
    shadow.getElementById('tab-manage').classList.toggle('active', uiState.tab === 'manage');
    shadow.getElementById('tab-calibrate').classList.toggle('active', uiState.tab === 'calibrate');

    stepPillsEl.style.display = uiState.tab === 'fill' ? 'grid' : 'none';
    shadow.querySelectorAll('.step-pill').forEach(btn => {
      btn.classList.toggle('active', Number(btn.getAttribute('data-step')) === uiState.step);
    });

    if (uiState.tab === 'manage') {
      subtitleEl.textContent = 'ניהול ת"ז, מסלולים, רכבים ושיתוף יחידה';
      renderManage();
    } else if (uiState.tab === 'calibrate') {
      subtitleEl.textContent = 'התאמת שדות למבנה הדף של SmartBase';
      renderCalibrate();
    } else if (uiState.step === 1) {
      subtitleEl.textContent = 'שלב 1 • תכנון נסיעה ומסלולים';
      renderStep1();
    } else if (uiState.step === 2) {
      subtitleEl.textContent = 'שלב 2 • רכב, נהג, מפקד משימה ומשלח';
      renderStep2();
    } else {
      subtitleEl.textContent = 'שלב 3 • אישור הנחיות וקילומטראז\'';
      renderStep3();
    }
  }

  function renderStep1() {
    const sortedPurposes = getSortedTripPurposes();
    const counts = appData.purposeCounts || {};

    bodyEl.innerHTML = `
      <div class="card accent">
        <div class="row">
          <span class="lbl" style="margin:0;color:#312e81;">מסלול קבוע:</span>
          <span style="font-size:10px;font-weight:700;color:#5b4ce6;">מסלול חדש נשמר אוטומטית</span>
        </div>
        <select id="qf-sel-route" class="select">
          <option value="">-- מסלול חדש / הזנה ידנית --</option>
          ${appData.routes.map((r, i) => `<option value="${i}" ${String(uiState.selectedRouteIdx) === String(i) ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
        </select>

        <div class="grid-3">
          <div>
            <label class="sub-lbl">מוצא</label>
            <input id="qf-origin" class="input" type="text" value="${escapeHtml(uiState.quickOrigin)}" placeholder="מוצא" />
          </div>
          <div>
            <label class="sub-lbl" style="color:#047857;">עצירה (עריכה)</label>
            <input id="qf-stop" class="input stop-highlight" type="text" value="${escapeHtml(uiState.quickStop)}" placeholder="למשל: חצור" />
          </div>
          <div>
            <label class="sub-lbl">יעד</label>
            <input id="qf-dest" class="input" type="text" value="${escapeHtml(uiState.quickDest)}" placeholder="יעד" />
          </div>
        </div>
      </div>

      <div>
        <label class="lbl">מטרת הנסיעה (המועדפות בראש):</label>
        <select id="qf-purpose" class="select">
          ${sortedPurposes.map(p => {
            const c = Number(counts[p] || 0);
            const label = c > 0 ? `★ ${p} (${c})` : p;
            return `<option value="${escapeHtml(p)}" ${uiState.quickPurpose === p ? 'selected' : ''}>${escapeHtml(label)}</option>`;
          }).join('')}
        </select>
      </div>

      <div>
        <span class="lbl">סוג הנסיעה:</span>
        <div class="grid-2">
          <button type="button" data-trip="נסיעה מנהלתית" class="btn btn-outline ${uiState.quickTripType === 'נסיעה מנהלתית' ? 'active' : ''}">נסיעה מנהלתית</button>
          <button type="button" data-trip="נסיעה מבצעית" class="btn btn-outline ${uiState.quickTripType === 'נסיעה מבצעית' ? 'active' : ''}">נסיעה מבצעית</button>
        </div>
      </div>

      <button id="qf-run-1" type="button" class="btn btn-primary">
        ⚡ מלא שלב 1 ${appData.autoAdvance ? 'ועבור לשלב 2' : ''}
      </button>
    `;

    shadow.getElementById('qf-sel-route').addEventListener('change', (e) => {
      uiState.selectedRouteIdx = e.target.value;
      if (e.target.value !== '') {
        const r = appData.routes[Number(e.target.value)];
        if (r) {
          uiState.quickOrigin = r.origin || '';
          uiState.quickStop = r.stop || '';
          uiState.quickDest = r.dest || '';
          uiState.quickPurpose = TRIP_PURPOSES.includes(r.purpose) ? r.purpose : 'תפקיד';
          uiState.quickTripType = r.tripType || 'נסיעה מנהלתית';
          render();
        }
      }
    });

    shadow.getElementById('qf-origin').addEventListener('input', e => { uiState.quickOrigin = e.target.value; });
    shadow.getElementById('qf-stop').addEventListener('input', e => { uiState.quickStop = e.target.value; });
    shadow.getElementById('qf-dest').addEventListener('input', e => { uiState.quickDest = e.target.value; });
    shadow.getElementById('qf-purpose').addEventListener('change', e => { uiState.quickPurpose = e.target.value; });

    shadow.querySelectorAll('[data-trip]').forEach(btn => {
      btn.addEventListener('click', () => {
        uiState.quickTripType = btn.getAttribute('data-trip');
        render();
      });
    });

    shadow.getElementById('qf-run-1').addEventListener('click', async () => {
      const origin = uiState.quickOrigin.trim();
      const stop = uiState.quickStop.trim();
      const dest = uiState.quickDest.trim();

      if (!origin || !dest) {
        showToast('יש למלא לפחות מוצא ויעד');
        return;
      }

      const savedIdx = autoSaveRouteIfNew(origin, stop, dest, uiState.quickPurpose, uiState.quickTripType);
      if (savedIdx !== null) uiState.selectedRouteIdx = String(savedIdx);
      recordPurposeUsage(uiState.quickPurpose);

      let filled = 0;
      const originEl = findField('origin');
      if (originEl) { await selectCustomDropdown(originEl, origin); filled++; }

      if (stop) {
        let stopEl = findField('stop');
        if (!stopEl || !isVisible(stopEl)) {
          const addStopBtn = findField('addStopBtn');
          if (addStopBtn) {
            addStopBtn.click();
            await delay(220);
            stopEl = findField('stop');
          }
        }
        if (stopEl) { await selectCustomDropdown(stopEl, stop); filled++; }
      }

      const destEl = findField('dest');
      if (destEl) { await selectCustomDropdown(destEl, dest); filled++; }

      const purposeEl = findField('purpose');
      if (purposeEl && uiState.quickPurpose) {
        await selectCustomDropdown(purposeEl, uiState.quickPurpose);
        filled++;
      }

      const tripBtn = findButtonByText([uiState.quickTripType]);
      if (tripBtn) { tripBtn.click(); filled++; }

      if (filled === 0) {
        showToast('לא זוהו שדות שלב 1 — השתמש בלשונית "🔧 כיול"');
        return;
      }

      if (appData.autoAdvance) {
        await delay(150);
        const nextBtn = findField('nextStep1Btn');
        if (nextBtn) nextBtn.click();
        uiState.step = 2;
        showToast('שלב 1 מולא • עבר לשלב 2');
        render();
      } else {
        showToast('שלב 1 מולא בהצלחה ✓');
        closeDrawer();
      }
    });
  }

  function renderStep2() {
    const peopleOpts = appData.people.length
      ? appData.people.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${escapeHtml(p.id)})</option>`).join('')
      : '<option value="">אין אנשים שמורים עדיין</option>';

    bodyEl.innerHTML = `
      <div class="card">
        ${uiState.editingMyId ? `
          <label class="lbl">תעודת הזהות הקבועה שלי (9 ספרות):</label>
          <div class="row">
            <input id="qf-myid-in" class="input" type="text" inputmode="numeric" maxlength="9" value="${escapeHtml(appData.myId)}" placeholder="הזן 9 ספרות" />
            <button id="qf-myid-save" type="button" class="btn btn-primary btn-sm">שמור</button>
          </div>
        ` : `
          <div class="row">
            <div>
              <span class="sub-lbl" style="margin:0;">תעודת הזהות שלי:</span>
              <strong style="font-size:13px;">${escapeHtml(appData.myId || 'לא הוגדרה')}</strong>
            </div>
            <button id="qf-myid-edit" type="button" class="btn btn-outline btn-sm">✏️ ערוך</button>
          </div>
        `}
      </div>

      <div>
        <label class="lbl">מספר הרכב:</label>
        <select id="qf-sel-veh" class="select">
          <option value="">-- בחר רכב שמור --</option>
          ${appData.vehicles.map(v => `<option value="${escapeHtml(v.plate)}" ${uiState.selectedVehiclePlate === v.plate ? 'selected' : ''}>${escapeHtml(v.name)} (${escapeHtml(v.plate)})</option>`).join('')}
        </select>
      </div>

      <div class="card">
        <span class="lbl" style="margin:0;">נהג:</span>
        <div class="grid-2">
          <button type="button" data-d="me" class="btn btn-outline ${uiState.driverChoice === 'me' ? 'active' : ''}">אני נהג</button>
          <button type="button" data-d="person" class="btn btn-outline ${uiState.driverChoice === 'person' ? 'active' : ''}">בחירת נהג</button>
        </div>
        ${uiState.driverChoice === 'person' ? `
          <select id="qf-sel-driver" class="select">
            <option value="">-- בחר מהמאגר --</option>
            ${peopleOpts}
          </select>
          <input id="qf-custom-driver" class="input" type="text" inputmode="numeric" maxlength="9" value="${escapeHtml(uiState.driverCustomId)}" placeholder="או הזן ת&quot;ז חדשה (9 ספרות)" />
        ` : ''}
      </div>

      <div class="card">
        <span class="lbl" style="margin:0;">מפקד משימה:</span>
        <div class="grid-2">
          <button type="button" data-c="me" class="btn btn-outline ${uiState.cmdChoice === 'me' ? 'active' : ''}">אני מפקד</button>
          <button type="button" data-c="person" class="btn btn-outline ${uiState.cmdChoice === 'person' ? 'active' : ''}">בחירת מפקד</button>
        </div>
        ${uiState.cmdChoice === 'person' ? `
          <select id="qf-sel-cmd" class="select">
            <option value="">-- בחר מהמאגר --</option>
            ${peopleOpts}
          </select>
          <input id="qf-custom-cmd" class="input" type="text" inputmode="numeric" maxlength="9" value="${escapeHtml(uiState.cmdCustomId)}" placeholder="או הזן ת&quot;ז חדשה (9 ספרות)" />
        ` : ''}
      </div>

      <div class="card">
        <label class="lbl" style="margin:0;">מפקד משלח (הנייד מושלם אוטומטית):</label>
        <select id="qf-sel-disp" class="select">
          <option value="">-- בחר משלח מהמאגר --</option>
          ${peopleOpts}
        </select>
        <input id="qf-custom-disp" class="input" type="text" inputmode="numeric" maxlength="9" value="${escapeHtml(uiState.dispCustomId)}" placeholder="או הזן ת&quot;ז משלח חדש (9 ספרות)" />
      </div>

      <button id="qf-run-2" type="button" class="btn btn-primary">
        ⚡ מלא שלב 2 ${appData.autoAdvance ? 'ועבור לשלב 3' : ''}
      </button>
    `;

    const editBtn = shadow.getElementById('qf-myid-edit');
    if (editBtn) editBtn.addEventListener('click', () => { uiState.editingMyId = true; render(); });

    const saveBtn = shadow.getElementById('qf-myid-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const val = shadow.getElementById('qf-myid-in').value.replace(/\D/g, '').slice(0, 9);
        if (val.length !== 9) { showToast('יש להזין 9 ספרות'); return; }
        appData.myId = val;
        saveData();
        uiState.editingMyId = false;
        showToast('תעודת הזהות נשמרה ✓');
        render();
      });
    }

    shadow.getElementById('qf-sel-veh').addEventListener('change', e => { uiState.selectedVehiclePlate = e.target.value; });
    shadow.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => { uiState.driverChoice = b.getAttribute('data-d'); render(); }));
    shadow.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => { uiState.cmdChoice = b.getAttribute('data-c'); render(); }));

    const selDrv = shadow.getElementById('qf-sel-driver');
    if (selDrv) {
      selDrv.value = uiState.driverCustomId ? '' : uiState.driverPersonId;
      selDrv.addEventListener('change', e => { uiState.driverPersonId = e.target.value; uiState.driverCustomId = ''; });
    }
    const custDrv = shadow.getElementById('qf-custom-driver');
    if (custDrv) {
      custDrv.addEventListener('input', e => {
        const c = e.target.value.replace(/\D/g, '').slice(0, 9);
        e.target.value = c;
        uiState.driverCustomId = c;
        if (c && selDrv) selDrv.value = '';
      });
    }

    const selCmd = shadow.getElementById('qf-sel-cmd');
    if (selCmd) {
      selCmd.value = uiState.cmdCustomId ? '' : uiState.cmdPersonId;
      selCmd.addEventListener('change', e => { uiState.cmdPersonId = e.target.value; uiState.cmdCustomId = ''; });
    }
    const custCmd = shadow.getElementById('qf-custom-cmd');
    if (custCmd) {
      custCmd.addEventListener('input', e => {
        const c = e.target.value.replace(/\D/g, '').slice(0, 9);
        e.target.value = c;
        uiState.cmdCustomId = c;
        if (c && selCmd) selCmd.value = '';
      });
    }

    const selDisp = shadow.getElementById('qf-sel-disp');
    if (selDisp) {
      selDisp.value = uiState.dispCustomId ? '' : uiState.dispPersonId;
      selDisp.addEventListener('change', e => { uiState.dispPersonId = e.target.value; uiState.dispCustomId = ''; });
    }
    const custDisp = shadow.getElementById('qf-custom-disp');
    if (custDisp) {
      custDisp.addEventListener('input', e => {
        const c = e.target.value.replace(/\D/g, '').slice(0, 9);
        e.target.value = c;
        uiState.dispCustomId = c;
        if (c && selDisp) selDisp.value = '';
      });
    }

    shadow.getElementById('qf-run-2').addEventListener('click', async () => {
      if ((uiState.driverChoice === 'me' || uiState.cmdChoice === 'me') && appData.myId.length !== 9) {
        showToast('הזן תחילה את תעודת הזהות הקבועה שלך למעלה');
        uiState.editingMyId = true;
        render();
        return;
      }

      if (uiState.selectedVehiclePlate) {
        const plateEl = findField('plate');
        if (plateEl) setNativeInputValue(plateEl, uiState.selectedVehiclePlate);
      }

      // Driver
      if (uiState.driverChoice === 'me') {
        const btn = findButtonByText(['אני נהג']);
        if (btn) btn.click();
        await delay(120);
        const drvEl = findField('driverId');
        if (drvEl && isVisible(drvEl)) setNativeInputValue(drvEl, appData.myId);
      } else {
        const btn = findButtonByText(['בחירת נהג']);
        if (btn) btn.click();
        await delay(120);
        const drvId = uiState.driverCustomId || uiState.driverPersonId;
        const drvEl = findField('driverId');
        if (drvEl && drvId) {
          setNativeInputValue(drvEl, drvId);
          if (uiState.driverCustomId) {
            tryLearnPersonNameNearInput(drvEl, drvId, 'נהג');
            uiState.driverPersonId = drvId;
            uiState.driverCustomId = '';
          }
        }
      }

      // Mission Commander
      if (uiState.cmdChoice === 'me') {
        const btn = findButtonByText(['אני מפקד משימה', 'אני מפקד']);
        if (btn) btn.click();
        await delay(120);
        const cmdEl = findField('cmdId');
        if (cmdEl && isVisible(cmdEl)) setNativeInputValue(cmdEl, appData.myId);
      } else {
        const btn = findButtonByText(['בחירת מפקד משימה', 'בחירת מפקד']);
        if (btn) btn.click();
        await delay(120);
        const cmdId = uiState.cmdCustomId || uiState.cmdPersonId;
        const cmdEl = findField('cmdId');
        if (cmdEl && cmdId) {
          setNativeInputValue(cmdEl, cmdId);
          if (uiState.cmdCustomId) {
            tryLearnPersonNameNearInput(cmdEl, cmdId, 'מפקד משימה');
            uiState.cmdPersonId = cmdId;
            uiState.cmdCustomId = '';
          }
        }
      }

      // Dispatcher
      const dispId = uiState.dispCustomId || uiState.dispPersonId;
      if (dispId) {
        const dispEl = findField('dispId');
        if (dispEl) {
          setNativeInputValue(dispEl, dispId);
          if (uiState.dispCustomId) {
            tryLearnPersonNameNearInput(dispEl, dispId, 'משלח');
            uiState.dispPersonId = dispId;
            uiState.dispCustomId = '';
          }
        }
      }

      if (appData.autoAdvance) {
        await delay(200);
        const nextBtn = findField('nextStep2Btn');
        if (nextBtn) nextBtn.click();
        uiState.step = 3;
        showToast('שלב 2 מולא • עבר לשלב 3');
        render();
      } else {
        showToast('שלב 2 מולא בהצלחה ✓');
        closeDrawer();
      }
    });
  }

  function renderStep3() {
    const plate = uiState.selectedVehiclePlate;
    const lastOdo = plate && appData.lastOdometers ? appData.lastOdometers[plate] : '';

    bodyEl.innerHTML = `
      <div class="card green">
        <span style="font-size:12px;font-weight:700;color:#065f46;">
          שלב 3 • סימון אישור הנחיות, הזנת קילומטראז' ופתיחת חתימה.
        </span>
      </div>

      <div>
        <div class="row">
          <label class="lbl">קילומטראז' נוכחי ברכב:</label>
          ${lastOdo ? `<span style="font-size:11px;font-weight:800;color:#5b4ce6;">אחרון: ${escapeHtml(lastOdo)} ק"מ</span>` : ''}
        </div>
        <input id="qf-odo" class="input" type="text" inputmode="numeric" value="${escapeHtml(uiState.quickOdometer)}" placeholder="${lastOdo ? `אחרון: ${escapeHtml(lastOdo)}` : 'למשל: 84250'}" />
      </div>

      <button id="qf-run-3" type="button" class="btn btn-primary">
        ⚡ אשר הנחיות ומלא קילומטראז'
      </button>
    `;

    shadow.getElementById('qf-odo').addEventListener('input', e => {
      const clean = e.target.value.replace(/\D/g, '');
      e.target.value = clean;
      uiState.quickOdometer = clean;
    });

    shadow.getElementById('qf-run-3').addEventListener('click', async () => {
      const ackEl = findField('ackCheckbox');
      if (ackEl && !ackEl.checked) {
        ackEl.click();
        if (!ackEl.checked) {
          ackEl.checked = true;
          ackEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      const cleanOdo = uiState.quickOdometer.replace(/\D/g, '');
      if (cleanOdo && uiState.selectedVehiclePlate) {
        appData.lastOdometers[uiState.selectedVehiclePlate] = cleanOdo;
        saveData();
      }

      // Open signature modal if there's a button for it
      const openSignBtn = findButtonByText(['פתח חתימה', 'חתימה דיגיטלית', 'חתימה']);
      if (openSignBtn) {
        openSignBtn.click();
        await delay(200);
      }

      if (cleanOdo) {
        const odoEl = findField('odometer');
        if (odoEl) setNativeInputValue(odoEl, cleanOdo);
      }

      closeDrawer();
      showToast('ההנחיות אושרו והק"מ הוזן — נותר רק לחתום ✓');
    });
  }

  function renderManage() {
    bodyEl.innerHTML = `
      <div class="card">
        <label class="lbl">תעודת הזהות הקבועה שלי (נשמרת במכשיר בלבד):</label>
        <div class="row">
          <input id="mg-myid" class="input" type="text" inputmode="numeric" maxlength="9" value="${escapeHtml(appData.myId)}" placeholder="9 ספרות" />
          <button id="mg-save-myid" type="button" class="btn btn-primary btn-sm">שמור</button>
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;margin-top:4px;cursor:pointer;">
          <input id="mg-auto-adv" type="checkbox" ${appData.autoAdvance ? 'checked' : ''} />
          מעבר אוטומטי לשלב הבא אחרי מילוי
        </label>
      </div>

      <div class="card">
        <span class="lbl">מסלולים קבועים:</span>
        <div class="grid-3">
          <input id="mg-r-origin" class="input" type="text" placeholder="מוצא" />
          <input id="mg-r-stop" class="input" type="text" placeholder="עצירה" />
          <input id="mg-r-dest" class="input" type="text" placeholder="יעד" />
        </div>
        <button id="mg-add-route" type="button" class="btn btn-dark">+ הוסף מסלול</button>
        ${appData.routes.map((r, i) => `
          <div class="list-item">
            <span class="truncate">${escapeHtml(r.name)}</span>
            <button type="button" class="btn-danger" data-del-r="${i}">מחק</button>
          </div>
        `).join('')}
      </div>

      <div class="card">
        <span class="lbl">רכבים שמורים:</span>
        <div class="grid-2">
          <input id="mg-v-name" class="input" type="text" placeholder="כינוי (היילקס)" />
          <input id="mg-v-plate" class="input" type="text" placeholder="מס' צ' / רישוי" />
        </div>
        <button id="mg-add-veh" type="button" class="btn btn-dark">+ הוסף רכב</button>
        ${appData.vehicles.map((v, i) => `
          <div class="list-item">
            <span class="truncate">${escapeHtml(v.name)} — ${escapeHtml(v.plate)}</span>
            <button type="button" class="btn-danger" data-del-v="${i}">מחק</button>
          </div>
        `).join('')}
      </div>

      <div class="card">
        <span class="lbl">אנשי צוות / משלחים (ללא טלפון):</span>
        <div class="grid-2">
          <input id="mg-p-name" class="input" type="text" placeholder="שם (דני משלח)" />
          <input id="mg-p-id" class="input" type="text" inputmode="numeric" maxlength="9" placeholder="ת&quot;ז (9 ספרות)" />
        </div>
        <button id="mg-add-person" type="button" class="btn btn-dark">+ הוסף אדם</button>
        ${appData.people.map((p, i) => `
          <div class="list-item">
            <span class="truncate">${escapeHtml(p.name)} — ${escapeHtml(p.id)}</span>
            <button type="button" class="btn-danger" data-del-p="${i}">מחק</button>
          </div>
        `).join('')}
      </div>

      <div class="card accent">
        <span class="lbl" style="color:#312e81;">📤 שיתוף הגדרות יחידה למכשירים אחרים</span>
        <p style="font-size:11px;color:#475569;margin:0;">מעביר מסלולים, רכבים, משלחים וכיולי שדות בוואטסאפ — <strong>בלי</strong> תעודת הזהות האישית שלך.</p>
        <div class="grid-2">
          <button id="mg-export" type="button" class="btn btn-primary btn-sm" style="width:100%;">📋 העתק קוד שיתוף</button>
          <button id="mg-import" type="button" class="btn btn-outline btn-sm" style="width:100%;">📥 ייבא קוד</button>
        </div>
      </div>
    `;

    shadow.getElementById('mg-save-myid').addEventListener('click', () => {
      const val = shadow.getElementById('mg-myid').value.replace(/\D/g, '').slice(0, 9);
      if (val.length !== 9) { showToast('יש להזין 9 ספרות'); return; }
      appData.myId = val;
      uiState.editingMyId = false;
      saveData();
      showToast('תעודת הזהות נשמרה ✓');
    });

    shadow.getElementById('mg-auto-adv').addEventListener('change', e => {
      appData.autoAdvance = e.target.checked;
      saveData();
    });

    shadow.getElementById('mg-add-route').addEventListener('click', () => {
      const o = shadow.getElementById('mg-r-origin').value.trim();
      const s = shadow.getElementById('mg-r-stop').value.trim();
      const d = shadow.getElementById('mg-r-dest').value.trim();
      if (!o || !d) { showToast('יש למלא מוצא ויעד'); return; }
      const name = `${o}${s ? ` ◄ ${s}` : ''} ◄ ${d}`;
      appData.routes.push({ name, origin: o, stop: s, dest: d, purpose: 'תפקיד', tripType: 'נסיעה מנהלתית' });
      saveData();
      showToast('המסלול נוסף ✓');
      render();
    });

    shadow.getElementById('mg-add-veh').addEventListener('click', () => {
      const name = shadow.getElementById('mg-v-name').value.trim();
      const plate = shadow.getElementById('mg-v-plate').value.trim();
      if (!name || !plate) { showToast('יש למלא כינוי ומספר רכב'); return; }
      appData.vehicles.push({ name, plate });
      uiState.selectedVehiclePlate = plate;
      saveData();
      showToast('הרכב נוסף ✓');
      render();
    });

    shadow.getElementById('mg-add-person').addEventListener('click', () => {
      const name = shadow.getElementById('mg-p-name').value.trim();
      const id = shadow.getElementById('mg-p-id').value.replace(/\D/g, '').slice(0, 9);
      if (!name || id.length !== 9) { showToast('יש למלא שם ות"ז בת 9 ספרות'); return; }
      appData.people.push({ name, id, role: 'צוות' });
      saveData();
      showToast('האדם נוסף ✓');
      render();
    });

    shadow.querySelectorAll('[data-del-r]').forEach(b => b.addEventListener('click', () => {
      const idx = Number(b.getAttribute('data-del-r'));
      appData.routes.splice(idx, 1);
      if (uiState.selectedRouteIdx !== '') {
        const cur = Number(uiState.selectedRouteIdx);
        if (cur === idx) uiState.selectedRouteIdx = appData.routes.length ? '0' : '';
        else if (cur > idx) uiState.selectedRouteIdx = String(cur - 1);
      }
      saveData();
      render();
    }));

    shadow.querySelectorAll('[data-del-v]').forEach(b => b.addEventListener('click', () => {
      const idx = Number(b.getAttribute('data-del-v'));
      const rem = appData.vehicles.splice(idx, 1)[0];
      if (rem && uiState.selectedVehiclePlate === rem.plate) uiState.selectedVehiclePlate = appData.vehicles[0]?.plate || '';
      saveData();
      render();
    }));

    shadow.querySelectorAll('[data-del-p]').forEach(b => b.addEventListener('click', () => {
      const idx = Number(b.getAttribute('data-del-p'));
      const rem = appData.people.splice(idx, 1)[0];
      if (rem) {
        if (uiState.driverPersonId === rem.id) uiState.driverPersonId = appData.people[0]?.id || '';
        if (uiState.cmdPersonId === rem.id) uiState.cmdPersonId = appData.people[0]?.id || '';
        if (uiState.dispPersonId === rem.id) uiState.dispPersonId = appData.people[0]?.id || '';
      }
      saveData();
      render();
    }));

    shadow.getElementById('mg-export').addEventListener('click', async () => {
      const payload = JSON.stringify({
        v: 1,
        routes: appData.routes,
        vehicles: appData.vehicles,
        people: appData.people,
        customSelectors: appData.customSelectors
      });
      try {
        await navigator.clipboard.writeText(payload);
        showToast('קוד היחידה הועתק — שלח בוואטסאפ ✓');
      } catch (_) {
        window.prompt('העתק את קוד השיתוף:', payload);
      }
    });

    shadow.getElementById('mg-import').addEventListener('click', () => {
      const raw = window.prompt('הדבק את קוד השיתוף שקיבלת:');
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw.trim());
        if (!parsed || typeof parsed !== 'object') throw new Error('bad');
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
  }

  function renderCalibrate() {
    bodyEl.innerHTML = `
      <div class="card accent">
        <span class="lbl" style="color:#312e81;">🔧 כיול שדות חכם (פעם אחת בלבד)</span>
        <p style="font-size:11px;color:#475569;margin:0;">
          אם שדה מסוים ב-SmartBase לא מתמלא אוטומטית — לחץ "כייל", ואז גע בשדה האמיתי בדף. הכיול נשמר וניתן לשתף אותו עם כל היחידה.
        </p>
      </div>

      ${FIELD_DEFS.map(def => {
        const saved = appData.customSelectors[def.key];
        const autoFound = !saved && Boolean(findField(def.key));
        const status = saved ? '🟢 מכויל ידנית' : (autoFound ? '🔵 זוהה אוטומטית' : '⚪ לא זוהה בדף זה');
        return `
          <div class="list-item">
            <div style="min-width:0;flex:1;">
              <div style="font-weight:800;font-size:12px;">${escapeHtml(def.label)}</div>
              <div style="font-size:10px;color:#64748b;" class="truncate">${status}${saved ? ` (${escapeHtml(saved)})` : ''}</div>
            </div>
            <div style="display:flex;gap:4px;">
              <button type="button" class="btn btn-outline btn-sm" data-cal="${def.key}">כייל</button>
              ${saved ? `<button type="button" class="btn-danger" data-cal-clear="${def.key}">איפוס</button>` : ''}
            </div>
          </div>
        `;
      }).join('')}
    `;

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
  // 6. Interactive Field Picker (Calibration Mode)
  // ---------------------------------------------------------------------------
  function startCalibration(key) {
    const def = FIELD_DEFS.find(f => f.key === key);
    if (!def) return;
    uiState.calibratingKey = key;
    closeDrawer();
    calibText.textContent = `גע בשדה: "${def.label}" בדף`;
    calibBanner.classList.add('show');
    document.addEventListener('click', onCalibrateClick, true);
  }

  function stopCalibration() {
    uiState.calibratingKey = null;
    calibBanner.classList.remove('show');
    document.removeEventListener('click', onCalibrateClick, true);
  }

  function onCalibrateClick(evt) {
    if (!uiState.calibratingKey) return;
    if (evt.target.closest && evt.target.closest('#sb-qf-host')) return;
    evt.preventDefault();
    evt.stopPropagation();

    const target = evt.target;
    const selector = buildUniqueSelector(target);
    if (selector) {
      appData.customSelectors[uiState.calibratingKey] = selector;
      saveData();
      highlightPageEl(target);
      showToast(`השדה כויל בהצלחה ✓`);
    } else {
      showToast('לא ניתן היה לזהות סלקטור לשדה זה');
    }
    stopCalibration();
    uiState.tab = 'calibrate';
    openDrawer(false);
  }

  // ---------------------------------------------------------------------------
  // 7. Wire Events
  // ---------------------------------------------------------------------------
  fab.addEventListener('click', () => openDrawer(true));
  closeBtn.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDrawer(); });
  calibCancel.addEventListener('click', () => { stopCalibration(); openDrawer(false); });

  shadow.getElementById('tab-fill').addEventListener('click', () => { uiState.tab = 'fill'; render(); });
  shadow.getElementById('tab-manage').addEventListener('click', () => { uiState.tab = 'manage'; render(); });
  shadow.getElementById('tab-calibrate').addEventListener('click', () => { uiState.tab = 'calibrate'; render(); });

  shadow.querySelectorAll('.step-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      uiState.step = Number(btn.getAttribute('data-step'));
      render();
    });
  });
})();
