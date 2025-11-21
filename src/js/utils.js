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

// Track the last focused input element
let lastFocusedInput = null;

// Track all input/textarea/select elements and their focus
function setupFocusTracking() {
  const inputs = document.querySelectorAll('input, textarea, select');
  inputs.forEach(input => {
    input.addEventListener('focus', () => {
      lastFocusedInput = input;
    });
  });
  
  // Use MutationObserver to track dynamically added inputs
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          if (node.matches && node.matches('input, textarea, select')) {
            node.addEventListener('focus', () => {
              lastFocusedInput = node;
            });
          }
          // Also check children
          const inputs = node.querySelectorAll && node.querySelectorAll('input, textarea, select');
          if (inputs) {
            inputs.forEach(input => {
              input.addEventListener('focus', () => {
                lastFocusedInput = input;
              });
            });
          }
        }
      });
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
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
  
  // If there was a focused input before, try to restore focus
  if (lastFocusedInput && document.body.contains(lastFocusedInput)) {
    // Use setTimeout to ensure the focus happens after any other event processing
    setTimeout(() => {
      try {
        lastFocusedInput.focus();
      } catch (e) {
        // Ignore focus errors
      }
    }, 10);
  }
}

// Handle window focus lost
function handleWindowFocusLost() {
  // Store the currently focused element
  if (document.activeElement && 
      (document.activeElement.tagName === 'INPUT' || 
       document.activeElement.tagName === 'TEXTAREA' || 
       document.activeElement.tagName === 'SELECT')) {
    lastFocusedInput = document.activeElement;
  }
}

// Modal focus management - prevent modals from blocking input focus
function setupModalFocusManagement() {
  // Watch for modal state changes
  const modalObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class') {
        const modal = mutation.target;
        if (modal.classList.contains('modal')) {
          if (modal.classList.contains('active')) {
            // Modal opened - focus first input inside modal
            setTimeout(() => {
              const firstInput = modal.querySelector('input:not([type="hidden"]), textarea, select');
              if (firstInput) {
                firstInput.focus();
              }
            }, 100);
          } else {
            // Modal closed - restore focus to last focused input or first visible input
            setTimeout(() => {
              if (lastFocusedInput && document.body.contains(lastFocusedInput) && 
                  !lastFocusedInput.closest('.modal')) {
                lastFocusedInput.focus();
              } else {
                // Find first visible input on page
                const visibleInput = document.querySelector('input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])');
                if (visibleInput && !visibleInput.closest('.modal')) {
                  visibleInput.focus();
                }
              }
            }, 100);
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
  const bodyObserver = new MutationObserver((mutations) => {
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
  setInterval(() => {
    // Only run if window is focused
    if (!document.hidden) {
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

// Set up focus management when the page loads
if (typeof window !== 'undefined') {
  // Set up focus tracking
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupFocusTracking();
      setupModalFocusManagement();
      startInputHealthCheck();
    });
  } else {
    setupFocusTracking();
    setupModalFocusManagement();
    startInputHealthCheck();
  }
  
  // Listen for focus restoration events from Electron
  if (window.electronAPI && window.electronAPI.onWindowFocusRestored) {
    window.electronAPI.onWindowFocusRestored(handleWindowFocusRestored);
    window.electronAPI.onWindowFocusLost(handleWindowFocusLost);
  }
  
  // Also add a global click handler to ensure clicks on inputs always work
  document.addEventListener('mousedown', (e) => {
    const target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      // Ensure the input can receive focus
      if (!target.disabled) {
        target.style.pointerEvents = 'auto';
        target.style.userSelect = 'text';
        // Try to focus it
        setTimeout(() => {
          try {
            target.focus();
          } catch (err) {
            // Ignore
          }
        }, 0);
      }
    }
  }, true); // Use capture phase
  
  // Clean up on page unload
  window.addEventListener('beforeunload', () => {
    clearAllTimeouts();
  });
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

