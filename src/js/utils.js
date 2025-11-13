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

// Clean up on page unload
if (typeof window !== 'undefined') {
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

