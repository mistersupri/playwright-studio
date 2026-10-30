export interface ExtensionFile {
  name: string;
  language: string;
  code: string;
}

export const EXTENSION_FILES: ExtensionFile[] = [
  {
    name: "manifest.json",
    language: "json",
    code: `{
  "manifest_version": 3,
  "name": "ScriptBench: Playwright Recorder",
  "version": "1.1.0",
  "description": "Records clicks, key inputs, screenshots, PDFs, waits, and pauses across any page, exporting clean Playwright scripts.",
  "permissions": [
    "storage",
    "activeTab"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": "icon.svg"
  },
  "icons": {
    "16": "icon.svg",
    "48": "icon.svg",
    "128": "icon.svg"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ]
}
`
  },
  {
    name: "background.js",
    language: "javascript",
    code: `// background.js - Manages the recording state and recorded steps
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  chrome.storage.local.get(['isRecording', 'steps'], (result) => {
    let isRecording = result.isRecording || false;
    let steps = result.steps || [];

    if (message.type === 'GET_STATE') {
      sendResponse({ isRecording, steps });
    } else if (message.type === 'START_RECORDING') {
      isRecording = true;
      chrome.storage.local.set({ isRecording, steps }, () => {
        sendResponse({ status: 'success', state: { isRecording, steps } });
      });
    } else if (message.type === 'STOP_RECORDING') {
      isRecording = false;
      chrome.storage.local.set({ isRecording, steps }, () => {
        sendResponse({ status: 'success', state: { isRecording, steps } });
      });
    } else if (message.type === 'CLEAR_STEPS') {
      steps = [];
      chrome.storage.local.set({ isRecording, steps }, () => {
        sendResponse({ status: 'success', state: { isRecording, steps } });
      });
    } else if (message.type === 'REORDER_STEPS') {
      steps = message.steps;
      chrome.storage.local.set({ isRecording, steps }, () => {
        sendResponse({ status: 'success', state: { isRecording, steps } });
      });
    } else if (message.type === 'REMOVE_STEP') {
      steps = steps.filter(s => s.id !== message.stepId);
      chrome.storage.local.set({ isRecording, steps }, () => {
        sendResponse({ status: 'success', state: { isRecording, steps } });
      });
    } else if (message.type === 'UPDATE_STEP') {
      steps = steps.map(s => s.id === message.stepId ? { ...s, ...message.updatedFields } : s);
      chrome.storage.local.set({ isRecording, steps }, () => {
        sendResponse({ status: 'success', state: { isRecording, steps } });
      });
    } else if (message.type === 'ADD_STEP') {
      if (isRecording) {
        const lastStep = steps[steps.length - 1];
        if (message.step.action === 'navigate' && lastStep && lastStep.action === 'navigate' && lastStep.url === message.step.url) {
          sendResponse({ status: 'ignored', state: { isRecording, steps } });
          return;
        }

        const step = {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: Date.now(),
          ...message.step
        };
        steps.push(step);
        chrome.storage.local.set({ isRecording, steps }, () => {
          chrome.runtime.sendMessage({ type: 'STATE_CHANGED', state: { isRecording, steps } }).catch(() => {});
          sendResponse({ status: 'success', state: { isRecording, steps } });
        });
      } else {
        sendResponse({ status: 'ignored', state: { isRecording, steps } });
      }
    }
  });
  return true; // Keep message channel open
});
`
  },
  {
    name: "content.js",
    language: "javascript",
    code: `// content.js - DOM interaction listener

function safeSendMessage(message, callback) {
  try {
    if (chrome.runtime && chrome.runtime.id) {
      chrome.runtime.sendMessage(message, (response) => {
        // Suppress lastError to prevent console noise
        if (chrome.runtime.lastError) {
          // Ignored
        }
        if (callback && typeof callback === 'function') {
          callback(response);
        }
      });
    }
  } catch (err) {
    // Ignored (e.g. extension context invalidated after update/reload)
  }
}

// Retrieve recording state on startup
safeSendMessage({ type: 'GET_STATE' }, (response) => {
  if (response && response.isRecording) {
    // Log initial navigation load if state is recording
    logNavigation();
  }
});

function logNavigation() {
  safeSendMessage({
    type: 'ADD_STEP',
    step: {
      action: 'navigate',
      url: window.location.href,
      selector: ''
    }
  });
}

// Compute custom selectors
function computeSelector(element) {
  if (!element) return '';

  // 1. Data test identifiers
  if (element.hasAttribute('data-testid')) {
    return \`[data-testid="\${element.getAttribute('data-testid')}"]\`;
  }
  if (element.hasAttribute('data-qa')) {
    return \`[data-qa="\${element.getAttribute('data-qa')}"]\`;
  }

  // 2. ID Selector
  if (element.id && !/\\d/.test(element.id)) { // Ignore dynamic numeric ids
    return \`#\${element.id}\`;
  }

  // 3. Name or type attributes
  if (element.getAttribute('name')) {
    return \`\${element.tagName.toLowerCase()}[name="\${element.getAttribute('name')}"]\`;
  }
  if (element.getAttribute('placeholder')) {
    return \`\${element.tagName.toLowerCase()}[placeholder="\${element.getAttribute('placeholder')}"]\`;
  }

  // 4. Input types or text
  if (element.tagName === 'INPUT' && element.getAttribute('type')) {
    return \`input[type="\${element.getAttribute('type')}"]\`;
  }

  // 5. Unique Class combined with element tag
  if (element.className && typeof element.className === 'string') {
    const classes = element.className.trim().split(/\\s+/).filter(c => c && !c.includes(':') && !/\\d/.test(c));
    if (classes.length > 0) {
      return \`\${element.tagName.toLowerCase()}.\${classes[0]}\`;
    }
  }

  // 6. Text Matching as Fallback
  if (element.innerText && element.innerText.trim().length > 0 && element.innerText.trim().length < 30) {
    const text = element.innerText.trim().replace(/"/g, '\\\\"');
    return \`\${element.tagName.toLowerCase()}:has-text("\${text}")\`;
  }

  // 7. Standard CSS Path
  return getCSSPath(element);
}

function getPossibleSelectors(element) {
  if (!element) return [];
  const list = new Set();
  const tag = element.tagName.toLowerCase();

  // 1. data-testid
  if (element.hasAttribute('data-testid')) {
    list.add(\`[data-testid="\${element.getAttribute('data-testid')}"]\`);
  }
  // 2. data-qa
  if (element.hasAttribute('data-qa')) {
    list.add(\`[data-qa="\${element.getAttribute('data-qa')}"]\`);
  }

  // 3. ID-based (very specific)
  if (element.id && !/\\d/.test(element.id)) {
    list.add(\`#\${element.id}\`);
    list.add(\`\${tag}#\${element.id}\`);
    list.add(\`\${tag}[id="\${element.id}"]\`);
  }

  // 4. Attributes (name, placeholder, type, role)
  if (element.getAttribute('name')) {
    list.add(\`\${tag}[name="\${element.getAttribute('name')}"]\`);
  }
  if (element.getAttribute('placeholder')) {
    list.add(\`\${tag}[placeholder="\${element.getAttribute('placeholder')}"]\`);
  }
  if (element.getAttribute('type')) {
    list.add(\`\${tag}[type="\${element.getAttribute('type')}"]\`);
  }
  if (element.getAttribute('role')) {
    list.add(\`\${tag}[role="\${element.getAttribute('role')}"]\`);
  }

  // 5. Unique class with tag
  if (element.className && typeof element.className === 'string') {
    const classes = element.className.trim().split(/\\s+/).filter(c => c && !c.includes(':') && !/\\d/.test(c));
    classes.forEach(c => {
      list.add(\`\${tag}.\${c}\`);
    });
  }

  // 6. Text-based playwright selector :has-text
  if (element.innerText && element.innerText.trim().length > 0 && element.innerText.trim().length < 50) {
    const cleanText = element.innerText.trim().replace(/"/g, '\\\\"');
    list.add(\`\${tag}:has-text("\${cleanText}")\`);
    if (tag !== 'button' && (tag === 'a' || element.getAttribute('role') === 'button')) {
      list.add(\`button:has-text("\${cleanText}")\`);
    }
  }

  // 7. XPath expressions
  if (element.id && !/\\d/.test(element.id)) {
    list.add(\`//\${tag}[@id='\${element.id}']\`);
  }
  if (element.getAttribute('name')) {
    list.add(\`//\${tag}[@name='\${element.getAttribute('name')}']\`);
  }
  if (element.getAttribute('placeholder')) {
    list.add(\`//\${tag}[@placeholder='\${element.getAttribute('placeholder')}']\`);
  }
  if (element.innerText && element.innerText.trim().length > 0 && element.innerText.trim().length < 50) {
    const cleanText = element.innerText.trim().replace(/'/g, "\\\\'");
    list.add(\`//\${tag}[text()='\${cleanText}']\`);
    list.add(\`//\${tag}[contains(text(),'\${cleanText}')]\`);
  }

  // 8. Standard CSS Path
  const cssPath = getCSSPath(element);
  if (cssPath) {
    list.add(cssPath);
  }

  // Fallback: tag name
  if (list.size === 0 && tag) {
    list.add(tag);
  }

  return Array.from(list);
}

function getCSSPath(el) {
  if (!(el instanceof Element)) return '';
  const path = [];
  while (el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.nodeName.toLowerCase();
    if (el.id && !/\\d/.test(el.id)) {
      selector += '#' + el.id;
      path.unshift(selector);
      break;
    } else {
      let sib = el, nth = 1;
      while (sib = sib.previousElementSibling) {
        if (sib.nodeName.toLowerCase() === el.nodeName.toLowerCase()) nth++;
      }
      if (nth !== 1) selector += \`:nth-of-type(\${nth})\`;
    }
    path.unshift(selector);
    el = el.parentNode;
  }
  return path.join(' > ');
}

// Global click listener
document.addEventListener('click', (event) => {
  try {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    
    // Find closest interactive element
    const interactiveElement = target.closest('button, a, input, [role="button"], select, textarea');
    const actualElement = interactiveElement || target;

    if (!actualElement || !actualElement.tagName) return;

    // Don't capture inputs as clicks, they have a dedicated type handler
    if (actualElement.tagName === 'INPUT' || actualElement.tagName === 'TEXTAREA') {
      const inputType = actualElement.getAttribute('type');
      if (inputType !== 'submit' && inputType !== 'button' && inputType !== 'checkbox' && inputType !== 'radio') {
        return; // Handled by typing listener
      }
    }

    const possibleSelectors = getPossibleSelectors(actualElement);
    const selector = possibleSelectors[0] || computeSelector(actualElement);
    const tagName = actualElement.tagName.toLowerCase();
    const role = actualElement.getAttribute('role') || (tagName === 'button' ? 'button' : tagName === 'a' ? 'link' : undefined);
    const text = actualElement.innerText?.trim().slice(0, 50) || actualElement.value || '';

    safeSendMessage({
      type: 'ADD_STEP',
      step: {
        action: 'click',
        selector: selector,
        possibleSelectors: possibleSelectors,
        tagName: tagName,
        role: role,
        text: text
      }
    });
  } catch (err) {
    console.warn('[Playwright Recorder] Click listener error:', err);
  }
}, true);

// Global typing listener (captures value on blur)
document.addEventListener('blur', (event) => {
  try {
    const target = event.target;
    if (target && target.tagName && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      // Only capture if user typed something
      if (target.value && target.value.trim().length > 0) {
        const possibleSelectors = getPossibleSelectors(target);
        const selector = possibleSelectors[0] || computeSelector(target);
        const placeholder = target.getAttribute('placeholder') || '';
        
        safeSendMessage({
          type: 'ADD_STEP',
          step: {
            action: 'type',
            selector: selector,
            possibleSelectors: possibleSelectors,
            text: target.value,
            tagName: target.tagName.toLowerCase(),
            placeholder: placeholder
          }
        });
      }
    }
  } catch (err) {
    console.warn('[Playwright Recorder] Blur listener error:', err);
  }
}, true);

// Selector picking listener and functions
let isPickingSelector = false;
let hoveredElement = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_PICKING_SELECTOR') {
    startSelectorPicker();
    sendResponse({ status: 'picker_started' });
  } else if (message.type === 'STOP_PICKING_SELECTOR') {
    stopSelectorPicker();
    sendResponse({ status: 'picker_stopped' });
  }
});

function startSelectorPicker() {
  if (isPickingSelector) return;
  isPickingSelector = true;
  
  let pickerBanner = document.getElementById('scriptbench-picker-banner');
  if (!pickerBanner) {
    pickerBanner = document.createElement('div');
    pickerBanner.id = 'scriptbench-picker-banner';
    pickerBanner.style.cssText = 'position: fixed; top: 16px; left: 50%; transform: translateX(-50%); background: #1e293b; color: #f8fafc; padding: 10px 16px; border-radius: 8px; font-family: system-ui, -apple-system, sans-serif; font-size: 12px; font-weight: 600; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); z-index: 999999; display: flex; align-items: center; gap: 12px; border: 1px solid #38bdf8;';
    pickerBanner.innerHTML = \`
      <span style="display: flex; width: 8px; height: 8px; background: #38bdf8; border-radius: 50%; animation: scriptbench-pulse 1.5s infinite;"></span>
      <span>Click any element to capture its CSS Selector</span>
      <button id="scriptbench-cancel-pick" style="background: rgba(255,255,255,0.1); border: none; color: #cbd5e1; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 700; transition: all 0.2s;">Cancel</button>
    \`;
    document.body.appendChild(pickerBanner);
    
    if (!document.getElementById('scriptbench-picker-styles')) {
      const style = document.createElement('style');
      style.id = 'scriptbench-picker-styles';
      style.innerHTML = \`
        @keyframes scriptbench-pulse {
          0% { opacity: 0.5; }
          50% { opacity: 1; }
          100% { opacity: 0.5; }
        }
        .scriptbench-hovered {
          outline: 2px dashed #0ea5e9 !important;
          outline-offset: 2px !important;
          cursor: crosshair !important;
        }
      \`;
      document.head.appendChild(style);
    }
    
    document.getElementById('scriptbench-cancel-pick').addEventListener('click', (e) => {
      e.stopPropagation();
      stopSelectorPicker();
    });
  }
  
  document.addEventListener('mouseover', handlePickerMouseOver, true);
  document.addEventListener('mouseout', handlePickerMouseOut, true);
  document.addEventListener('click', handlePickerClick, true);
}

function stopSelectorPicker() {
  isPickingSelector = false;
  const banner = document.getElementById('scriptbench-picker-banner');
  if (banner) banner.remove();
  
  if (hoveredElement) {
    hoveredElement.classList.remove('scriptbench-hovered');
    hoveredElement = null;
  }
  
  document.removeEventListener('mouseover', handlePickerMouseOver, true);
  document.removeEventListener('mouseout', handlePickerMouseOut, true);
  document.removeEventListener('click', handlePickerClick, true);
}

function handlePickerMouseOver(e) {
  if (!isPickingSelector) return;
  e.stopPropagation();
  e.preventDefault();
  
  if (hoveredElement && hoveredElement !== e.target) {
    hoveredElement.classList.remove('scriptbench-hovered');
  }
  
  hoveredElement = e.target;
  if (hoveredElement && typeof hoveredElement.classList?.add === 'function') {
    hoveredElement.classList.add('scriptbench-hovered');
  }
}

function handlePickerMouseOut(e) {
  if (!isPickingSelector) return;
  if (e.target && typeof e.target.classList?.remove === 'function') {
    e.target.classList.remove('scriptbench-hovered');
  }
}

function handlePickerClick(e) {
  if (!isPickingSelector) return;
  e.stopPropagation();
  e.preventDefault();
  
  const clickedEl = e.target;
  if (clickedEl) {
    const possibleSelectors = getPossibleSelectors(clickedEl);
    const selector = possibleSelectors[0] || computeSelector(clickedEl);
    
    chrome.storage.local.set({ pickedSelector: selector }, () => {
      const banner = document.getElementById('scriptbench-picker-banner');
      if (banner) {
        banner.style.border = '1px solid #10b981';
        banner.innerHTML = \`
          <span style="display: flex; width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span>
          <span>Captured: <code style="background: rgba(0,0,0,0.2); padding: 2px 4px; border-radius: 4px;">\\\${selector.length > 25 ? selector.substring(0, 22) + '...' : selector}</code>!</span>
        \`;
        setTimeout(() => {
          stopSelectorPicker();
        }, 1500);
      } else {
        stopSelectorPicker();
      }
    });
  }
}
`
  },
  {
    name: "popup.html",
    language: "html",
    code: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Playwright Automation Recorder</title>
  <style>
    :root {
      --bg-main: #0C0C0E;
      --bg-card: #121214;
      --bg-input: #050505;
      --border-color: rgba(255, 255, 255, 0.1);
      --text-primary: #e2e8f0;
      --text-muted: #94a3b8;
      --blue-accent: #2563eb;
      --blue-hover: #3b82f6;
      --emerald-accent: #059669;
      --emerald-hover: #10b981;
      --red-accent: #dc2626;
      --red-hover: #ef4444;
    }
    body {
      width: 420px;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0;
      padding: 0;
      background-color: var(--bg-main);
      color: var(--text-primary);
      box-sizing: border-box;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    /* Scrollbars */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: rgba(0,0,0,0.1);
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.15);
      border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255,255,255,0.25);
    }
    /* Header layout */
    .app-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: var(--bg-card);
      border-bottom: 1px solid var(--border-color);
    }
    .app-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .app-logo-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--blue-accent);
      box-shadow: 0 0 8px var(--blue-accent);
    }
    .status-badge {
      font-size: 9px;
      font-weight: 700;
      padding: 2.5px 8px;
      border-radius: 9999px;
      background: rgba(255,255,255,0.03);
      border: 1px solid var(--border-color);
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 5px;
      text-transform: uppercase;
    }
    .status-badge.recording {
      background: rgba(220, 38, 38, 0.1);
      border-color: rgba(220, 38, 38, 0.25);
      color: #f87171;
    }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--text-muted);
    }
    .recording .status-dot {
      background: #ef4444;
      animation: pulse 1.5s infinite;
      box-shadow: 0 0 6px #ef4444;
    }
    @keyframes pulse {
      0% { opacity: 0.5; }
      50% { opacity: 1; }
      100% { opacity: 0.5; }
    }
    /* Tabs Navigation */
    .nav-tabs {
      display: flex;
      background: var(--bg-card);
      border-bottom: 1px solid var(--border-color);
      padding: 0 16px;
    }
    .tab-btn {
      flex: 1;
      padding: 11px 0;
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }
    .tab-btn:hover {
      color: #fff;
    }
    .tab-btn.active {
      color: #fff;
      border-bottom-color: var(--blue-accent);
    }
    /* Tab Panes */
    .tab-content {
      padding: 16px;
      max-height: 480px;
      overflow-y: auto;
    }
    .tab-pane {
      display: none;
    }
    .tab-pane.active {
      display: block;
    }
    /* Primary buttons & panels */
    .controls-panel {
      display: flex;
      gap: 10px;
      margin-bottom: 16px;
    }
    .btn {
      padding: 8px 14px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      border: 1px solid transparent;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .btn-block {
      width: 100%;
    }
    .btn-primary {
      background: var(--blue-accent);
      color: #fff;
    }
    .btn-primary:hover {
      background: var(--blue-hover);
    }
    .btn-danger {
      background: var(--red-accent);
      color: #fff;
    }
    .btn-danger:hover {
      background: var(--red-hover);
    }
    .btn-success {
      background: var(--emerald-accent);
      color: #fff;
    }
    .btn-success:hover {
      background: var(--emerald-hover);
    }
    .btn-outline {
      background: rgba(255,255,255,0.03);
      border-color: var(--border-color);
      color: var(--text-primary);
    }
    .btn-outline:hover {
      background: rgba(255,255,255,0.08);
      border-color: rgba(255,255,255,0.2);
    }
    .btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    /* Form fields */
    .form-group {
      margin-bottom: 12px;
    }
    .form-label {
      display: block;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 4px;
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    .form-input, .form-select {
      width: 100%;
      padding: 7px 10px;
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-primary);
      font-size: 11px;
      outline: none;
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    .form-input:focus, .form-select:focus {
      border-color: var(--blue-accent);
    }
    /* Manual actions accordion box */
    .card-accordion {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      margin-bottom: 16px;
      overflow: hidden;
    }
    .card-header {
      padding: 10px 14px;
      background: rgba(255,255,255,0.02);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
    }
    .card-header:hover {
      background: rgba(255,255,255,0.04);
    }
    .card-header-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #fff;
    }
    .card-arrow {
      font-size: 10px;
      color: var(--text-muted);
      transition: transform 0.2s;
    }
    .card-arrow.rotated {
      transform: rotate(180deg);
    }
    .card-body {
      padding: 14px;
      display: none;
    }
    .card-body.show {
      display: block;
    }
    /* Timeline design */
    .timeline {
      position: relative;
      border-left: 1px solid var(--border-color);
      margin-left: 12px;
      padding-left: 20px;
      padding-top: 4px;
      padding-bottom: 4px;
    }
    .timeline-empty {
      text-align: center;
      padding: 28px;
      border: 1px dashed var(--border-color);
      border-radius: 6px;
      background: var(--bg-card);
      color: var(--text-muted);
      font-size: 11px;
    }
    .timeline-item {
      position: relative;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 14px;
      transition: border-color 0.2s;
    }
    .timeline-item:last-child {
      margin-bottom: 0;
    }
    .timeline-item:hover {
      border-color: rgba(255, 255, 255, 0.15);
    }
    .timeline-node {
      position: absolute;
      left: -27px;
      top: 14px;
      width: 13px;
      height: 13px;
      border-radius: 50%;
      background: var(--bg-main);
      border: 2.5px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
    }
    .timeline-node-inner {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--text-muted);
    }
    /* Colored Badges */
    .badge-nav { background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); color: #60a5fa; }
    .node-nav { border-color: #3b82f6; }
    .node-nav .timeline-node-inner { background: #3b82f6; }
    
    .badge-click { background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); color: #34d399; }
    .node-click { border-color: #10b981; }
    .node-click .timeline-node-inner { background: #10b981; }
    
    .badge-type { background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.2); color: #fbbf24; }
    .node-type { border-color: #f59e0b; }
    .node-type .timeline-node-inner { background: #f59e0b; }
    
    .badge-screenshot { background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.2); color: #a78bfa; }
    .node-screenshot { border-color: #8b5cf6; }
    .node-screenshot .timeline-node-inner { background: #8b5cf6; }
    
    .badge-pdf { background: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.2); color: #fb7185; }
    .node-pdf { border-color: #f43f5e; }
    .node-pdf .timeline-node-inner { background: #f43f5e; }
    
    .badge-wait-sel { background: rgba(20, 184, 166, 0.1); border: 1px solid rgba(20, 184, 166, 0.2); color: #2dd4bf; }
    .node-wait-sel { border-color: #14b8a6; }
    .node-wait-sel .timeline-node-inner { background: #14b8a6; }
    
    .badge-wait-time { background: rgba(6, 182, 212, 0.1); border: 1px solid rgba(6, 182, 212, 0.2); color: #22d3ee; }
    .node-wait-time { border-color: #06b6d4; }
    .node-wait-time .timeline-node-inner { background: #06b6d4; }
    
    .badge-pause { background: rgba(100, 116, 139, 0.1); border: 1px solid rgba(100, 116, 139, 0.2); color: #94a3b8; }
    .node-pause { border-color: #64748b; }
    .node-pause .timeline-node-inner { background: #64748b; }

    /* Timeline items components */
    .step-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .step-index-badge {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .step-num {
      font-size: 9px;
      font-weight: 700;
      color: var(--text-muted);
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    .step-badge {
      font-size: 8px;
      font-weight: 800;
      text-transform: uppercase;
      padding: 1px 5px;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    .step-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .step-action-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 3px;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    .step-action-btn:hover {
      color: #fff;
      background: rgba(255,255,255,0.06);
    }
    .step-action-btn:disabled {
      opacity: 0.15;
      cursor: not-allowed;
    }
    .step-desc {
      font-size: 11px;
      line-height: 1.4;
      color: #cbd5e1;
      word-break: break-all;
    }
    .step-code-preview {
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 9px;
      color: var(--text-muted);
      background: var(--bg-input);
      border: 1px solid rgba(255,255,255,0.03);
      padding: 4px 8px;
      border-radius: 4px;
      margin-top: 6px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* Inline Editing Form */
    .edit-form {
      margin-top: 8px;
      border-top: 1px solid var(--border-color);
      padding-top: 8px;
      display: none;
    }
    .edit-form.active {
      display: block;
    }
    .edit-actions {
      display: flex;
      justify-content: flex-end;
      gap: 6px;
      margin-top: 8px;
    }
    /* Alternate Selector badges in extension popup */
    .alt-selectors-container {
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px dashed rgba(255, 255, 255, 0.05);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .alt-selectors-label {
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    .alt-selectors-list {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .alt-sel-badge {
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 8.5px;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--bg-input);
      color: var(--text-muted);
      border: 1px solid var(--border-color);
      cursor: pointer;
      transition: all 0.2s;
    }
    .alt-sel-badge:hover {
      background: rgba(255, 255, 255, 0.05);
      color: #fff;
      border-color: rgba(255, 255, 255, 0.2);
    }
    .alt-sel-badge.active {
      background: rgba(37, 99, 235, 0.15);
      color: #60a5fa;
      border-color: rgba(37, 99, 235, 0.4);
      font-weight: 600;
    }
    /* Code block container */
    .config-row {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      padding: 10px 12px;
      border-radius: 6px;
    }
    .config-checkbox-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      font-weight: 600;
      color: var(--text-primary);
      cursor: pointer;
    }
    .code-container {
      position: relative;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-input);
      height: 280px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      margin-bottom: 16px;
    }
    .code-header {
      padding: 6px 12px;
      background: var(--bg-card);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .code-filename {
      font-size: 9px;
      font-weight: 700;
      color: var(--text-muted);
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    .code-body {
      flex: 1;
      padding: 12px;
      margin: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 10px;
      line-height: 1.5;
      color: #9cdcfe;
      overflow: auto;
      white-space: pre;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="app-header">
    <div class="app-title">
      <span class="app-logo-dot"></span>
      Playwright Recorder
    </div>
    <div id="statusBadge" class="status-badge">
      <span class="status-dot"></span>
      <span id="statusText">Idle</span>
    </div>
  </div>

  <!-- Tabs Navigation -->
  <div class="nav-tabs">
    <button id="tabBtnTimeline" class="tab-btn active">Timeline</button>
    <button id="tabBtnCode" class="tab-btn">Code Export</button>
  </div>

  <!-- Tab Contents -->
  <div class="tab-content">
    
    <!-- Timeline Pane -->
    <div id="paneTimeline" class="tab-pane active">
      <div class="controls-panel">
        <button id="toggleBtn" class="btn btn-primary btn-block">Record</button>
        <button id="clearBtn" class="btn btn-outline" title="Clear Timeline">Clear</button>
      </div>

      <!-- Add Manual Step Form Accordion -->
      <div class="card-accordion">
        <div id="accordionHeader" class="card-header">
          <span class="card-header-title">Add Manual Action</span>
          <span id="accordionArrow" class="card-arrow">▼</span>
        </div>
        <div id="accordionBody" class="card-body">
          <form id="manualForm">
            <div class="form-group">
              <label class="form-label">Action Type</label>
              <select id="manualAction" class="form-select">
                <option value="click">Click Element</option>
                <option value="type">Type text</option>
                <option value="navigate">Navigate URL</option>
                <option value="screenshot">Screenshot</option>
                <option value="pdf">Generate PDF</option>
                <option value="waitForSelector">Wait for selector</option>
                <option value="waitForTimeout">Wait for timeout</option>
                <option value="pause">Pause debugger</option>
              </select>
            </div>

            <!-- Dynamic URL Field -->
            <div id="grpUrl" class="form-group" style="display:none;">
              <label class="form-label">URL</label>
              <input type="text" id="manualUrl" class="form-input" placeholder="https://example.com">
            </div>

            <!-- Dynamic Selector Field -->
            <div id="grpSelector" class="form-group">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <label class="form-label" style="margin-bottom: 0;">CSS Selector</label>
                <button type="button" id="pickSelectorBtn" style="font-size: 8.5px; font-weight: 700; background: rgba(37, 99, 235, 0.15); border: 1px solid rgba(37, 99, 235, 0.3); color: #60a5fa; padding: 2.5px 6px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 3px; font-family: ui-monospace, SFMono-Regular, monospace; transition: all 0.2s;">
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block;"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/></svg>
                  Click selector to fill
                </button>
              </div>
              <input type="text" id="manualSelector" class="form-input" placeholder="e.g. #submit-btn or button">
            </div>

            <!-- Dynamic Text/Parameter Field -->
            <div id="grpText" class="form-group">
              <label class="form-label" id="lblText">Element Label (Optional)</label>
              <input type="text" id="manualText" class="form-input" placeholder="e.g. Submit">
            </div>

            <!-- Dynamic Placeholder Field -->
            <div id="grpPlaceholder" class="form-group" style="display:none;">
              <label class="form-label">Input Placeholder (Optional)</label>
              <input type="text" id="manualPlaceholder" class="form-input" placeholder="e.g. Enter Email">
            </div>

            <button type="submit" class="btn btn-success btn-block mt-2">Insert Step</button>
          </form>
        </div>
      </div>

      <!-- Step Timeline -->
      <div class="timeline" id="timelineContainer">
        <div class="timeline-empty">No actions recorded yet. Start recording to capture DOM interactions.</div>
      </div>
    </div>

    <!-- Code Export Pane -->
    <div id="paneCode" class="tab-pane">
      <div class="form-group">
        <label class="form-label">Target Language</label>
        <select id="exportLang" class="form-select">
          <option value="typescript">TypeScript (Playwright Test)</option>
          <option value="javascript">JavaScript (Playwright Test)</option>
          <option value="python">Python (Sync API)</option>
        </select>
      </div>

      <div class="config-row">
        <label class="config-checkbox-label">
          <input type="checkbox" id="cfgBoilerplate" checked>
          Boilerplate
        </label>
        <label class="config-checkbox-label">
          <input type="checkbox" id="cfgComments" checked>
          Comments
        </label>
      </div>

      <div class="code-container">
        <div class="code-header">
          <span class="code-filename" id="codeFilename">playwright.spec.ts</span>
        </div>
        <pre class="code-body" id="codeBody">// Generated script will render here</pre>
      </div>

      <div class="controls-panel">
        <button id="copyBtn" class="btn btn-primary btn-block">Copy to Clipboard</button>
        <button id="downloadBtn" class="btn btn-outline" title="Download Script File">Download</button>
      </div>
    </div>

  </div>

  <script src="popup.js"></script>
</body>
</html>
`
  },
  {
    name: "popup.js",
    language: "javascript",
    code: `// popup.js - Controls the extension popup UI
const toggleBtn = document.getElementById('toggleBtn');
const clearBtn = document.getElementById('clearBtn');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const timelineContainer = document.getElementById('timelineContainer');

// Tabs
const tabBtnTimeline = document.getElementById('tabBtnTimeline');
const tabBtnCode = document.getElementById('tabBtnCode');
const paneTimeline = document.getElementById('paneTimeline');
const paneCode = document.getElementById('paneCode');

// Accordion
const accordionHeader = document.getElementById('accordionHeader');
const accordionBody = document.getElementById('accordionBody');
const accordionArrow = document.getElementById('accordionArrow');

// Form
const manualForm = document.getElementById('manualForm');
const manualAction = document.getElementById('manualAction');
const grpUrl = document.getElementById('grpUrl');
const manualUrl = document.getElementById('manualUrl');
const grpSelector = document.getElementById('grpSelector');
const manualSelector = document.getElementById('manualSelector');
const grpText = document.getElementById('grpText');
const lblText = document.getElementById('lblText');
const manualText = document.getElementById('manualText');
const grpPlaceholder = document.getElementById('grpPlaceholder');
const manualPlaceholder = document.getElementById('manualPlaceholder');
const pickSelectorBtn = document.getElementById('pickSelectorBtn');

// Export Configs
const exportLang = document.getElementById('exportLang');
const cfgBoilerplate = document.getElementById('cfgBoilerplate');
const cfgComments = document.getElementById('cfgComments');
const codeFilename = document.getElementById('codeFilename');
const codeBody = document.getElementById('codeBody');

let state = {
  isRecording: false,
  steps: []
};
let editingStepId = null;

// Tab switcher
tabBtnTimeline.addEventListener('click', () => {
  tabBtnTimeline.classList.add('active');
  tabBtnCode.classList.remove('active');
  paneTimeline.classList.add('active');
  paneCode.classList.remove('active');
});

tabBtnCode.addEventListener('click', () => {
  tabBtnTimeline.classList.remove('active');
  tabBtnCode.classList.add('active');
  paneTimeline.classList.remove('active');
  paneCode.classList.add('active');
  updateCodeOutput();
});

// Accordion toggle
accordionHeader.addEventListener('click', () => {
  const isExpanded = accordionBody.classList.contains('show');
  if (isExpanded) {
    accordionBody.classList.remove('show');
    accordionArrow.classList.remove('rotated');
  } else {
    accordionBody.classList.add('show');
    accordionArrow.classList.add('rotated');
  }
});

// Form Field Visibility Manager
manualAction.addEventListener('change', () => {
  const action = manualAction.value;
  
  // Defaults
  grpUrl.style.display = 'none';
  grpSelector.style.display = 'none';
  grpText.style.display = 'none';
  grpPlaceholder.style.display = 'none';
  manualSelector.required = false;
  manualUrl.required = false;
  manualText.required = false;

  switch (action) {
    case 'navigate':
      grpUrl.style.display = 'block';
      manualUrl.placeholder = 'https://example.com';
      manualUrl.required = true;
      break;

    case 'click':
      grpSelector.style.display = 'block';
      grpText.style.display = 'block';
      lblText.innerText = 'Element Label / Text (Optional)';
      manualSelector.placeholder = 'e.g. #submit-btn or button';
      manualSelector.required = true;
      manualText.placeholder = 'e.g. Sign In';
      break;

    case 'type':
      grpSelector.style.display = 'block';
      grpText.style.display = 'block';
      grpPlaceholder.style.display = 'block';
      lblText.innerText = 'Keyboard Input Value';
      manualSelector.placeholder = 'e.g. input[type="email"]';
      manualSelector.required = true;
      manualText.placeholder = 'Enter text to type';
      manualText.required = true;
      manualPlaceholder.placeholder = 'e.g. Enter Email';
      break;

    case 'screenshot':
      grpSelector.style.display = 'block';
      grpText.style.display = 'block';
      lblText.innerText = 'File Name / Path (Optional)';
      manualSelector.placeholder = 'e.g. #invoice-card (empty for full page)';
      manualText.placeholder = 'e.g. invoice-screenshot.png';
      break;

    case 'pdf':
      grpText.style.display = 'block';
      lblText.innerText = 'PDF File Name (Optional)';
      manualText.placeholder = 'e.g. receipt.pdf';
      break;

    case 'waitForSelector':
      grpSelector.style.display = 'block';
      manualSelector.placeholder = 'e.g. #success-checkmark';
      manualSelector.required = true;
      break;

    case 'waitForTimeout':
      grpText.style.display = 'block';
      lblText.innerText = 'Timeout in Milliseconds';
      manualText.placeholder = 'e.g. 2000 (default 1000)';
      manualText.required = true;
      break;

    case 'pause':
      // Requires no fields
      break;
  }
});

// Submit manual step
manualForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const action = manualAction.value;
  
  const newStep = {
    action: action,
    url: action === 'navigate' ? manualUrl.value : undefined,
    selector: (action === 'click' || action === 'type' || action === 'waitForSelector' || (action === 'screenshot' && manualSelector.value)) ? manualSelector.value : '',
    text: (action === 'type' || action === 'waitForTimeout' || manualText.value) ? manualText.value : undefined,
    placeholder: action === 'type' ? manualPlaceholder.value : undefined
  };

  chrome.runtime.sendMessage({
    type: 'ADD_STEP',
    step: newStep
  }, (response) => {
    state = response.state;
    updateUI();
    // Reset manual form fields
    manualForm.reset();
    manualAction.dispatchEvent(new Event('change'));
    // Close accordion
    accordionBody.classList.remove('show');
    accordionArrow.classList.remove('rotated');
  });
});

// Fetch current state on startup
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
  if (response) {
    state = response;
    updateUI();
  }

  // Check if a selector was picked from the page
  chrome.storage.local.get(['pickedSelector'], (result) => {
    if (result && result.pickedSelector) {
      const selector = result.pickedSelector;
      manualSelector.value = selector;

      // Auto expand accordion
      accordionBody.classList.add('show');
      accordionArrow.classList.add('rotated');

      // Auto set action depending on target element tag type
      const isInput = selector.includes('input') || selector.includes('textarea') || selector.includes('select');
      if (isInput) {
        manualAction.value = 'type';
      } else {
        manualAction.value = 'click';
      }
      manualAction.dispatchEvent(new Event('change'));

      // Remove so it doesn't populate again on next open
      chrome.storage.local.remove(['pickedSelector']);
    }
  });
});

// Synchronize state dynamically when updated from background or pages
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATE_CHANGED') {
    state = message.state;
    updateUI();
  }
});

toggleBtn.addEventListener('click', () => {
  if (state.isRecording) {
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }, (response) => {
      state = response.state;
      updateUI();
    });
  } else {
    chrome.runtime.sendMessage({ type: 'START_RECORDING' }, (response) => {
      state = response.state;
      updateUI();
      // Instantly record current tab URL
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url && !tabs[0].url.startsWith('chrome://')) {
          chrome.runtime.sendMessage({
            type: 'ADD_STEP',
            step: {
              action: 'navigate',
              url: tabs[0].url,
              selector: ''
            }
          }, (res) => {
            state = res.state;
            updateUI();
          });
        }
      });
    });
  }
});

clearBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'CLEAR_STEPS' }, (response) => {
    state = response.state;
    updateUI();
  });
});

if (pickSelectorBtn) {
  pickSelectorBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'START_PICKING_SELECTOR' }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn("Could not communicate with tab:", chrome.runtime.lastError);
          } else {
            // Close popup so the user can click on the webpage
            window.close();
          }
        });
      }
    });
  });
}

// Code Exporter Listeners
exportLang.addEventListener('change', updateCodeOutput);
cfgBoilerplate.addEventListener('change', updateCodeOutput);
cfgComments.addEventListener('change', updateCodeOutput);

copyBtn.addEventListener('click', () => {
  const code = codeBody.innerText;
  navigator.clipboard.writeText(code).then(() => {
    const originalText = copyBtn.innerText;
    copyBtn.innerText = 'Copied!';
    setTimeout(() => {
      copyBtn.innerText = originalText;
    }, 1500);
  });
});

downloadBtn.addEventListener('click', () => {
  const code = codeBody.innerText;
  const lang = exportLang.value;
  let filename = 'playwright.spec.ts';
  if (lang === 'javascript') filename = 'playwright.spec.js';
  else if (lang === 'python') filename = 'test_playwright.py';

  const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
});

function updateUI() {
  // Update toggle button
  if (state.isRecording) {
    toggleBtn.innerText = 'Stop';
    toggleBtn.className = 'btn btn-danger btn-block';
    statusBadge.className = 'status-badge recording';
    statusText.innerText = 'Recording';
  } else {
    toggleBtn.innerText = 'Record';
    toggleBtn.className = 'btn btn-primary btn-block';
    statusBadge.className = 'status-badge';
    statusText.innerText = 'Idle';
  }

  // Render list of steps as a Timeline view
  if (state.steps.length === 0) {
    timelineContainer.innerHTML = '<div class="timeline-empty">No actions recorded yet. Start recording to capture DOM interactions.</div>';
    copyBtn.disabled = true;
    downloadBtn.disabled = true;
  } else {
    copyBtn.disabled = false;
    downloadBtn.disabled = false;
    timelineContainer.innerHTML = '';
    
    state.steps.forEach((step, idx) => {
      const el = document.createElement('div');
      el.className = 'timeline-item';
      
      const isEditing = editingStepId === step.id;
      
      // Determine Action Color Theme
      let badgeClass = 'badge-nav';
      let nodeClass = 'node-nav';
      let cleanActionName = step.action;
      if (step.action === 'click') { badgeClass = 'badge-click'; nodeClass = 'node-click'; }
      else if (step.action === 'type') { badgeClass = 'badge-type'; nodeClass = 'node-type'; }
      else if (step.action === 'screenshot') { badgeClass = 'badge-screenshot'; nodeClass = 'node-screenshot'; }
      else if (step.action === 'pdf') { badgeClass = 'badge-pdf'; nodeClass = 'node-pdf'; }
      else if (step.action === 'waitForSelector') { badgeClass = 'badge-wait-sel'; nodeClass = 'node-wait-sel'; cleanActionName = 'waitSelector'; }
      else if (step.action === 'waitForTimeout') { badgeClass = 'badge-wait-time'; nodeClass = 'node-wait-time'; cleanActionName = 'waitTimeout'; }
      else if (step.action === 'pause') { badgeClass = 'badge-pause'; nodeClass = 'node-pause'; }

      // Human-readable action description
      let displayDetails = '';
      if (step.action === 'navigate') {
        displayDetails = \`Navigate to: <strong style="color: #fff">\${step.url}</strong>\`;
      } else if (step.action === 'click') {
        displayDetails = \`Click <strong style="color: #fff">"\${step.text || 'Element'}"</strong> \${step.selector ? \`(Selector: <code>\${step.selector}</code>)\` : ''}\`;
      } else if (step.action === 'type') {
        displayDetails = \`Type <strong style="color: #fff">"\${step.text}"</strong> into <code>\${step.selector}</code>\`;
      } else if (step.action === 'screenshot') {
        displayDetails = \`Screenshot \${step.selector ? \`of element: <code>\${step.selector}</code>\` : 'of full page'}. Save as: <code>\${step.text || 'screenshot.png'}</code>\`;
      } else if (step.action === 'pdf') {
        displayDetails = \`Export PDF formatted as A4. Save as: <code>\${step.text || 'document.pdf'}</code>\`;
      } else if (step.action === 'waitForSelector') {
        displayDetails = \`Wait for element: <code>\${step.selector}</code> to load\`;
      } else if (step.action === 'waitForTimeout') {
        displayDetails = \`Delay execution for <code>\${step.text || '1000'}</code> milliseconds\`;
      } else if (step.action === 'pause') {
        displayDetails = \`Pause execution to debug inside inspector\`;
      }

      const hasSelector = ['click', 'type', 'waitForSelector'].includes(step.action) || (step.action === 'screenshot' && step.selector);
      const possibleSelectors = hasSelector ? getPossibleSelectorsForStep(step) : [];

      // Reorder buttons state
      const isFirst = idx === 0;
      const isLast = idx === state.steps.length - 1;

      el.innerHTML = \`
        <!-- Connection node -->
        <div class="timeline-node \${nodeClass}">
          <div class="timeline-node-inner"></div>
        </div>

        <div class="step-meta">
          <div class="step-index-badge">
            <span class="step-num">#\${idx + 1}</span>
            <span class="step-badge \${badgeClass}">\${cleanActionName}</span>
          </div>

          <div class="step-actions">
            <!-- Reorder up -->
            <button class="step-action-btn move-up-btn" data-index="\${idx}" \${isFirst || isEditing ? 'disabled' : ''} title="Move Step Up">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>
            </button>
            <!-- Reorder down -->
            <button class="step-action-btn move-down-btn" data-index="\${idx}" \${isLast || isEditing ? 'disabled' : ''} title="Move Step Down">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            
            \${isEditing ? \`
              <button class="step-action-btn save-edit-btn" data-id="\${step.id}" title="Save Changes" style="color: #10b981;">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              </button>
              <button class="step-action-btn cancel-edit-btn" title="Cancel Editing" style="color: #f43f5e;">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            \` : \`
              <button class="step-action-btn edit-step-btn" data-id="\${step.id}" title="Edit Parameters" style="color: #a78bfa;">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              </button>
              <button class="step-action-btn delete-step-btn" data-id="\${step.id}" title="Delete Step" style="color: #fb7185;">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            \`}
          </div>
        </div>

        <div class="step-desc">\${displayDetails}</div>

        <!-- Dynamic Edit inline Form -->
        <div class="edit-form \${isEditing ? 'active' : ''}">
          \${step.action === 'navigate' ? \`
            <div class="form-group">
              <label class="form-label">URL</label>
              <input type="text" class="form-input edit-url-input" value="\${step.url || ''}">
            </div>
          \` : ''}

          \${step.action === 'click' || step.action === 'type' || step.action === 'waitForSelector' || (step.action === 'screenshot' && step.selector) ? \`
            <div class="form-group">
              <label class="form-label">CSS Selector</label>
              <input type="text" class="form-input edit-selector-input" value="\${step.selector || ''}">
            </div>
            \${possibleSelectors.length > 1 ? \`
              <div class="alt-selectors-container" style="margin-bottom: 8px;">
                <span class="alt-selectors-label">Alternate Selectors (Click to apply)</span>
                <div class="alt-selectors-list">
                  \${possibleSelectors.map(sel => {
                    const isSelActive = (step.selector === sel);
                    return \`<button type="button" class="alt-sel-badge \${isSelActive ? 'active' : ''} edit-alt-badge" data-selector="\${sel.replace(/"/g, '&quot;')}">\${sel.length > 30 ? sel.slice(0, 27) + '...' : sel}</button>\`;
                  }).join('')}
                </div>
              </div>
            \` : ''}
          \` : ''}

          \${step.action === 'type' || step.action === 'screenshot' || step.action === 'pdf' || step.action === 'waitForTimeout' || (step.action === 'click' && step.text) ? \`
            <div class="form-group">
              <label class="form-label">\${step.action === 'type' ? 'Keyboard Value' : step.action === 'waitForTimeout' ? 'Timeout (ms)' : step.action === 'screenshot' ? 'File Name' : step.action === 'pdf' ? 'PDF File Name' : 'Element Label'}</label>
              <input type="text" class="form-input edit-text-input" value="\${step.text || ''}">
            </div>
          \` : ''}
        </div>
      \`;

      timelineContainer.appendChild(el);
    });

    // Attach step listeners dynamically
    document.querySelectorAll('.move-up-btn').forEach(b => {
      b.addEventListener('click', () => handleMoveStep(parseInt(b.getAttribute('data-index')), 'up'));
    });
    document.querySelectorAll('.move-down-btn').forEach(b => {
      b.addEventListener('click', () => handleMoveStep(parseInt(b.getAttribute('data-index')), 'down'));
    });
    document.querySelectorAll('.delete-step-btn').forEach(b => {
      b.addEventListener('click', () => handleDeleteStep(b.getAttribute('data-id')));
    });
    document.querySelectorAll('.edit-step-btn').forEach(b => {
      b.addEventListener('click', () => {
        editingStepId = b.getAttribute('data-id');
        updateUI();
      });
    });
    document.querySelectorAll('.cancel-edit-btn').forEach(b => {
      b.addEventListener('click', () => {
        editingStepId = null;
        updateUI();
      });
    });
    document.querySelectorAll('.save-edit-btn').forEach(b => {
      b.addEventListener('click', () => handleSaveStep(b.getAttribute('data-id'), b.closest('.timeline-item')));
    });

    // Alternate selector badge click handlers (editing mode)
    document.querySelectorAll('.edit-alt-badge').forEach(btn => {
      btn.addEventListener('click', () => {
        const selInput = btn.closest('.edit-form').querySelector('.edit-selector-input');
        if (selInput) {
          selInput.value = btn.getAttribute('data-selector');
          btn.closest('.alt-selectors-list').querySelectorAll('.edit-alt-badge').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });

    // Alternate selector badge click handlers (quick switch mode)
    document.querySelectorAll('.quick-alt-badge').forEach(btn => {
      btn.addEventListener('click', () => {
        const stepId = btn.getAttribute('data-step-id');
        const selector = btn.getAttribute('data-selector');
        chrome.runtime.sendMessage({
          type: 'UPDATE_STEP',
          stepId: stepId,
          updatedFields: { selector: selector }
        }, (response) => {
          state = response.state;
          updateUI();
        });
      });
    });
  }

  // Synchronize generated code if Export code is visible
  if (paneCode.classList.contains('active')) {
    updateCodeOutput();
  }
}

function handleMoveStep(index, direction) {
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= state.steps.length) return;
  
  const reordered = [...state.steps];
  const [removed] = reordered.splice(index, 1);
  reordered.splice(targetIndex, 0, removed);
  
  chrome.runtime.sendMessage({ type: 'REORDER_STEPS', steps: reordered }, (response) => {
    state = response.state;
    updateUI();
  });
}

function handleDeleteStep(stepId) {
  chrome.runtime.sendMessage({ type: 'REMOVE_STEP', stepId: stepId }, (response) => {
    state = response.state;
    updateUI();
  });
}

function handleSaveStep(stepId, itemEl) {
  const updatedFields = {};
  
  const urlInp = itemEl.querySelector('.edit-url-input');
  const selInp = itemEl.querySelector('.edit-selector-input');
  const textInp = itemEl.querySelector('.edit-text-input');
  
  if (urlInp) updatedFields.url = urlInp.value;
  if (selInp) updatedFields.selector = selInp.value;
  if (textInp) updatedFields.text = textInp.value;

  chrome.runtime.sendMessage({
    type: 'UPDATE_STEP',
    stepId: stepId,
    updatedFields: updatedFields
  }, (response) => {
    state = response.state;
    editingStepId = null;
    updateUI();
  });
}

// Full Playwright code generator
function updateCodeOutput() {
  const lang = exportLang.value;
  const boilerplate = cfgBoilerplate.checked;
  const comments = cfgComments.checked;

  let filename = 'playwright.spec.ts';
  if (lang === 'javascript') filename = 'playwright.spec.js';
  else if (lang === 'python') filename = 'test_playwright.py';

  codeFilename.innerText = filename;

  if (state.steps.length === 0) {
    codeBody.innerText = lang === 'python' 
      ? '# No steps recorded yet. Start recording to generate Python code.'
      : '// No steps recorded yet. Start recording to generate Playwright code.';
    return;
  }

  const generated = generatePlaywrightCode(state.steps, {
    language: lang,
    includeBoilerplate: boilerplate,
    includeComments: comments
  });

  codeBody.innerText = generated;
}

// Standard helper function for script generation matching the app's output logic
function generatePlaywrightCode(steps, options) {
  const { language, includeBoilerplate, includeComments } = options;

  if (language === 'python') {
    return generatePythonCode(steps, includeBoilerplate, includeComments);
  } else {
    return generateJSCode(steps, language === 'typescript', includeBoilerplate, includeComments);
  }
}

function generateJSCode(steps, isTypeScript, includeBoilerplate, includeComments) {
  let code = '';

  if (includeBoilerplate) {
    if (isTypeScript) {
      code += \`import { test, expect, Page } from '@playwright/test';\\n\\n\`;
      code += \`test('Recorded Workflow', async ({ page }: { page: Page }) => {\\n\`;
    } else {
      code += \`const { test, expect } = require('@playwright/test');\\n\\n\`;
      code += \`test('Recorded Workflow', async ({ page }) => {\\n\`;
    }
  }

  const indent = includeBoilerplate ? '  ' : '';

  steps.forEach((step, idx) => {
    if (includeComments) {
      if (step.action === 'navigate') {
        code += formatComment(\`Navigate to \${step.url}\`, indent, 'js');
      } else if (step.action === 'click') {
        const desc = step.text ? \`"\${step.text}"\` : step.tagName || 'element';
        code += formatComment(\`Click on \${desc}\`, indent, 'js');
      } else if (step.action === 'type') {
        code += formatComment(\`Type "\${step.text}" into input field\`, indent, 'js');
      } else if (step.action === 'screenshot') {
        const desc = step.selector ? \`element "\${step.selector}"\` : 'page';
        code += formatComment(\`Take a screenshot of the \${desc}\`, indent, 'js');
      } else if (step.action === 'pdf') {
        code += formatComment('Generate PDF of page', indent, 'js');
      } else if (step.action === 'waitForSelector') {
        code += formatComment(\`Wait for selector "\${step.selector}" to be visible\`, indent, 'js');
      } else if (step.action === 'waitForTimeout') {
        code += formatComment(\`Wait for \${step.text || '1000'}ms\`, indent, 'js');
      } else if (step.action === 'pause') {
        code += formatComment('Pause script execution for debugging', indent, 'js');
      }
    }

    if (step.action === 'navigate') {
      code += \`\${indent}await page.goto('\${step.url}');\\n\`;
      if (includeBoilerplate) {
        code += \`\${indent}await expect(page).toHaveURL(new RegExp('\${escapeRegExpDomain(step.url || "")}'));\\n\`;
      }
    } else if (step.action === 'click') {
      if (step.role && step.text) {
        const cleanText = step.text.replace(/'/g, "\\\\'");
        code += \`\${indent}await page.getByRole('\${step.role}', { name: '\${cleanText}' }).click();\\n\`;
      } else if (step.selector && step.selector.startsWith('[data-testid')) {
        const testId = step.selector.match(/data-testid="([^"]+)"/)?.[1] || '';
        code += \`\${indent}await page.getByTestId('\${testId}').click();\\n\`;
      } else if (step.selector && step.selector.startsWith('[data-qa')) {
        const qa = step.selector.match(/data-qa="([^"]+)"/)?.[1] || '';
        code += \`\${indent}await page.locator('[data-qa="\${qa}"]').click();\\n\`;
      } else if (step.selector) {
        code += \`\${indent}await page.locator('\${step.selector}').click();\\n\`;
      } else {
        code += \`\${indent}await page.locator('\${step.tagName || 'button'}').click();\\n\`;
      }
    } else if (step.action === 'type') {
      const fillVal = (step.text || '').replace(/'/g, "\\\\'");
      if (step.placeholder) {
        const cleanPlaceholder = step.placeholder.replace(/'/g, "\\\\'");
        code += \`\${indent}await page.getByPlaceholder('\${cleanPlaceholder}').fill('\${fillVal}');\\n\`;
      } else if (step.selector && step.selector.startsWith('[data-testid')) {
        const testId = step.selector.match(/data-testid="([^"]+)"/)?.[1] || '';
        code += \`\${indent}await page.getByTestId('\${testId}').fill('\${fillVal}');\\n\`;
      } else if (step.selector) {
        code += \`\${indent}await page.locator('\${step.selector}').fill('\${fillVal}');\\n\`;
      } else {
        code += \`\${indent}await page.locator('input').fill('\${fillVal}');\\n\`;
      }
    } else if (step.action === 'screenshot') {
      const path = step.text || 'screenshot.png';
      if (step.selector) {
        code += \`\${indent}await page.locator('\${step.selector}').screenshot({ path: '\${path}' });\\n\`;
      } else {
        code += \`\${indent}await page.screenshot({ path: '\${path}', fullPage: true });\\n\`;
      }
    } else if (step.action === 'pdf') {
      const path = step.text || 'document.pdf';
      code += \`\${indent}await page.pdf({ path: '\${path}', format: 'A4' });\\n\`;
    } else if (step.action === 'waitForSelector') {
      code += \`\${indent}await page.waitForSelector('\${step.selector}');\\n\`;
    } else if (step.action === 'waitForTimeout') {
      const ms = step.text || '1000';
      code += \`\${indent}await page.waitForTimeout(\${ms});\\n\`;
    } else if (step.action === 'pause') {
      code += \`\${indent}await page.pause();\\n\`;
    }

    code += '\\n';
  });

  if (includeBoilerplate) {
    code += \`});\\n\`;
  }

  return code.trim() + '\\n';
}

function generatePythonCode(steps, includeBoilerplate, includeComments) {
  let code = '';

  if (includeBoilerplate) {
    code += \`import re\\n\`;
    code += \`from playwright.sync_api import Playwright, sync_playwright, expect\\n\\n\`;
    code += \`def run(playwright: Playwright) -> None:\\n\`;
    code += \`    browser = playwright.chromium.launch(headless=False)\\n\`;
    code += \`    context = browser.new_context()\\n\`;
    code += \`    page = context.new_page()\\n\\n\`;
  }

  const indent = includeBoilerplate ? '    ' : '';

  steps.forEach((step) => {
    if (includeComments) {
      if (step.action === 'navigate') {
        code += formatComment(\`Navigate to \${step.url}\`, indent, 'python');
      } else if (step.action === 'click') {
        const desc = step.text ? \`"\${step.text}"\` : step.tagName || 'element';
        code += formatComment(\`Click on \${desc}\`, indent, 'python');
      } else if (step.action === 'type') {
        code += formatComment(\`Type "\${step.text}" into input field\`, indent, 'python');
      } else if (step.action === 'screenshot') {
        const desc = step.selector ? \`element "\${step.selector}"\` : 'page';
        code += formatComment(\`Take a screenshot of the \${desc}\`, indent, 'python');
      } else if (step.action === 'pdf') {
        code += formatComment('Generate PDF of page', indent, 'python');
      } else if (step.action === 'waitForSelector') {
        code += formatComment(\`Wait for selector "\${step.selector}" to be visible\`, indent, 'python');
      } else if (step.action === 'waitForTimeout') {
        code += formatComment(\`Wait for \${step.text || '1000'}ms\`, indent, 'python');
      } else if (step.action === 'pause') {
        code += formatComment('Pause script execution for debugging', indent, 'python');
      }
    }

    if (step.action === 'navigate') {
      code += \`\${indent}page.goto("\${step.url}")\\n\`;
      if (includeBoilerplate) {
        code += \`\${indent}expect(page).to_have_url(re.compile(r"\${escapeRegExpDomainPython(step.url || '')}"))\\n\`;
      }
    } else if (step.action === 'click') {
      if (step.role && step.text) {
        const cleanText = step.text.replace(/"/g, '\\\\"');
        code += \`\${indent}page.get_by_role("\${step.role}", name="\${cleanText}").click()\\n\`;
      } else if (step.selector && step.selector.startsWith('[data-testid')) {
        const testId = step.selector.match(/data-testid="([^"]+)"/)?.[1] || '';
        code += \`\${indent}page.get_by_test_id("\${testId}").click()\\n\`;
      } else if (step.selector) {
        const cleanSel = step.selector.replace(/"/g, '\\\\"');
        code += \`\${indent}page.locator("\${cleanSel}").click()\\n\`;
      } else {
        code += \`\${indent}page.locator("\${step.tagName || 'button'}").click()\\n\`;
      }
    } else if (step.action === 'type') {
      const fillVal = (step.text || '').replace(/"/g, '\\\\"');
      if (step.placeholder) {
        const cleanPlaceholder = step.placeholder.replace(/"/g, '\\\\"');
        code += \`\${indent}page.get_by_placeholder("\${cleanPlaceholder}").fill("\${fillVal}")\\n\`;
      } else if (step.selector && step.selector.startsWith('[data-testid')) {
        const testId = step.selector.match(/data-testid="([^"]+)"/)?.[1] || '';
        code += \`\${indent}page.get_by_test_id("\${testId}").fill("\${fillVal}")\\n\`;
      } else if (step.selector) {
        const cleanSel = step.selector.replace(/"/g, '\\\\"');
        code += \`\${indent}page.locator("\${cleanSel}").fill("\${fillVal}")\\n\`;
      } else {
        code += \`\${indent}page.locator("input").fill("\${fillVal}")\\n\`;
      }
    } else if (step.action === 'screenshot') {
      const path = step.text || 'screenshot.png';
      if (step.selector) {
        const cleanSel = step.selector.replace(/"/g, '\\\\"');
        code += \`\${indent}page.locator("\${cleanSel}").screenshot(path="\${path}")\\n\`;
      } else {
        code += \`\${indent}page.screenshot(path="\${path}", full_page=True)\\n\`;
      }
    } else if (step.action === 'pdf') {
      const path = step.text || 'document.pdf';
      code += \`\${indent}page.pdf(path="\${path}", format="A4")\\n\`;
    } else if (step.action === 'waitForSelector') {
      const cleanSel = step.selector ? step.selector.replace(/"/g, '\\\\"') : '';
      code += \`\${indent}page.wait_for_selector("\${cleanSel}")\\n\`;
    } else if (step.action === 'waitForTimeout') {
      const ms = step.text || '1000';
      code += \`\${indent}page.wait_for_timeout(\${ms})\\n\`;
    } else if (step.action === 'pause') {
      code += \`\${indent}page.pause()\\n\`;
    }

    code += '\\n';
  });

  if (includeBoilerplate) {
    code += \`\${indent}# Clean up context and browser\\n\`;
    code += \`\${indent}context.close()\\n\`;
    code += \`\${indent}browser.close()\\n\\n\`;
    code += \`with sync_playwright() as playwright:\\n\`;
    code += \`    run(playwright)\\n\`;
  }

  return code.trim() + '\\n';
}

function getPossibleSelectorsForStep(step) {
  if (step.possibleSelectors && step.possibleSelectors.length > 0) {
    const list = new Set(step.possibleSelectors);
    if (step.selector) list.add(step.selector);
    return Array.from(list);
  }

  if (!step.selector && !step.tagName) return [];
  const list = new Set();

  const tag = step.tagName || 'button';
  const idMatch = step.selector ? step.selector.match(/#([a-zA-Z0-9_-]+)/) : null;
  const id = idMatch ? idMatch[1] : '';

  if (step.selector) {
    list.add(step.selector);
  }

  if (id) {
    list.add(\`#\${id}\`);
    list.add(\`\${tag}#\${id}\`);
    list.add(\`\${tag}[id="\${id}"]\`);
  }

  if (step.placeholder) {
    list.add(\`\${tag}[placeholder="\${step.placeholder}"]\`);
  }
  
  if (step.selector) {
    if (step.selector.includes('email') || step.placeholder?.includes('email')) {
      list.add('input[type="email"]');
      list.add('input[name="email"]');
    } else if (step.selector.includes('password') || step.placeholder?.includes('••••••••')) {
      list.add('input[type="password"]');
      list.add('input[name="password"]');
    }
  }

  if (step.text) {
    list.add(\`\${tag}:has-text("\${step.text}")\`);
    if (tag !== 'button' && step.role === 'button') {
      list.add(\`button:has-text("\${step.text}")\`);
    }
  }

  if (id) {
    list.add(\`//\${tag}[@id='\${id}']\`);
  }
  if (step.placeholder) {
    list.add(\`//\${tag}[@placeholder='\${step.placeholder}']\`);
  }
  if (step.text) {
    list.add(\`//\${tag}[text()='\${step.text}']\`);
    list.add(\`//\${tag}[contains(text(),'\${step.text}')]\`);
  }

  if (list.size === 0 && tag) {
    list.add(tag);
  }

  return Array.from(list);
}

function formatComment(text, indent, lang) {
  const maxLineLength = 80;
  let lines = [];

  if (text.includes('\\n')) {
    lines = text.split('\\n');
  } else if (text.length > maxLineLength) {
    const words = text.split(' ');
    let currentLine = '';
    words.forEach(word => {
      if ((currentLine + ' ' + word).trim().length > maxLineLength) {
        lines.push(currentLine.trim());
        currentLine = word;
      } else {
        currentLine = currentLine ? currentLine + ' ' + word : word;
      }
    });
    if (currentLine) {
      lines.push(currentLine.trim());
    }
  } else {
    if (lang === 'js') {
      return \`\${indent}// \${text}\\n\`;
    } else {
      return \`\${indent}# \${text}\\n\`;
    }
  }

  if (lang === 'js') {
    let result = \`\${indent}/*\\n\`;
    lines.forEach(line => {
      result += \`\${indent} * \${line}\\n\`;
    });
    result += \`\${indent} */\\n\`;
    return result;
  } else {
    let result = '';
    lines.forEach(line => {
      result += \`\${indent}# \${line}\\n\`;
    });
    return result;
  }
}


function escapeRegExpDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/[-\\\\/\\\\^$*+?.()|[\\\\]{}]/g, '\\\\$&');
  } catch {
    return '.*';
  }
}

function escapeRegExpDomainPython(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/[-\\\\/\\\\^$*+?.()|[\\\\]{}]/g, '\\\\$&');
  } catch {
    return '.*';
  }
}
`
  },
  {
    name: "icon.svg",
    language: "xml",
    code: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#1d4ed8" />
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="128" height="128" rx="28" fill="#0C0C0E" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
  <!-- Outer glowing circle -->
  <circle cx="64" cy="64" r="32" fill="none" stroke="url(#grad)" stroke-width="6" opacity="0.8"/>
  <!-- Inner recording dot -->
  <circle cx="64" cy="64" r="16" fill="#ef4444" />
  <!-- Minimalist play/action lines -->
  <path d="M 44 64 L 54 64" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/>
  <path d="M 74 64 L 84 64" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/>
</svg>
`
  },
  {
    name: "README.md",
    language: "markdown",
    code: `# Playwright Automation Recorder Extension

A fully packed Google Chrome extension that allows you to record real browser workflows (user clicks, text input, navigations) and customize scripts directly on any website with advanced actions like Screenshots, PDF generation, Element Waits, and Debugging Pauses.

## Features

- **Automated Capturing**: Captures web pages navigations, element clicks, and input values seamlessly in real-time.
- **Advanced Controls**: Manually inject advanced steps like capturing screenshots (of the page or specific elements), exporting PDF documents, waiting for elements to render, inserting precise delays, or adding a Playwright debugging pause.
- **Design System**: Fully matches the premium **Dark Slate** interface, featuring interactive reordering (up/down sorting), inline step parameters editing, and precise deletion.
- **Multi-Language Export**: Instantly translates workflows into clean Playwright scripts supporting **TypeScript**, **JavaScript**, or **Python**, with toggles for boilerplate wrappers and comments.

## Installation Instructions

1. **Download the Extension**: Click **Download Extension Bundle (.zip)** inside our recorder dashboard and extract the zipped package into a persistent directory on your local computer.
2. **Open Extensions Control Panel**: Open Chrome and navigate to \`chrome://extensions/\` in your URL search bar.
3. **Turn on Developer Mode**: Toggle the **"Developer mode"** switch located at the top-right corner of the Extensions board.
4. **Load Unpacked Extension**: Tap the **"Load unpacked"** button on the left menu bar.
5. **Select extracted folder**: Browse and choose the folder where you extracted the extension files (ensure it has \`manifest.json\` directly inside it).
6. **Start Recording**: Pin the **Playwright Automation Recorder** from your browser's extension puzzle menu, visit any live webpage, open the extension popup, and click **Record**!
`
  }
];
