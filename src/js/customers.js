// Customers page functionality (Issues 11,12,17 - Module pattern)
(function() {
  'use strict';
  
  let allCustomers = [];
  let currentEditingId = null;
  let searchTimeout;
  let suggestionsDiv;
  
  // Pagination state
  let currentPage = 1;
  let pageSize = 50;
  let totalPages = 1;
  let totalCustomers = 0;

  document.addEventListener('DOMContentLoaded', async () => {
    await loadCustomers();
    checkURLParameters();
    setupLiveSearch();
  });
  
  // Clean up on page unload (Issue 11, 17)
  window.addEventListener('beforeunload', () => {
    if (searchTimeout) clearTimeout(searchTimeout);
  });

// Load all customers with pagination
async function loadCustomers() {
  try {
    const offset = (currentPage - 1) * pageSize;
    const result = await window.electronAPI.getCustomers({
      limit: pageSize,
      offset: offset
    });
    
    // Handle paginated response
    if (result.data) {
      allCustomers = result.data;
      totalCustomers = result.total;
      totalPages = Math.ceil(result.total / pageSize);
    } else {
      // Fallback for non-paginated response
      allCustomers = result;
      totalCustomers = result.length;
      totalPages = 1;
    }
    
    displayCustomers(allCustomers);
    updatePaginationUI();
  } catch (error) {
    console.error('Error loading customers:', error);
    showAlert('Failed to load customers', 'error');
  }
}

// Update pagination UI
function updatePaginationUI() {
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const pageInfo = document.getElementById('pageInfo');
  
  if (prevBtn && nextBtn && pageInfo) {
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage >= totalPages;
    pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${totalCustomers} customers)`;
  }
}

// Pagination controls
function nextPage() {
  if (currentPage < totalPages) {
    currentPage++;
    loadCustomers();
  }
}

function previousPage() {
  if (currentPage > 1) {
    currentPage--;
    loadCustomers();
  }
}

function changePageSize() {
  pageSize = parseInt(document.getElementById('pageSize').value);
  currentPage = 1; // Reset to first page
  loadCustomers();
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
          <button class="action-btn edit" onclick="editCustomer(${customer.id})" title="Edit"><img src="../assets/edit.png" alt="Edit" style="width: 16px; height: 16px;"></button>
          <button class="action-btn delete" onclick="deleteCustomer(${customer.id})" title="Delete"><img src="../assets/delete.png" alt="Delete" style="width: 16px; height: 16px;"></button>
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
  
  // Hide suggestions when clicking outside (use capture phase to avoid conflicts)
  document.addEventListener('click', (e) => {
    if (!searchBar.contains(e.target) && !suggestionsDiv.contains(e.target)) {
      suggestionsDiv.style.display = 'none';
    }
  }, true); // Use capture phase
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
          <span><img src="../assets/mobile.png" alt="Phone" style="width: 14px; height: 14px; vertical-align: middle;"> ${highlightText(customer.phone || 'No phone', query)}</span>
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
async function saveCustomer(event) {
  // Get button for loading state (Issue 16)
  const saveBtn = event ? event.target : document.querySelector('.btn-primary');
  setButtonLoading(saveBtn, true);
  
  try {
    const name = document.getElementById('customerName').value.trim();
    const phone = document.getElementById('customerPhone').value.trim();
    const address = document.getElementById('customerAddress').value.trim();
    const balance = parseFloat(document.getElementById('customerBalance').value) || 0;

    // Validate customer name (Issue 4, 22)
    const nameValidation = Validators.customerName(name);
    if (!nameValidation.valid) {
      showAlert(nameValidation.error, 'warning');
      return;
    }

    // Validate phone number (Issue 4, 22)
    const phoneValidation = Validators.phoneNumber(phone);
    if (!phoneValidation.valid) {
      showAlert(phoneValidation.error, 'warning');
      return;
    }

    // Validate address (Issue 4)
    const addressValidation = Validators.address(address);
    if (!addressValidation.valid) {
      showAlert(addressValidation.error, 'warning');
      return;
    }

    const customerData = { 
      name: nameValidation.value, 
      phone: phoneValidation.value, 
      address: addressValidation.value 
    };

    if (currentEditingId) {
      // Update existing customer
      await window.electronAPI.updateCustomer(currentEditingId, customerData);
      showAlert('Customer updated successfully', 'success');
    } else {
      // Add new customer
      customerData.balance = roundMoney(balance); // Issue 2
      await window.electronAPI.addCustomer(customerData);
      showAlert('Customer added successfully', 'success');
    }

    closeCustomerModal();
    await loadCustomers();
  } catch (error) {
    // Better error messages (Issue 25, 28)
    let errorMessage = 'Failed to save customer';
    if (error.message) {
      if (error.message.includes('already exists')) {
        errorMessage = error.message; // Show duplicate error
      } else if (error.message.includes('UNIQUE constraint')) {
        errorMessage = 'A customer with this name or phone already exists';
      } else {
        errorMessage = `Error: ${error.message}`;
      }
    }
    showAlert(errorMessage, 'error');
  } finally {
    setButtonLoading(saveBtn, false); // Issue 16
  }
}

// Make function available globally for onclick
window.saveCustomer = saveCustomer;

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
      transactionsBody.innerHTML = '<tr><td colspan="5" class="no-data">No transactions yet</td></tr>';
    } else {
      transactionsBody.innerHTML = transactions.map(txn => {
        const date = new Date(txn.transaction_date);
        return `
          <tr class="transaction-row-clickable" onclick="viewTransactionReceipt(${txn.id})">
            <td>${date.toLocaleDateString('en-IN')}</td>
            <td>Rs.${txn.total_amount.toFixed(2)}</td>
            <td>Rs.${txn.paid_amount.toFixed(2)}</td>
            <td><span class="status-badge ${txn.payment_status}">${txn.payment_status}</span></td>
            <td class="action-buttons">
              <button class="action-btn edit" onclick="event.stopPropagation(); editTransactionFromCustomer(${txn.id})" title="Edit">
                <img src="../assets/edit.png" alt="Edit" style="width: 16px; height: 16px;">
              </button>
            </td>
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
  const editModal = document.getElementById('editTransactionModal');
  const receiptModal = document.getElementById('viewReceiptModal');
  
  // Close stacked modals first (higher z-index)
  if (event.target === editModal) {
    closeEditTransactionModal();
  }
  if (event.target === receiptModal) {
    closeViewReceiptModal();
  }
  // Then base modals
  if (event.target === customerModal) {
    closeCustomerModal();
  }
  if (event.target === viewModal) {
    closeViewCustomerModal();
  }
};

// Edit transaction from customer modal
let editingTransactionId = null;
let editingCustomerId = null;

async function editTransactionFromCustomer(txnId) {
  try {
    const txn = await window.electronAPI.getTransactionById(txnId);
    if (!txn) {
      showAlert('Transaction not found', 'error');
      return;
    }
    
    editingTransactionId = txnId;
    editingCustomerId = txn.customer_id;
    
    // Populate modal
    document.getElementById('editTxnId').textContent = txn.id;
    document.getElementById('editCustomerName').value = txn.customer_name;
    document.getElementById('editTotalAmount').value = formatMoney(txn.total_amount);
    document.getElementById('editPaidAmount').value = txn.paid_amount.toFixed(2);
    document.getElementById('editNotes').value = txn.notes || '';
    
    // Show modal
    document.getElementById('editTransactionModal').classList.add('active');
  } catch (error) {
    console.error('Error loading transaction:', error);
    showAlert('Failed to load transaction details', 'error');
  }
}

function closeEditTransactionModal() {
  document.getElementById('editTransactionModal').classList.remove('active');
  editingTransactionId = null;
  editingCustomerId = null;
}

async function saveEditedTransaction() {
  if (!editingTransactionId) return;
  
  try {
    const paidAmount = parseFloat(document.getElementById('editPaidAmount').value) || 0;
    const notes = document.getElementById('editNotes').value.trim();
    
    await window.electronAPI.updateTransaction(editingTransactionId, {
      paid_amount: paidAmount,
      notes: notes
    });
    
    showAlert('Transaction updated successfully', 'success');
    closeEditTransactionModal();
    
    // Refresh customer view
    if (editingCustomerId) {
      await viewCustomer(editingCustomerId);
    }
  } catch (error) {
    console.error('Error updating transaction:', error);
    showAlert('Failed to update transaction', 'error');
  }
}

// View transaction receipt
async function viewTransactionReceipt(txnId) {
  try {
    const txn = await window.electronAPI.getTransactionById(txnId);
    if (!txn) {
      showAlert('Transaction not found', 'error');
      return;
    }
    
    const date = new Date(txn.transaction_date);
    const receiptContent = document.getElementById('receiptContent');
    
    receiptContent.innerHTML = `
      <div style="font-family: monospace; padding: 20px; background: white;">
        <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px;">
          <h2 style="margin: 0;">FishMarket</h2>
          <p style="margin: 5px 0;">Fish Market Inventory System</p>
        </div>
        
        <div style="margin-bottom: 20px;">
          <p><strong>Bill #:</strong> ${txn.id}</p>
          <p><strong>Date:</strong> ${date.toLocaleDateString('en-IN')} ${txn.transaction_time}</p>
          <p><strong>Customer:</strong> ${txn.customer_name}</p>
          <p><strong>Phone:</strong> ${txn.customer_phone || 'N/A'}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="border-bottom: 2px solid #000;">
              <th style="text-align: left; padding: 8px;">Item</th>
              <th style="text-align: right; padding: 8px;">Weight</th>
              <th style="text-align: right; padding: 8px;">Price/Maund</th>
              <th style="text-align: right; padding: 8px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${txn.items.map(item => `
              <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 8px;">${item.fish_name}</td>
                <td style="text-align: right; padding: 8px;">${formatWeight(item.weight_kg)}</td>
                <td style="text-align: right; padding: 8px;">Rs.${item.price_per_maund.toFixed(2)}</td>
                <td style="text-align: right; padding: 8px;">Rs.${item.subtotal.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="text-align: right; margin-bottom: 20px;">
          <p style="font-size: 18px; margin: 5px 0;"><strong>Total: Rs.${txn.total_amount.toFixed(2)}</strong></p>
          <p style="margin: 5px 0;">Paid: Rs.${txn.paid_amount.toFixed(2)}</p>
          <p style="margin: 5px 0; ${txn.balance_change < 0 ? 'color: red;' : txn.balance_change > 0 ? 'color: green;' : ''}">
            ${txn.balance_change < 0 ? 'Outstanding' : txn.balance_change > 0 ? 'Excess Paid' : 'Balanced'}: 
            Rs.${Math.abs(txn.balance_change).toFixed(2)}
          </p>
          <p style="margin: 5px 0; font-weight: bold;">
            Customer Balance: Rs.${Math.abs(txn.balance_after).toFixed(2)} 
            ${txn.balance_after < 0 ? '(Outstanding)' : txn.balance_after > 0 ? '(Prepaid)' : '(Balanced)'}
          </p>
        </div>

        ${txn.notes ? `<div style="margin-top: 20px; padding: 10px; background: #f5f5f5;"><strong>Notes:</strong> ${txn.notes}</div>` : ''}

        <div style="margin-top: 30px; text-align: center; border-top: 2px solid #000; padding-top: 10px;">
          <p style="margin: 0;">Thank you for your business!</p>
        </div>
      </div>
    `;
    
    document.getElementById('viewReceiptModal').classList.add('active');
  } catch (error) {
    console.error('Error viewing transaction:', error);
    showAlert('Failed to load transaction receipt', 'error');
  }
}

function closeViewReceiptModal() {
  document.getElementById('viewReceiptModal').classList.remove('active');
}

function printReceipt() {
  const receiptContent = document.getElementById('receiptContent').innerHTML;
  const printWindow = window.open('', '', 'height=600,width=800');
  
  printWindow.document.write('<html><head><title>Print Receipt</title>');
  printWindow.document.write('</head><body>');
  printWindow.document.write(receiptContent);
  printWindow.document.write('</body></html>');
  
  printWindow.document.close();
  printWindow.print();
}

// Helper function to format weight
function formatWeight(totalKg) {
  const KG_PER_MAUND = 40;
  if (totalKg < KG_PER_MAUND) {
    return `${totalKg.toFixed(2)} KG`;
  }
  const maunds = Math.floor(totalKg / KG_PER_MAUND);
  const kg = totalKg % KG_PER_MAUND;
  if (kg === 0) {
    return `${maunds} Maund`;
  }
  return `${maunds} Maund ${kg.toFixed(2)} KG`;
}

// Expose functions needed by HTML onclick handlers
window.openAddCustomerModal = openAddCustomerModal;
window.editCustomer = editCustomer;
window.deleteCustomer = deleteCustomer;
window.viewCustomer = viewCustomer;
window.closeCustomerModal = closeCustomerModal;
window.closeViewCustomerModal = closeViewCustomerModal;
window.searchCustomers = searchCustomers;
window.selectCustomerFromSuggestion = selectCustomerFromSuggestion;
window.nextPage = nextPage;
window.previousPage = previousPage;
window.changePageSize = changePageSize;
window.editTransactionFromCustomer = editTransactionFromCustomer;
window.closeEditTransactionModal = closeEditTransactionModal;
window.saveEditedTransaction = saveEditedTransaction;
window.viewTransactionReceipt = viewTransactionReceipt;
window.closeViewReceiptModal = closeViewReceiptModal;
window.printReceipt = printReceipt;

})(); // End of IIFE (Issue 12)

