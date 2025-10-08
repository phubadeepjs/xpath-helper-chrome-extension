let isPanelVisible = false;
let isPickerActive = false;
let hoveredElement = null;
let searchTimeout = null;
let autocompleteIndex = -1;
let flashTimeouts = [];
let flashedElements = [];

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
  document.body.style.cursor = "crosshair !important";
  
  // Add visual indicator overlay
  addPickerOverlay();
}

function stopElementPicker() {
  isPickerActive = false;
  document.removeEventListener("mouseover", handleMouseOver, true);
  document.removeEventListener("mouseout", handleMouseOut, true);
  document.removeEventListener("click", handleClick, true);
  document.body.style.cursor = "";

  if (hoveredElement) {
    removeHighlight(hoveredElement);
    hoveredElement = null;
  }
  
  // Remove tooltip
  hideElementTooltip();
  
  // Remove overlay
  removePickerOverlay();
  
  // Clean up any remaining picker highlights
  document.querySelectorAll('.xpath-picker-hover').forEach((el) => {
    el.classList.remove("xpath-picker-hover");
  });

  const pickerBtn = document.getElementById("xpath-toggle-picker");
  if (pickerBtn) {
    pickerBtn.classList.remove("active");
    pickerBtn.textContent = "🖱️";
  }
}

function addPickerOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "xpath-picker-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2147483645;
    pointer-events: none;
    background: rgba(0, 0, 0, 0.02);
  `;
  document.body.appendChild(overlay);
  
  // Add instruction banner
  const banner = document.createElement("div");
  banner.id = "xpath-picker-banner";
  banner.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #0a84ff;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-family: -apple-system, sans-serif;
    font-size: 14px;
    font-weight: 600;
    z-index: 2147483647;
    pointer-events: none;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    animation: fadeIn 0.3s ease-out;
  `;
  banner.innerHTML = `
    🖱️ Click on any element to select | Press <kbd style="background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 3px;">Esc</kbd> to cancel
  `;
  document.body.appendChild(banner);
}

function removePickerOverlay() {
  const overlay = document.getElementById("xpath-picker-overlay");
  const banner = document.getElementById("xpath-picker-banner");
  if (overlay) overlay.remove();
  if (banner) banner.remove();
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
  
  // Ignore clicks on picker UI elements
  if (event.target.closest("#xpath-helper-panel")) return;
  if (event.target.id === "xpath-picker-overlay") return;
  if (event.target.id === "xpath-picker-banner") return;
  if (event.target.id === "xpath-picker-tooltip") return;

  event.preventDefault();
  event.stopPropagation();

  // Clean up hovered element highlight first
  if (hoveredElement) {
    removeHighlight(hoveredElement);
    hoveredElement = null;
  }

  const xpath = getXPath(event.target);
  
  // Stop picker before evaluation (to clean up all picker highlights)
  stopElementPicker();
  
  // Update picker button state
  const pickerBtn = document.getElementById("xpath-toggle-picker");
  if (pickerBtn) {
    pickerBtn.classList.remove("active");
    pickerBtn.textContent = "🖱️";
    pickerBtn.title = "Pick Element";
  }
  
  // Then update input and evaluate
  const xpathInput = document.getElementById("xpath-input");
  if (xpathInput && xpath) {
    xpathInput.value = xpath;
    xpathInput.focus();
    
    // Small delay to ensure cleanup is complete
    setTimeout(() => {
      evaluateXPath(xpath);
    }, 50);
  }
}

function highlightElement(element) {
  if (element.id === "xpath-helper-panel") return;
  if (element.closest("#xpath-helper-panel")) return;
  
  // Use CSS class instead of inline styles for cleaner cleanup
  element.classList.add("xpath-picker-hover");
  
  // Show element info tooltip
  showElementTooltip(element);
}

function removeHighlight(element) {
  if (!element) return;
  
  // Simply remove the class
  element.classList.remove("xpath-picker-hover");
  
  // Remove tooltip
  hideElementTooltip();
}

function showElementTooltip(element) {
  // Remove existing tooltip
  hideElementTooltip();
  
  const tooltip = document.createElement("div");
  tooltip.id = "xpath-picker-tooltip";
  tooltip.style.cssText = `
    position: fixed;
    background: #0a84ff;
    color: white;
    padding: 6px 12px;
    border-radius: 6px;
    font-family: 'SF Mono', monospace;
    font-size: 12px;
    font-weight: 600;
    z-index: 2147483647;
    pointer-events: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    white-space: nowrap;
  `;
  
  const tagName = element.tagName.toLowerCase();
  const className = element.className ? `.${element.className.split(' ')[0]}` : '';
  const id = element.id ? `#${element.id}` : '';
  
  tooltip.textContent = `${tagName}${id}${className}`;
  document.body.appendChild(tooltip);
  
  // Position tooltip
  const rect = element.getBoundingClientRect();
  tooltip.style.left = `${rect.left}px`;
  tooltip.style.top = `${Math.max(rect.top - 35, 5)}px`;
}

function hideElementTooltip() {
  const tooltip = document.getElementById("xpath-picker-tooltip");
  if (tooltip) {
    tooltip.remove();
  }
}

function getXPath(element) {
  // Ignore picker elements
  if (!element || element.closest("#xpath-helper-panel")) {
    return "";
  }

  // Try multiple strategies and test which one works
  const strategies = [
    () => getXPathById(element),
    () => getXPathByUniqueClass(element),
    () => getXPathByAttributes(element),
    () => getXPathByPosition(element)
  ];

  for (const strategy of strategies) {
    const xpath = strategy();
    if (xpath && testXPath(xpath, element)) {
      return xpath;
    }
  }

  // Fallback to position-based
  return getXPathByPosition(element);
}

function getXPathById(element) {
  if (element.id) {
    return `//*[@id="${element.id}"]`;
  }
  return null;
}

function getXPathByUniqueClass(element) {
  if (!element.className || typeof element.className !== "string") {
    return null;
  }

  const classes = element.className.trim().split(/\s+/)
    .filter(c => c && !c.startsWith("xpath-helper"));
  
  if (classes.length === 0) return null;

  const tagName = element.nodeName.toLowerCase();
  
  // Try with first class using contains
  const firstClass = classes[0];
  let xpath = `//${tagName}[contains(@class, "${firstClass}")]`;
  
  // If not unique, try with more specificity
  if (!isXPathUnique(xpath, element)) {
    // Try with exact class match
    xpath = `//${tagName}[@class="${element.className}"]`;
    
    if (!isXPathUnique(xpath, element)) {
      // Try with parent context
      const parent = element.parentElement;
      if (parent && parent.id) {
        xpath = `//*[@id="${parent.id}"]//${tagName}[contains(@class, "${firstClass}")]`;
      } else {
        return null;
      }
    }
  }
  
  return xpath;
}

function getXPathByAttributes(element) {
  const tagName = element.nodeName.toLowerCase();
  const usefulAttrs = ["name", "type", "value", "href", "src", "role", "data-testid", "aria-label", "placeholder"];
  
  for (const attr of usefulAttrs) {
    if (element.hasAttribute(attr)) {
      const attrValue = element.getAttribute(attr);
      if (attrValue) {
        const xpath = `//${tagName}[@${attr}="${attrValue}"]`;
        if (isXPathUnique(xpath, element)) {
          return xpath;
        }
      }
    }
  }
  
  return null;
}

function getXPathByPosition(element) {
  if (element === document.body) {
    return "//body";
  }

  const paths = [];
  let current = element;

  while (current && current !== document.body) {
    const tagName = current.nodeName.toLowerCase();
    
    // Get position among siblings with same tag
    const parent = current.parentNode;
    if (!parent) break;
    
    const siblings = Array.from(parent.children).filter(
      el => el.nodeName === current.nodeName
    );
    
    let selector = tagName;
    if (siblings.length > 1) {
      const index = siblings.indexOf(current) + 1;
      selector = `${tagName}[${index}]`;
    }
    
    paths.unshift(selector);
    current = parent;
  }

  return "//" + paths.join("/");
}

function testXPath(xpath, expectedElement) {
  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue === expectedElement;
  } catch (e) {
    return false;
  }
}

function isXPathUnique(xpath, expectedElement) {
  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    return result.snapshotLength === 1 && result.snapshotItem(0) === expectedElement;
  } catch (e) {
    return false;
  }
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
  
  // Store element and original styles
  element.setAttribute('data-flash-outline', originalOutline || '');
  element.setAttribute('data-flash-bg', originalBg || '');
  flashedElements.push(element);

  const timeoutId = setTimeout(() => {
    element.style.outline = originalOutline;
    element.style.backgroundColor = originalBg;
    element.removeAttribute('data-flash-outline');
    element.removeAttribute('data-flash-bg');
    
    // Remove from flashedElements array
    const index = flashedElements.indexOf(element);
    if (index > -1) {
      flashedElements.splice(index, 1);
    }
  }, 1000);
  
  flashTimeouts.push(timeoutId);
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
  // Remove both highlight classes
  const highlighted = document.querySelectorAll(".xpath-helper-highlight, .xpath-picker-hover");
  highlighted.forEach((el) => {
    el.classList.remove("xpath-helper-highlight");
    el.classList.remove("xpath-picker-hover");
  });
  
  // Clear all flash animations
  clearFlashAnimations();
}

function clearFlashAnimations() {
  // Cancel all pending flash timeouts
  flashTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
  flashTimeouts = [];
  
  // Restore all flashed elements immediately
  flashedElements.forEach(element => {
    const originalOutline = element.getAttribute('data-flash-outline');
    const originalBg = element.getAttribute('data-flash-bg');
    
    if (originalOutline !== null) {
      element.style.outline = originalOutline || '';
      element.removeAttribute('data-flash-outline');
    }
    if (originalBg !== null) {
      element.style.backgroundColor = originalBg || '';
      element.removeAttribute('data-flash-bg');
    }
  });
  flashedElements = [];
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

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  removeAllHighlights();
  stopElementPicker();
  hidePanel();
});

// Auto-open panel on first install (optional)
// showPanel();
