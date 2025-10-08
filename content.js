let isPanelVisible = false;
let isPickerActive = false;
let hoveredElement = null;
let searchTimeout = null;
let autocompleteIndex = -1;

// XPath autocomplete suggestions
const xpathSuggestions = {
  axes: [
    { label: 'ancestor::', description: 'Selects all ancestors of the current node' },
    { label: 'ancestor-or-self::', description: 'Selects current node and all ancestors' },
    { label: 'attribute::', description: 'Selects all attributes of the current node' },
    { label: 'child::', description: 'Selects all children of the current node' },
    { label: 'descendant::', description: 'Selects all descendants of the current node' },
    { label: 'descendant-or-self::', description: 'Selects current node and all descendants' },
    { label: 'following::', description: 'Selects everything after the closing tag' },
    { label: 'following-sibling::', description: 'Selects all siblings after the current node' },
    { label: 'namespace::', description: 'Selects all namespace nodes' },
    { label: 'parent::', description: 'Selects the parent of the current node' },
    { label: 'preceding::', description: 'Selects all nodes before the current node' },
    { label: 'preceding-sibling::', description: 'Selects all siblings before the current node' },
    { label: 'self::', description: 'Selects the current node' }
  ],
  functions: [
    { label: 'contains()', description: 'Returns true if string contains substring' },
    { label: 'starts-with()', description: 'Returns true if string starts with substring' },
    { label: 'ends-with()', description: 'Returns true if string ends with substring' },
    { label: 'text()', description: 'Selects all text nodes' },
    { label: 'normalize-space()', description: 'Removes leading/trailing whitespace' },
    { label: 'concat()', description: 'Concatenates strings' },
    { label: 'substring()', description: 'Returns substring from string' },
    { label: 'string-length()', description: 'Returns length of string' },
    { label: 'translate()', description: 'Translates characters in string' },
    { label: 'count()', description: 'Returns count of nodes' },
    { label: 'position()', description: 'Returns position of current node' },
    { label: 'last()', description: 'Returns position of last node' },
    { label: 'not()', description: 'Returns true if condition is false' },
    { label: 'name()', description: 'Returns name of current node' },
    { label: 'local-name()', description: 'Returns local name of current node' }
  ]
};

// Create the side panel
function createPanel() {
  if (document.getElementById("xpath-helper-panel")) return;

  const panel = document.createElement("div");
  panel.id = "xpath-helper-panel";
  panel.innerHTML = `
    <div class="xpath-panel-header">
      <div class="xpath-panel-title">
        <img src="${chrome.runtime.getURL(
          "icons/icon128.png"
        )}" class="xpath-icon" alt="XPath Helper">
        <span>XPath Helper</span>
      </div>
      <div class="xpath-panel-actions">
        <button id="xpath-toggle-picker" class="xpath-btn-icon" title="Pick Element (Ctrl+Shift+X)">
          🖱️
        </button>
        <button id="xpath-close-panel" class="xpath-btn-icon" title="Close">
          ✕
        </button>
      </div>
    </div>
    
    <div class="xpath-panel-content">
      <div class="xpath-input-section">
        <label class="xpath-label">XPath Query:</label>
        <div class="xpath-input-container">
          <textarea 
            id="xpath-input" 
            class="xpath-textarea" 
            placeholder="Type XPath... e.g., //div[@class='example']"
            rows="3"
            autocomplete="off"
            spellcheck="false"
          ></textarea>
          <div id="xpath-autocomplete" class="xpath-autocomplete"></div>
        </div>
        <div class="xpath-help-text">
          💡 Auto-search as you type | Tab/Enter to complete
        </div>
      </div>

      <div class="xpath-results-section">
        <div class="xpath-results-header">
          <label class="xpath-label">Results:</label>
          <span id="xpath-result-count" class="xpath-count"></span>
        </div>
        <div id="xpath-results" class="xpath-results-box">
          Type XPath to search...
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(panel);
  attachPanelEvents();
}

function attachPanelEvents() {
  const panel = document.getElementById("xpath-helper-panel");
  const closeBtn = document.getElementById("xpath-close-panel");
  const pickerBtn = document.getElementById("xpath-toggle-picker");
  const xpathInput = document.getElementById("xpath-input");

  // Check if all elements exist
  if (!panel || !closeBtn || !pickerBtn || !xpathInput) {
    console.error("XPath Helper: Failed to find panel elements");
    return;
  }

  // Close panel
  closeBtn.addEventListener("click", () => {
    hidePanel();
  });

  // Toggle element picker
  pickerBtn.addEventListener("click", () => {
    isPickerActive = !isPickerActive;
    if (isPickerActive) {
      startElementPicker();
      pickerBtn.classList.add("active");
      pickerBtn.textContent = "⏸️";
      pickerBtn.title = "Stop Picking";
    } else {
      stopElementPicker();
      pickerBtn.classList.remove("active");
      pickerBtn.textContent = "🖱️";
      pickerBtn.title = "Pick Element";
    }
  });

  // Auto-search on input with debounce
  xpathInput.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    const xpath = e.target.value.trim();
    
    // Show autocomplete
    showAutocomplete(e.target);

    if (!xpath) {
      clearResults();
      return;
    }

    // Debounce search by 500ms
    searchTimeout = setTimeout(() => {
      evaluateXPath(xpath);
    }, 500);
  });

  // Handle keyboard navigation for autocomplete
  xpathInput.addEventListener("keydown", (e) => {
    const autocompleteDiv = document.getElementById("xpath-autocomplete");
    const items = autocompleteDiv.querySelectorAll(".xpath-autocomplete-item");
    
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      autocompleteIndex = Math.min(autocompleteIndex + 1, items.length - 1);
      updateAutocompleteSelection(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      autocompleteIndex = Math.max(autocompleteIndex - 1, 0);
      updateAutocompleteSelection(items);
    } else if (e.key === "Enter" && autocompleteIndex >= 0) {
      e.preventDefault();
      items[autocompleteIndex].click();
    } else if (e.key === "Tab") {
      // Tab always uses selected suggestion (first by default)
      if (items.length > 0) {
        e.preventDefault();
        items[autocompleteIndex].click();
      }
    } else if (e.key === "Escape" && items.length > 0) {
      e.stopPropagation();
      hideAutocomplete();
    }
  });

  // Hide autocomplete when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".xpath-input-container")) {
      hideAutocomplete();
    }
  });

  // Make panel draggable
  makePanelDraggable();
}

function makePanelDraggable() {
  const panel = document.getElementById("xpath-helper-panel");
  if (!panel) return;

  const header = panel.querySelector(".xpath-panel-header");
  if (!header) return;

  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let animationFrameId = null;

  header.addEventListener("mousedown", dragStart);
  document.addEventListener("mousemove", drag);
  document.addEventListener("mouseup", dragEnd);

  function dragStart(e) {
    if (e.target.closest(".xpath-btn-icon")) return;

    // Get current position considering transform
    const rect = panel.getBoundingClientRect();
    initialX = e.clientX - rect.left;
    initialY = e.clientY - rect.top;
    isDragging = true;
    header.style.cursor = "grabbing";

    // Disable transition for smooth dragging
    panel.style.transition = "none";
  }

  function drag(e) {
    if (!isDragging) return;
    e.preventDefault();

    // Store the mouse position
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // Cancel any pending animation frame
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }

    // Use requestAnimationFrame for smooth updates
    animationFrameId = requestAnimationFrame(() => {
      currentX = mouseX - initialX;
      currentY = mouseY - initialY;

      // Keep panel within viewport
      const maxX = window.innerWidth - panel.offsetWidth;
      const maxY = window.innerHeight - panel.offsetHeight;

      currentX = Math.max(0, Math.min(currentX, maxX));
      currentY = Math.max(0, Math.min(currentY, maxY));

      // Use transform for better performance
      panel.style.transform = `translate(${currentX}px, ${currentY}px)`;
      panel.style.left = "0";
      panel.style.top = "0";
      panel.style.right = "auto";
    });
  }

  function dragEnd() {
    isDragging = false;
    header.style.cursor = "grab";

    // Cancel any pending animation
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    // Re-enable transition
    panel.style.transition = "";
  }
}

// Autocomplete functions
function showAutocomplete(textarea) {
  const autocompleteDiv = document.getElementById("xpath-autocomplete");
  if (!autocompleteDiv) return;

  const value = textarea.value;
  const cursorPos = textarea.selectionStart;
  const textBeforeCursor = value.substring(0, cursorPos);
  
  // Find the last word before cursor
  const lastWord = textBeforeCursor.match(/[\w:-]*$/)?.[0] || "";
  
  if (lastWord.length < 1) {
    hideAutocomplete();
    return;
  }

  // Get suggestions
  const suggestions = getSuggestions(lastWord);
  
  if (suggestions.length === 0) {
    hideAutocomplete();
    return;
  }

  // Build autocomplete HTML
  let html = "";
  suggestions.forEach((suggestion, index) => {
    html += `
      <div class="xpath-autocomplete-item" data-value="${escapeHtml(suggestion.label)}" data-index="${index}">
        <div class="xpath-autocomplete-label">${escapeHtml(suggestion.label)}</div>
        <div class="xpath-autocomplete-desc">${escapeHtml(suggestion.description)}</div>
      </div>
    `;
  });

  autocompleteDiv.innerHTML = html;
  autocompleteDiv.style.display = "block";
  
  // Auto-select first item (like IDE behavior)
  autocompleteIndex = 0;

  // Attach click handlers
  const items = autocompleteDiv.querySelectorAll(".xpath-autocomplete-item");
  items.forEach((item) => {
    item.addEventListener("click", () => {
      insertSuggestion(textarea, item.getAttribute("data-value"));
    });
  });
  
  // Highlight first item
  updateAutocompleteSelection(items);
}

function hideAutocomplete() {
  const autocompleteDiv = document.getElementById("xpath-autocomplete");
  if (autocompleteDiv) {
    autocompleteDiv.style.display = "none";
    autocompleteDiv.innerHTML = "";
  }
  autocompleteIndex = -1;
}

function getSuggestions(prefix) {
  const suggestions = [];
  const lowerPrefix = prefix.toLowerCase();

  // Search in axes
  xpathSuggestions.axes.forEach((item) => {
    if (item.label.toLowerCase().startsWith(lowerPrefix)) {
      suggestions.push(item);
    }
  });

  // Search in functions
  xpathSuggestions.functions.forEach((item) => {
    if (item.label.toLowerCase().startsWith(lowerPrefix)) {
      suggestions.push(item);
    }
  });

  return suggestions.slice(0, 10); // Limit to 10 suggestions
}

function updateAutocompleteSelection(items) {
  items.forEach((item, index) => {
    if (index === autocompleteIndex) {
      item.classList.add("selected");
      item.scrollIntoView({ block: "nearest" });
    } else {
      item.classList.remove("selected");
    }
  });
}

function insertSuggestion(textarea, value) {
  const cursorPos = textarea.selectionStart;
  const textBefore = textarea.value.substring(0, cursorPos);
  const textAfter = textarea.value.substring(cursorPos);
  
  // Replace the last word with the suggestion
  const textBeforeWithoutLastWord = textBefore.replace(/[\w:-]*$/, "");
  const newValue = textBeforeWithoutLastWord + value + textAfter;
  const newCursorPos = textBeforeWithoutLastWord.length + value.length;
  
  textarea.value = newValue;
  textarea.setSelectionRange(newCursorPos, newCursorPos);
  textarea.focus();
  
  hideAutocomplete();
  
  // Trigger input event to update search
  const event = new Event("input", { bubbles: true });
  textarea.dispatchEvent(event);
}

function showPanel() {
  createPanel();
  const panel = document.getElementById("xpath-helper-panel");
  panel.classList.add("visible");
  isPanelVisible = true;

  // Add global Esc key listener
  document.addEventListener("keydown", handlePanelEscKey);
  
  // Re-evaluate XPath if there's a query in the input
  const xpathInput = document.getElementById("xpath-input");
  if (xpathInput) {
    if (xpathInput.value.trim()) {
      evaluateXPath(xpathInput.value.trim());
    }
    
    // Focus on input and move cursor to end
    setTimeout(() => {
      xpathInput.focus();
      const length = xpathInput.value.length;
      xpathInput.setSelectionRange(length, length);
    }, 100);
  }
}

function hidePanel() {
  const panel = document.getElementById("xpath-helper-panel");
  if (panel) {
    panel.classList.remove("visible");
  }
  isPanelVisible = false;
  stopElementPicker();
  
  // Remove all highlights when closing panel
  removeAllHighlights();
  
  // Hide autocomplete
  hideAutocomplete();

  // Remove global Esc key listener
  document.removeEventListener("keydown", handlePanelEscKey);
}

function handlePanelEscKey(event) {
  if (event.key === "Escape") {
    if (isPickerActive) {
      // If picker is active, stop it first
      stopElementPicker();
      const pickerBtn = document.getElementById("xpath-toggle-picker");
      if (pickerBtn) {
        pickerBtn.classList.remove("active");
        pickerBtn.textContent = "🖱️";
        pickerBtn.title = "Pick Element";
      }
    } else {
      // If picker is not active, close the panel
      hidePanel();
    }
  }
}

function togglePanel() {
  if (isPanelVisible) {
    hidePanel();
  } else {
    showPanel();
  }
}

// Element Picker Functions
function startElementPicker() {
  isPickerActive = true;
  document.addEventListener("mouseover", handleMouseOver, true);
  document.addEventListener("mouseout", handleMouseOut, true);
  document.addEventListener("click", handleClick, true);
  document.body.style.cursor = "crosshair";
}

function stopElementPicker() {
  isPickerActive = false;
  document.removeEventListener("mouseover", handleMouseOver, true);
  document.removeEventListener("mouseout", handleMouseOut, true);
  document.removeEventListener("click", handleClick, true);
  document.body.style.cursor = "default";

  if (hoveredElement) {
    removeHighlight(hoveredElement);
    hoveredElement = null;
  }

  const pickerBtn = document.getElementById("xpath-toggle-picker");
  if (pickerBtn) {
    pickerBtn.classList.remove("active");
    pickerBtn.textContent = "🖱️";
  }
}

function handleMouseOver(event) {
  if (!isPickerActive) return;
  if (event.target.closest("#xpath-helper-panel")) return;

  if (hoveredElement) {
    removeHighlight(hoveredElement);
  }

  hoveredElement = event.target;
  highlightElement(hoveredElement);
}

function handleMouseOut(event) {
  if (!isPickerActive) return;
  if (event.target.closest("#xpath-helper-panel")) return;

  if (hoveredElement === event.target) {
    removeHighlight(hoveredElement);
    hoveredElement = null;
  }
}

function handleClick(event) {
  if (!isPickerActive) return;
  if (event.target.closest("#xpath-helper-panel")) return;

  event.preventDefault();
  event.stopPropagation();

  const xpath = getXPath(event.target);
  const xpathInput = document.getElementById("xpath-input");
  if (xpathInput) {
    xpathInput.value = xpath;
    evaluateXPath(xpath);
  }

  stopElementPicker();
}

function highlightElement(element) {
  if (element.id === "xpath-helper-panel") return;
  element.setAttribute(
    "data-xpath-original-outline",
    element.style.outline || ""
  );
  element.setAttribute(
    "data-xpath-original-bg",
    element.style.backgroundColor || ""
  );
  element.style.outline = "3px solid #667eea";
  element.style.backgroundColor = "rgba(102, 126, 234, 0.1)";
}

function removeHighlight(element) {
  const originalOutline = element.getAttribute("data-xpath-original-outline");
  const originalBg = element.getAttribute("data-xpath-original-bg");
  element.style.outline = originalOutline || "";
  element.style.backgroundColor = originalBg || "";
  element.removeAttribute("data-xpath-original-outline");
  element.removeAttribute("data-xpath-original-bg");
}

function getXPath(element) {
  // If element has unique id, use it
  if (element.id) {
    return `//*[@id="${element.id}"]`;
  }

  if (element === document.body) {
    return "//body";
  }

  // Try to find a good anchor point (element with id) in the hierarchy
  let anchor = null;
  let anchorPath = "";
  let temp = element.parentElement;

  while (temp && temp !== document.body) {
    if (temp.id) {
      anchor = temp;
      anchorPath = `//*[@id="${temp.id}"]`;
      break;
    }
    temp = temp.parentElement;
  }

  // Build path from element to anchor (or body)
  const paths = [];
  let current = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    if (current === document.body || current === anchor) {
      break;
    }

    const tagName = current.nodeName.toLowerCase();
    let selector = tagName;
    let hasAttribute = false;

    // Add class attribute if exists
    if (current.className && typeof current.className === "string") {
      const classes = current.className
        .trim()
        .split(/\s+/)
        .filter((c) => c && !c.startsWith("xpath-helper"));

      if (classes.length > 0) {
        // Use up to 3 classes
        const classesToUse = classes.slice(0, 3).join(" ");
        selector = `${tagName}[@class="${classesToUse}"]`;
        hasAttribute = true;
      }
    }

    // Try to add other useful attributes
    if (!hasAttribute) {
      const usefulAttrs = [
        "id",
        "name",
        "type",
        "role",
        "data-testid",
        "aria-label",
      ];
      for (const attr of usefulAttrs) {
        if (current.hasAttribute(attr)) {
          const attrValue = current.getAttribute(attr);
          if (attrValue && attr !== "id") {
            // id is handled separately
            selector = `${tagName}[@${attr}="${attrValue}"]`;
            hasAttribute = true;
            break;
          }
        }
      }
    }

    // Calculate position if needed
    const parent = current.parentNode;
    if (parent) {
      const siblings = Array.from(parent.children).filter((el) => {
        // Match by tag name and class if selector has class
        if (hasAttribute && current.className) {
          return (
            el.nodeName === current.nodeName &&
            el.className === current.className
          );
        }
        return el.nodeName === current.nodeName;
      });

      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `[${index}]`;
      }
    }

    paths.unshift(selector);
    current = current.parentNode;
  }

  // Build final XPath
  if (paths.length === 0) {
    return "//body";
  }

  if (anchorPath) {
    // Use anchor point as base
    return anchorPath + "/" + paths.join("/");
  }

  // Use relative path from body
  return "//" + paths.join("/");
}

// XPath Evaluation
function evaluateXPath(xpath) {
  removeAllHighlights();
  clearTimeout(searchTimeout);

  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    const count = result.snapshotLength;
    displayResults(result, count);
  } catch (error) {
    showError(`❌ Invalid XPath: ${error.message}`);
  }
}

function displayResults(result, count) {
  const resultsDiv = document.getElementById("xpath-results");
  const countSpan = document.getElementById("xpath-result-count");

  if (!resultsDiv || !countSpan) return;

  if (count === 0) {
    resultsDiv.innerHTML =
      '<div class="xpath-no-results">No elements match this XPath</div>';
    countSpan.textContent = "(0 items)";
    return;
  }

  countSpan.textContent = `(${count} items)`;

  let resultsHTML = "";
  const maxResults = Math.min(count, 100);

  // Scroll to first element
  if (count > 0) {
    const firstNode = result.snapshotItem(0);
    if (
      firstNode.nodeType === Node.ELEMENT_NODE &&
      !firstNode.closest("#xpath-helper-panel")
    ) {
      scrollToElement(firstNode);
    }
  }

  for (let i = 0; i < maxResults; i++) {
    const node = result.snapshotItem(i);

    // Highlight element on page
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      !node.closest("#xpath-helper-panel")
    ) {
      node.classList.add("xpath-helper-highlight");
    }

    // Get text content
    const textContent = getNodeTextContent(node);
    const nodeInfo = getNodeInfo(node);

    resultsHTML += `
      <div class="xpath-result-item" data-index="${i}">
        <div class="xpath-result-number">${i + 1}.</div>
        <div class="xpath-result-content">
          <div class="xpath-result-node">${nodeInfo}</div>
          ${
            textContent
              ? `<div class="xpath-result-text">${textContent}</div>`
              : ""
          }
        </div>
      </div>
    `;
  }

  if (count > maxResults) {
    resultsHTML += `<div class="xpath-result-more">Showing first ${maxResults} of ${count} total items</div>`;
  }

  resultsDiv.innerHTML = resultsHTML;

  // Add click handlers to scroll to elements
  attachResultClickHandlers(result, maxResults);
}

function scrollToElement(element) {
  if (!element || !element.scrollIntoView) return;

  element.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "center",
  });

  // Flash the element
  const originalOutline = element.style.outline;
  const originalBg = element.style.backgroundColor;

  element.style.outline = "4px solid #ff9800";
  element.style.backgroundColor = "rgba(255, 152, 0, 0.3)";

  setTimeout(() => {
    element.style.outline = originalOutline;
    element.style.backgroundColor = originalBg;
  }, 1000);
}

function attachResultClickHandlers(result, maxResults) {
  const resultsDiv = document.getElementById("xpath-results");
  if (!resultsDiv) return;

  const resultItems = resultsDiv.querySelectorAll(".xpath-result-item");
  resultItems.forEach((item, index) => {
    item.style.cursor = "pointer";
    item.addEventListener("click", () => {
      const node = result.snapshotItem(index);
      if (
        node &&
        node.nodeType === Node.ELEMENT_NODE &&
        !node.closest("#xpath-helper-panel")
      ) {
        scrollToElement(node);
      }
    });
  });
}

function getNodeTextContent(node) {
  let text = "";

  if (node.nodeType === Node.TEXT_NODE) {
    text = node.textContent.trim();
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    text = node.textContent.trim();
  }

  if (!text) return "";

  // Truncate long text
  if (text.length > 200) {
    text = text.substring(0, 200) + "...";
  }

  return escapeHtml(text);
}

function getNodeInfo(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return '<span class="xpath-node-type">[Text Node]</span>';
  }

  let info = `&lt;${node.nodeName.toLowerCase()}`;

  if (node.id) {
    info += ` id="${escapeHtml(node.id)}"`;
  }

  if (node.className && typeof node.className === "string") {
    const classes = node.className.trim().substring(0, 80);
    if (classes) {
      info += ` class="${escapeHtml(classes)}"`;
    }
  }

  info += "&gt;";

  return info;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function clearResults() {
  const resultsDiv = document.getElementById("xpath-results");
  const countSpan = document.getElementById("xpath-result-count");

  if (resultsDiv) {
    resultsDiv.innerHTML =
      '<div class="xpath-no-results">Type XPath to search...</div>';
  }

  if (countSpan) {
    countSpan.textContent = "";
  }

  removeAllHighlights();
}

function showError(message) {
  const resultsDiv = document.getElementById("xpath-results");
  const countSpan = document.getElementById("xpath-result-count");

  if (resultsDiv) {
    resultsDiv.innerHTML = `<div class="xpath-error">${escapeHtml(
      message
    )}</div>`;
  }

  if (countSpan) {
    countSpan.textContent = "(0 items)";
  }

  removeAllHighlights();
}

function removeAllHighlights() {
  const highlighted = document.querySelectorAll(".xpath-helper-highlight");
  highlighted.forEach((el) => {
    el.classList.remove("xpath-helper-highlight");
  });
}

// Check if extension context is valid
function isExtensionContextValid() {
  try {
    return chrome.runtime && chrome.runtime.id;
  } catch (e) {
    return false;
  }
}

// Show warning when extension context is invalid
function showExtensionInvalidWarning() {
  // Remove any existing warning
  const existingWarning = document.getElementById("xpath-extension-warning");
  if (existingWarning) {
    existingWarning.remove();
  }

  const warning = document.createElement("div");
  warning.id = "xpath-extension-warning";
  warning.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff5252;
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 2147483647;
    font-family: -apple-system, sans-serif;
    font-size: 14px;
    max-width: 300px;
  `;
  warning.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 8px;">⚠️ XPath Helper</div>
    <div style="margin-bottom: 12px;">Extension was updated. Please refresh this page to continue using.</div>
    <button onclick="window.location.reload()" style="
      background: white;
      color: #ff5252;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
      width: 100%;
    ">Refresh Page</button>
  `;
  document.body.appendChild(warning);

  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (warning.parentNode) {
      warning.remove();
    }
  }, 10000);
}

// Listen for messages from background script
try {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!isExtensionContextValid()) {
      showExtensionInvalidWarning();
      return;
    }

    if (request.action === "togglePanel") {
      togglePanel();
    }
  });
} catch (error) {
  console.error("XPath Helper: Failed to add message listener:", error);
}

// Detect if extension was reloaded
if (!isExtensionContextValid()) {
  console.warn(
    "XPath Helper: Extension context is invalid. Page refresh required."
  );
}

// Auto-open panel on first install (optional)
// showPanel();
