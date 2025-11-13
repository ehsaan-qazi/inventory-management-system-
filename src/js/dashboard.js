// Dashboard functionality
let searchTimeout;
let suggestionsDiv;

document.addEventListener('DOMContentLoaded', async () => {
  await loadDashboardStats();
  await loadRecentTransactions();
  setupSearch();
});

// Load dashboard statistics
async function loadDashboardStats() {
  try {
    const stats = await window.electronAPI.getDashboardStats();
    
    // Update metric cards
    document.getElementById('todaySales').textContent = `Rs.${stats.todaySales.toFixed(2)}`;
    document.getElementById('pendingBills').textContent = stats.pendingBillsCount;
    document.getElementById('totalCustomers').textContent = stats.totalCustomers;
    document.getElementById('fishCategories').textContent = stats.activeFishCategories;
    
    // Make metric cards clickable
    setupMetricCardClicks();
  } catch (error) {
    console.error('Error loading dashboard stats:', error);
    showError('Failed to load dashboard statistics');
  }
}

// Setup metric card navigation
function setupMetricCardClicks() {
  // Navigate to reports page for today's sales
  document.querySelector('.metric-card.blue').style.cursor = 'pointer';
  document.querySelector('.metric-card.blue').onclick = function() {
    window.location.href = 'pages/reports.html';
  };
  
  // Navigate to customers page filtered by outstanding
  document.querySelector('.metric-card.yellow').style.cursor = 'pointer';
  document.querySelector('.metric-card.yellow').onclick = function() {
    window.location.href = 'pages/customers.html?filter=outstanding';
  };
  
  // Navigate to customers page
  document.querySelector('.metric-card.purple').style.cursor = 'pointer';
  document.querySelector('.metric-card.purple').onclick = function() {
    window.location.href = 'pages/customers.html';
  };
  
  // Navigate to fish categories page
  document.querySelector('.metric-card.green').style.cursor = 'pointer';
  document.querySelector('.metric-card.green').onclick = function() {
    window.location.href = 'pages/fish-categories.html';
  };
}

// Load recent transactions
async function loadRecentTransactions() {
  try {
    const result = await window.electronAPI.getTransactions({ limit: 10 });
    const transactions = result.data || result; // Handle both paginated and non-paginated
    const tbody = document.getElementById('recentTransactions');
    
    if (transactions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="no-data">No transactions yet. Create your first transaction!</td></tr>';
      return;
    }

    tbody.innerHTML = transactions.map(txn => {
      const date = new Date(txn.transaction_date);
      const formattedDate = date.toLocaleDateString('en-IN');
      const statusClass = txn.payment_status;
      
      return `
        <tr>
          <td>#${txn.id}</td>
          <td>${txn.customer_name}</td>
          <td>${formattedDate}</td>
          <td>${txn.transaction_time}</td>
          <td>Rs.${txn.total_amount.toFixed(2)}</td>
          <td><span class="status-badge ${statusClass}">${txn.payment_status}</span></td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading recent transactions:', error);
    showError('Failed to load transactions');
  }
}

// Setup search functionality with autocomplete
function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.querySelector('.search-btn');
  const searchBar = searchInput.closest('.search-bar');

  // Create suggestions dropdown
  suggestionsDiv = document.createElement('div');
  suggestionsDiv.className = 'search-suggestions';
  searchBar.appendChild(suggestionsDiv);

  // Live search on input
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    
    if (!query) {
      suggestionsDiv.style.display = 'none';
      return;
    }
    
    // Debounce - wait 300ms after user stops typing
    searchTimeout = setTimeout(async () => {
      await performLiveSearch(query);
    }, 300);
  });

  searchBtn.addEventListener('click', performSearch);
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });

  // Hide suggestions when clicking outside
  document.addEventListener('click', (e) => {
    if (!searchBar.contains(e.target)) {
      suggestionsDiv.style.display = 'none';
    }
  });
}

// Perform live search and show suggestions
async function performLiveSearch(query) {
  try {
    const results = await window.electronAPI.searchCustomers(query);
    displaySuggestions(results, query);
  } catch (error) {
    console.error('Error searching customers:', error);
  }
}

// Display search suggestions
function displaySuggestions(results, query) {
  if (results.length === 0) {
    suggestionsDiv.innerHTML = '<div style="padding: 15px; text-align: center; color: #999;">No customers found</div>';
    suggestionsDiv.style.display = 'block';
    return;
  }
  
  const queryLower = query.toLowerCase();
  
  suggestionsDiv.innerHTML = results.slice(0, 5).map(customer => {
    const balance = parseFloat(customer.balance);
    let balanceColor = '#666';
    let balanceText = 'Balanced';
    
    if (balance < 0) {
      balanceColor = '#d32f2f';
      balanceText = `Outstanding: Rs.${Math.abs(balance).toFixed(2)}`;
    } else if (balance > 0) {
      balanceColor = '#388e3c';
      balanceText = `Prepaid: Rs.${balance.toFixed(2)}`;
    } else {
      balanceText = 'Balance: Rs.0.00';
    }
    
    // Highlight matching text
    const highlightText = (text, query) => {
      if (!text) return '';
      const index = text.toLowerCase().indexOf(queryLower);
      if (index === -1) return text;
      const before = text.substring(0, index);
      const match = text.substring(index, index + query.length);
      const after = text.substring(index + query.length);
      return `${before}<span class="suggestion-highlight">${match}</span>${after}`;
    };
    
    return `
      <div class="suggestion-item" onclick="selectCustomerFromSuggestion(${customer.id})">
        <div class="suggestion-name">${highlightText(customer.name, query)}</div>
        <div class="suggestion-details">
          <span><img src="assets/mobile.png" alt="Phone" style="width: 14px; height: 14px; vertical-align: middle;"> ${highlightText(customer.phone || 'No phone', query)}</span>
          <span style="color: ${balanceColor};">${balanceText}</span>
        </div>
      </div>
    `;
  }).join('');
  
  suggestionsDiv.style.display = 'block';
}

// Select customer from suggestion
function selectCustomerFromSuggestion(customerId) {
  suggestionsDiv.style.display = 'none';
  window.location.href = `pages/customers.html?id=${customerId}`;
}

async function performSearch() {
  const searchInput = document.getElementById('searchInput');
  const query = searchInput.value.trim();
  
  if (!query) {
    return;
  }

  try {
    const results = await window.electronAPI.searchCustomers(query);
    
    if (results.length === 0) {
      alert('No customers found matching your search.');
      return;
    }

    // If single result, go to customer page with ID
    if (results.length === 1) {
      window.location.href = `pages/customers.html?id=${results[0].id}`;
    } else {
      // Multiple results, go to customers page with search query
      window.location.href = `pages/customers.html?search=${encodeURIComponent(query)}`;
    }
  } catch (error) {
    console.error('Error searching customers:', error);
    alert('Error performing search');
  }
}

// Utility function to show errors
function showError(message) {
  const alert = document.createElement('div');
  alert.className = 'alert alert-error';
  alert.textContent = message;
  
  const content = document.querySelector('.content');
  content.insertBefore(alert, content.firstChild);
  
  setTimeout(() => {
    alert.remove();
  }, 5000);
}

