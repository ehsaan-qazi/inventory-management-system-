// Customers page functionality
let allCustomers = [];
let currentEditingId = null;
let searchTimeout;
let suggestionsDiv;

document.addEventListener('DOMContentLoaded', async () => {
  await loadCustomers();
  checkURLParameters();
  setupLiveSearch();
});

// Load all customers
async function loadCustomers() {
  try {
    allCustomers = await window.electronAPI.getCustomers();
    displayCustomers(allCustomers);
  } catch (error) {
    console.error('Error loading customers:', error);
    showAlert('Failed to load customers', 'error');
  }
}

// Display customers in table
function displayCustomers(customers) {
  const tbody = document.getElementById('customersTable');
  
  if (customers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="no-data">No customers found. Add your first customer!</td></tr>';
    return;
  }

  tbody.innerHTML = customers.map(customer => {
    const balance = parseFloat(customer.balance);
    let balanceClass = 'zero';
    let statusText = 'Balanced';
    let statusClass = 'active';

    if (balance < 0) {
      balanceClass = 'outstanding';
      statusText = 'Outstanding';
      statusClass = 'unpaid';
    } else if (balance > 0) {
      balanceClass = 'prepaid';
      statusText = 'Prepaid';
      statusClass = 'paid';
    }

    return `
      <tr>
        <td>#${customer.id}</td>
        <td>${customer.name}</td>
        <td>${customer.phone || '-'}</td>
        <td>${customer.address || '-'}</td>
        <td class="balance ${balanceClass}">Rs.${Math.abs(balance).toFixed(2)}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td class="action-buttons">
          <button class="action-btn view" onclick="viewCustomer(${customer.id})" title="View Details">👁️</button>
          <button class="action-btn edit" onclick="editCustomer(${customer.id})" title="Edit">✏️</button>
          <button class="action-btn delete" onclick="deleteCustomer(${customer.id})" title="Delete">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

// Setup live search with autocomplete
function setupLiveSearch() {
  const searchInput = document.getElementById('searchInput');
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
      displayCustomers(allCustomers);
      return;
    }
    
    // Debounce - wait 300ms after user stops typing
    searchTimeout = setTimeout(async () => {
      await performLiveSearch(query);
    }, 300);
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
    displayCustomers(results);
    displaySuggestions(results, query);
  } catch (error) {
    console.error('Error searching customers:', error);
    showAlert('Error searching customers', 'error');
  }
}

// Display search suggestions
function displaySuggestions(results, query) {
  if (results.length === 0) {
    suggestionsDiv.style.display = 'none';
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
          <span>📱 ${highlightText(customer.phone || 'No phone', query)}</span>
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
  viewCustomer(customerId);
}

// Search customers (legacy - for button click)
async function searchCustomers() {
  const searchInput = document.getElementById('searchInput');
  const query = searchInput.value.trim();
  
  if (!query) {
    displayCustomers(allCustomers);
    suggestionsDiv.style.display = 'none';
    return;
  }

  await performLiveSearch(query);
}

// Check URL parameters for search or specific customer
function checkURLParameters() {
  const urlParams = new URLSearchParams(window.location.search);
  const searchQuery = urlParams.get('search');
  const customerId = urlParams.get('id');
  const filter = urlParams.get('filter');

  if (searchQuery) {
    document.getElementById('searchInput').value = searchQuery;
    searchCustomers();
  } else if (customerId) {
    viewCustomer(parseInt(customerId));
  } else if (filter === 'outstanding') {
    // Filter to show only customers with outstanding balance
    const outstandingCustomers = allCustomers.filter(c => c.balance < 0);
    displayCustomers(outstandingCustomers);
  }
}

// Open add customer modal
function openAddCustomerModal() {
  currentEditingId = null;
  document.getElementById('modalTitle').textContent = 'Add Customer';
  document.getElementById('customerForm').reset();
  document.getElementById('customerId').value = '';
  document.getElementById('customerBalance').value = '0';
  document.getElementById('customerModal').classList.add('active');
}

// Open edit customer modal
async function editCustomer(id) {
  try {
    const customer = await window.electronAPI.getCustomerById(id);
    if (!customer) {
      showAlert('Customer not found', 'error');
      return;
    }

    currentEditingId = id;
    document.getElementById('modalTitle').textContent = 'Edit Customer';
    document.getElementById('customerId').value = customer.id;
    document.getElementById('customerName').value = customer.name;
    document.getElementById('customerPhone').value = customer.phone || '';
    document.getElementById('customerAddress').value = customer.address || '';
    document.getElementById('customerBalance').value = customer.balance;
    document.getElementById('customerBalance').disabled = true; // Can't edit balance directly
    
    document.getElementById('customerModal').classList.add('active');
  } catch (error) {
    console.error('Error loading customer:', error);
    showAlert('Failed to load customer details', 'error');
  }
}

// Close customer modal
function closeCustomerModal() {
  document.getElementById('customerModal').classList.remove('active');
  document.getElementById('customerForm').reset();
  document.getElementById('customerBalance').disabled = false;
  currentEditingId = null;
}

// Save customer (add or update)
async function saveCustomer() {
  const name = document.getElementById('customerName').value.trim();
  const phone = document.getElementById('customerPhone').value.trim();
  const address = document.getElementById('customerAddress').value.trim();
  const balance = parseFloat(document.getElementById('customerBalance').value) || 0;

  if (!name) {
    showAlert('Please enter customer name', 'warning');
    return;
  }

  const customerData = { name, phone, address };

  try {
    if (currentEditingId) {
      // Update existing customer
      await window.electronAPI.updateCustomer(currentEditingId, customerData);
      showAlert('Customer updated successfully', 'success');
    } else {
      // Add new customer
      customerData.balance = balance;
      await window.electronAPI.addCustomer(customerData);
      showAlert('Customer added successfully', 'success');
    }

    closeCustomerModal();
    await loadCustomers();
  } catch (error) {
    console.error('Error saving customer:', error);
    showAlert('Failed to save customer', 'error');
  }
}

// Delete customer
async function deleteCustomer(id) {
  const customer = allCustomers.find(c => c.id === id);
  if (!customer) return;

  const confirmDelete = confirm(
    `Are you sure you want to delete "${customer.name}"?\n\nThis will also delete all associated transactions. This action cannot be undone.`
  );

  if (!confirmDelete) return;

  try {
    await window.electronAPI.deleteCustomer(id);
    showAlert('Customer deleted successfully', 'success');
    await loadCustomers();
  } catch (error) {
    console.error('Error deleting customer:', error);
    showAlert('Failed to delete customer', 'error');
  }
}

// View customer details
async function viewCustomer(id) {
  try {
    const customer = await window.electronAPI.getCustomerById(id);
    if (!customer) {
      showAlert('Customer not found', 'error');
      return;
    }

    // Populate customer details
    document.getElementById('viewCustomerName').textContent = customer.name;
    document.getElementById('viewCustomerPhone').textContent = customer.phone || 'N/A';
    document.getElementById('viewCustomerAddress').textContent = customer.address || 'N/A';
    
    const balance = parseFloat(customer.balance);
    let balanceText = `Rs.${Math.abs(balance).toFixed(2)}`;
    let balanceClass = 'zero';
    
    if (balance < 0) {
      balanceClass = 'outstanding';
      balanceText += ' (Outstanding)';
    } else if (balance > 0) {
      balanceClass = 'prepaid';
      balanceText += ' (Prepaid)';
    } else {
      balanceText += ' (Balanced)';
    }
    
    const balanceSpan = document.getElementById('viewCustomerBalance');
    balanceSpan.textContent = balanceText;
    balanceSpan.className = `balance ${balanceClass}`;
    
    const createdDate = new Date(customer.created_at);
    document.getElementById('viewCustomerDate').textContent = createdDate.toLocaleDateString('en-IN');

    // Load transaction history
    const transactions = await window.electronAPI.getTransactionsByCustomer(id);
    const transactionsBody = document.getElementById('customerTransactions');
    
    if (transactions.length === 0) {
      transactionsBody.innerHTML = '<tr><td colspan="4" class="no-data">No transactions yet</td></tr>';
    } else {
      transactionsBody.innerHTML = transactions.map(txn => {
        const date = new Date(txn.transaction_date);
        return `
          <tr>
            <td>${date.toLocaleDateString('en-IN')}</td>
            <td>Rs.${txn.total_amount.toFixed(2)}</td>
            <td>Rs.${txn.paid_amount.toFixed(2)}</td>
            <td><span class="status-badge ${txn.payment_status}">${txn.payment_status}</span></td>
          </tr>
        `;
      }).join('');
    }

    document.getElementById('viewCustomerModal').classList.add('active');
  } catch (error) {
    console.error('Error viewing customer:', error);
    showAlert('Failed to load customer details', 'error');
  }
}

// Close view customer modal
function closeViewCustomerModal() {
  document.getElementById('viewCustomerModal').classList.remove('active');
}

// Show alert message
function showAlert(message, type = 'info') {
  const alertContainer = document.getElementById('alertContainer');
  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  
  alertContainer.appendChild(alert);
  
  setTimeout(() => {
    alert.remove();
  }, 5000);
}

// Close modal when clicking outside
window.onclick = function(event) {
  const customerModal = document.getElementById('customerModal');
  const viewModal = document.getElementById('viewCustomerModal');
  
  if (event.target === customerModal) {
    closeCustomerModal();
  }
  if (event.target === viewModal) {
    closeViewCustomerModal();
  }
}

