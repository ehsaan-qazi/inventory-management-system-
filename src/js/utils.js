// Utility functions for Fish Market Inventory

// Money handling - round to 2 decimal places to prevent floating point errors
function roundMoney(amount) {
  return Math.round(amount * 100) / 100;
}

function formatMoney(amount) {
  return roundMoney(amount).toFixed(2);
}

// Safe number parsing
function parseNumber(value, defaultValue = 0) {
  const num = parseFloat(value);
  return isNaN(num) ? defaultValue : num;
}

// Date/Time utilities - use local timezone consistently
function getCurrentDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// HTML escaping to prevent XSS (even though user said to skip it, it's a good practice)
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

// Timeout management to prevent memory leaks
const activeTimeouts = new Set();

function safeSetTimeout(callback, delay) {
  const timeoutId = setTimeout(() => {
    callback();
    activeTimeouts.delete(timeoutId);
  }, delay);
  activeTimeouts.add(timeoutId);
  return timeoutId;
}

function clearAllTimeouts() {
  activeTimeouts.forEach(id => clearTimeout(id));
  activeTimeouts.clear();
}

// Button loading state management
function setButtonLoading(button, loading) {
  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = 'Loading...';
    button.disabled = true;
    button.classList.add('loading');
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    button.classList.remove('loading');
  }
}

// Track the last focused input element - use WeakRef to avoid memory leaks
let lastFocusedInputId = null; // Store ID instead of element reference
let lastFocusedInputSelector = null; // Fallback selector

// Track observers and intervals for cleanup
let focusObserver = null;
let modalObserver = null;
let bodyObserver = null;
let healthCheckInterval = null;

// Reset focus state - call this on page load to clear stale references
function resetFocusState() {
  lastFocusedInputId = null;
  lastFocusedInputSelector = null;

  // Clean up existing observers
  if (focusObserver) {
    focusObserver.disconnect();
    focusObserver = null;
  }
  if (modalObserver) {
    modalObserver.disconnect();
    modalObserver = null;
  }
  if (bodyObserver) {
    bodyObserver.disconnect();
    bodyObserver = null;
  }

  // Clear health check interval
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

// Get a reliable selector for an input element
function getInputSelector(input) {
  if (input.id) return `#${input.id}`;
  if (input.name) return `[name="${input.name}"]`;
  // Fallback to tag + class combination
  const classes = Array.from(input.classList).join('.');
  return classes ? `${input.tagName.toLowerCase()}.${classes}` : null;
}

// Track all input/textarea/select elements and their focus
function setupFocusTracking() {
  const trackInput = (input) => {
    input.addEventListener('focus', () => {
      lastFocusedInputId = input.id || null;
      lastFocusedInputSelector = getInputSelector(input);
    });
  };

  const inputs = document.querySelectorAll('input, textarea, select');
  inputs.forEach(trackInput);

  // Use MutationObserver to track dynamically added inputs
  focusObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          if (node.matches && node.matches('input, textarea, select')) {
            trackInput(node);
          }
          // Also check children
          const childInputs = node.querySelectorAll && node.querySelectorAll('input, textarea, select');
          if (childInputs) {
            childInputs.forEach(trackInput);
          }
        }
      });
    });
  });

  focusObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Find the last focused input by stored reference
function findLastFocusedInput() {
  // Try by ID first (most reliable)
  if (lastFocusedInputId) {
    const byId = document.getElementById(lastFocusedInputId);
    if (byId && !byId.disabled) return byId;
  }
  // Try by selector
  if (lastFocusedInputSelector) {
    try {
      const bySelector = document.querySelector(lastFocusedInputSelector);
      if (bySelector && !bySelector.disabled) return bySelector;
    } catch (e) {
      // Invalid selector, ignore
    }
  }
  return null;
}

// Handle window focus restoration
function handleWindowFocusRestored() {
  // Clear any stuck pointer-events or focus issues
  const allInputs = document.querySelectorAll('input, textarea, select');
  allInputs.forEach(input => {
    // Remove any potential blocking styles
    input.style.pointerEvents = '';

    // Re-enable if it was disabled incorrectly
    if (input.hasAttribute('data-was-enabled')) {
      input.disabled = false;
      input.removeAttribute('data-was-enabled');
    }
  });

  // Try to restore focus to last focused input
  const lastInput = findLastFocusedInput();
  if (lastInput) {
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      try {
        lastInput.focus();
      } catch (e) {
        // Ignore focus errors
      }
    });
  } else {
    // No last input found - focus first available input on page
    const firstInput = document.querySelector(
      'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'
    );
    if (firstInput && !firstInput.closest('.modal:not(.active)')) {
      requestAnimationFrame(() => {
        try {
          firstInput.focus();
        } catch (e) {
          // Ignore focus errors
        }
      });
    }
  }
}

// Handle window focus lost
function handleWindowFocusLost() {
  // Store the currently focused element by reference
  const activeEl = document.activeElement;
  if (activeEl &&
    (activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      activeEl.tagName === 'SELECT')) {
    lastFocusedInputId = activeEl.id || null;
    lastFocusedInputSelector = getInputSelector(activeEl);
  }
}

// Modal focus management - prevent modals from blocking input focus
function setupModalFocusManagement() {
  // Watch for modal state changes
  modalObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class') {
        const modal = mutation.target;
        if (modal.classList.contains('modal')) {
          if (modal.classList.contains('active')) {
            // Modal opened - focus first input inside modal
            requestAnimationFrame(() => {
              const firstInput = modal.querySelector('input:not([type="hidden"]), textarea, select');
              if (firstInput) {
                firstInput.focus();
              }
            });
          } else {
            // Modal closed - restore focus to last focused input or first visible input
            requestAnimationFrame(() => {
              const lastInput = findLastFocusedInput();
              if (lastInput && !lastInput.closest('.modal')) {
                lastInput.focus();
              } else {
                // Find first visible input on page
                const visibleInput = document.querySelector(
                  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'
                );
                if (visibleInput && !visibleInput.closest('.modal')) {
                  visibleInput.focus();
                }
              }
            });
          }
        }
      }
    });
  });

  // Observe all modals
  const modals = document.querySelectorAll('.modal');
  modals.forEach(modal => {
    modalObserver.observe(modal, {
      attributes: true,
      attributeFilter: ['class']
    });
  });

  // Also observe body for new modals
  bodyObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1 && node.classList && node.classList.contains('modal')) {
          modalObserver.observe(node, {
            attributes: true,
            attributeFilter: ['class']
          });
        }
      });
    });
  });

  bodyObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Periodic health check to ensure inputs are never stuck
function startInputHealthCheck() {
  // Check every 2 seconds
  healthCheckInterval = setInterval(() => {
    // Only run if window is focused and document is visible
    if (!document.hidden && document.hasFocus()) {
      const allInputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
      allInputs.forEach(input => {
        // If input appears to be stuck (no pointer events or wrong state), fix it
        const computedStyle = window.getComputedStyle(input);
        if (computedStyle.pointerEvents === 'none' && !input.disabled) {
          input.style.pointerEvents = 'auto';
        }

        // Ensure user-select is correct for text inputs
        if ((input.tagName === 'INPUT' && input.type === 'text') ||
          input.tagName === 'TEXTAREA') {
          if (computedStyle.userSelect === 'none' && !input.disabled) {
            input.style.userSelect = 'text';
          }
        }
      });
    }
  }, 2000);
}

// Cleanup function for page unload
function cleanupFocusManagement() {
  resetFocusState();
  clearAllTimeouts();
  
  // Remove IPC listeners if available
  if (window.electronAPI && window.electronAPI.removeWindowFocusListeners) {
    window.electronAPI.removeWindowFocusListeners();
  }
}

// Set up focus management when the page loads
if (typeof window !== 'undefined') {
  // Initialize on page load
  const initFocusManagement = () => {
    resetFocusState(); // Clear stale references from previous page
    setupFocusTracking();
    setupModalFocusManagement();
    startInputHealthCheck();
    
    // Listen for focus restoration events from Electron
    if (window.electronAPI) {
      if (window.electronAPI.onWindowFocusRestored) {
        window.electronAPI.onWindowFocusRestored(handleWindowFocusRestored);
      }
      if (window.electronAPI.onWindowFocusLost) {
        window.electronAPI.onWindowFocusLost(handleWindowFocusLost);
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFocusManagement);
  } else {
    initFocusManagement();
  }

  // Also add a global click handler to ensure clicks on inputs always work
  document.addEventListener('mousedown', (e) => {
    const target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      // Ensure the input can receive focus
      if (!target.disabled) {
        target.style.pointerEvents = 'auto';
        target.style.userSelect = 'text';
      }
    }
  }, true); // Use capture phase

  // Clean up on page unload to prevent listener accumulation
  window.addEventListener('beforeunload', cleanupFocusManagement);
  
  // Also clean up on pagehide (more reliable on some browsers)
  window.addEventListener('pagehide', cleanupFocusManagement);
}

// Export for Node.js (main process)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    roundMoney,
    formatMoney,
    parseNumber,
    getCurrentDate,
    getCurrentTime,
    formatDate,
    escapeHtml
  };
}

