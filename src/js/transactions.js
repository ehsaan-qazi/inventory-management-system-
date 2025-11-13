// Transactions page functionality
let customers = [];
let fishCategories = [];
let billItems = [];
let currentCustomer = null;
let searchTimeout;
let customerSuggestionsDiv;

// Pagination and filter state
let currentTransPage = 1;
let transPageSize = 50;
let totalTransPages = 1;
let totalTransactions = 0;
let currentFilters = {
  customerName: '',
  paymentStatus: ''
};

// Constants for Maund conversion
const KG_PER_MAUND = 40;

// Utility functions for Maund/KG conversion
function kgToMaundAndKg(totalKg) {
  const maunds = Math.floor(totalKg / KG_PER_MAUND);
  const remainingKg = totalKg % KG_PER_MAUND;
  return { maunds, kg: remainingKg };
}

function maundAndKgToKg(maunds, kg) {
  return (maunds * KG_PER_MAUND) + kg;
}

function formatWeight(totalKg) {
  if (totalKg < KG_PER_MAUND) {
    return `${totalKg.toFixed(2)} KG`;
  }
  const { maunds, kg } = kgToMaundAndKg(totalKg);
  if (kg === 0) {
    return `${maunds} Maund`;
  }
  return `${maunds} Maund ${kg.toFixed(2)} KG`;
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadCustomers();
  await loadFishCategories();
  await loadTransactions();
  setupCustomerSearch();
});

// Load customers
async function loadCustomers() {
  try {
    customers = await window.electronAPI.getCustomers();
  } catch (error) {
    console.error('Error loading customers:', error);
    showAlert('Failed to load customers', 'error');
  }
}

// Setup customer search with autocomplete
function setupCustomerSearch() {
  const searchInput = document.getElementById('customerSearch');
  customerSuggestionsDiv = document.getElementById('customerSuggestions');
  
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    
    if (!query) {
      customerSuggestionsDiv.style.display = 'none';
      clearSelectedCustomer();
      return;
    }
    
    // Debounce
    searchTimeout = setTimeout(() => {
      searchCustomersLocal(query);
    }, 300);
  });
  
  // Hide suggestions when clicking outside
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !customerSuggestionsDiv.contains(e.target)) {
      customerSuggestionsDiv.style.display = 'none';
    }
  });
}

// Search customers locally (already loaded)
function searchCustomersLocal(query) {
  const queryLower = query.toLowerCase();
  const results = customers.filter(c => 
    c.name.toLowerCase().includes(queryLower) || 
    (c.phone && c.phone.includes(query)) ||
    c.id.toString() === query
  );
  
  displayCustomerSuggestions(results, query);
}

// Display customer suggestions
function displayCustomerSuggestions(results, query) {
  if (results.length === 0) {
    customerSuggestionsDiv.innerHTML = '<div style="padding: 15px; text-align: center; color: #999;">No customers found</div>';
    customerSuggestionsDiv.style.display = 'block';
    return;
  }
  
  const queryLower = query.toLowerCase();
  
  customerSuggestionsDiv.innerHTML = results.slice(0, 5).map(customer => {
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
    
    return `
      <div class="suggestion-item" onclick="selectCustomerFromSuggestion(${customer.id}, '${customer.name.replace(/'/g, "\\'")}')">
        <div class="suggestion-name">${customer.name}</div>
        <div class="suggestion-details">
          <span><img src="../assets/mobile.png" alt="Phone" style="width: 14px; height: 14px; vertical-align: middle;"> ${customer.phone || 'No phone'}</span>
          <span style="color: ${balanceColor};">${balanceText}</span>
        </div>
      </div>
    `;
  }).join('');
  
  customerSuggestionsDiv.style.display = 'block';
}

// Select customer from suggestion
function selectCustomerFromSuggestion(customerId, customerName) {
  document.getElementById('customerId').value = customerId;
  document.getElementById('customerSearch').value = customerName;
  customerSuggestionsDiv.style.display = 'none';
  
  currentCustomer = customers.find(c => c.id === customerId);
  updateCustomerInfo();
}

// Show all customers in a modal/dropdown
function showAllCustomers() {
  displayCustomerSuggestions(customers, '');
}

// Clear selected customer
function clearSelectedCustomer() {
  document.getElementById('customerId').value = '';
  document.getElementById('customerBalance').innerHTML = 'Search and select a customer';
  document.getElementById('customerBalance').className = '';
  currentCustomer = null;
}

// Load fish categories for dropdown
async function loadFishCategories() {
  try {
    const allFish = await window.electronAPI.getFishCategories();
    fishCategories = allFish.filter(fish => fish.active === 1);
    
    const select = document.getElementById('fishCategoryId');
    select.innerHTML = '<option value="">-- Select Fish --</option>';
    
    fishCategories.forEach(fish => {
      const option = document.createElement('option');
      option.value = fish.id;
      option.textContent = fish.name;
      option.dataset.price = fish.price_per_maund;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading fish categories:', error);
    showAlert('Failed to load fish categories', 'error');
  }
}

// Update customer info when selected
function updateCustomerInfo() {
  const balanceDiv = document.getElementById('customerBalance');
  
  if (!currentCustomer) {
    balanceDiv.innerHTML = 'Search and select a customer';
    balanceDiv.className = '';
    return;
  }

  const balance = parseFloat(currentCustomer.balance);
  let balanceText, balanceClass;

  if (balance < 0) {
    balanceText = `Rs.${Math.abs(balance).toFixed(2)} Outstanding`;
    balanceClass = 'balance outstanding';
  } else if (balance > 0) {
    balanceText = `Rs.${balance.toFixed(2)} Prepaid`;
    balanceClass = 'balance prepaid';
  } else {
    balanceText = 'Rs.0.00 Balanced';
    balanceClass = 'balance zero';
  }

  balanceDiv.innerHTML = balanceText;
  balanceDiv.className = balanceClass;
}

// Calculate total weight from Maund and KG inputs
function calculateTotalWeightFromInputs() {
  const maunds = parseFloat(document.getElementById('weightMaund').value) || 0;
  const kg = parseFloat(document.getElementById('weightKg').value) || 0;
  
  const totalKg = maundAndKgToKg(maunds, kg);
  
  // Update the display
  const displayText = formatWeight(totalKg);
  document.getElementById('totalWeight').value = displayText;
  
  // Recalculate subtotal
  calculateItemSubtotal();
}

// Update item price when fish is selected
function updateItemPrice() {
  const select = document.getElementById('fishCategoryId');
  const priceInput = document.getElementById('pricePerMaund');
  
  if (select.value) {
    const selectedOption = select.options[select.selectedIndex];
    priceInput.value = parseFloat(selectedOption.dataset.price).toFixed(2);
    calculateItemSubtotal();
  } else {
    priceInput.value = '';
    document.getElementById('itemSubtotal').value = '0.00';
  }
}

// Calculate item subtotal
function calculateItemSubtotal() {
  const maunds = parseFloat(document.getElementById('weightMaund').value) || 0;
  const kg = parseFloat(document.getElementById('weightKg').value) || 0;
  const totalKg = maundAndKgToKg(maunds, kg);
  
  const pricePerMaund = parseFloat(document.getElementById('pricePerMaund').value) || 0;
  
  // Calculate subtotal: (total_kg / 40) * price_per_maund
  // Use money rounding to prevent floating point errors (Issue 2)
  const subtotal = roundMoney((totalKg / KG_PER_MAUND) * pricePerMaund);
  document.getElementById('itemSubtotal').value = formatMoney(subtotal);
}

// Add item to bill
function addItem() {
  const fishSelect = document.getElementById('fishCategoryId');
  const maunds = parseFloat(document.getElementById('weightMaund').value) || 0;
  const kg = parseFloat(document.getElementById('weightKg').value) || 0;
  const totalKg = maundAndKgToKg(maunds, kg);
  const pricePerMaund = parseFloat(document.getElementById('pricePerMaund').value);

  if (!fishSelect.value) {
    showAlert('Please select a fish type', 'warning');
    return;
  }

  // Validate weight (Issue 4)
  const weightValidation = Validators.weight(totalKg);
  if (!weightValidation.valid) {
    showAlert(weightValidation.error, 'warning');
    return;
  }

  // Validate price (Issue 4)
  const priceValidation = Validators.price(pricePerMaund);
  if (!priceValidation.valid) {
    showAlert(priceValidation.error, 'warning');
    return;
  }

  const fishName = fishSelect.options[fishSelect.selectedIndex].text;
  // Use money rounding (Issue 2)
  const subtotal = roundMoney((totalKg / KG_PER_MAUND) * pricePerMaund);

  const item = {
    fish_category_id: parseInt(fishSelect.value),
    fish_name: fishName,
    weight_kg: totalKg,
    price_per_maund: pricePerMaund,
    subtotal: subtotal
  };

  billItems.push(item);
  renderBillItems();
  
  // Clear item form
  fishSelect.value = '';
  document.getElementById('weightMaund').value = '0';
  document.getElementById('weightKg').value = '0';
  document.getElementById('totalWeight').value = '0 Maund 0 KG';
  document.getElementById('pricePerMaund').value = '';
  document.getElementById('itemSubtotal').value = '0.00';
  
  calculateTotals();
}

// Remove item from bill
function removeItem(index) {
  billItems.splice(index, 1);
  renderBillItems();
  calculateTotals();
}

// Render bill items table
function renderBillItems() {
  const tbody = document.getElementById('itemsTable');
  
  if (billItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="no-data">No items added yet</td></tr>';
    return;
  }

  tbody.innerHTML = billItems.map((item, index) => `
    <tr>
      <td>${item.fish_name}</td>
      <td>${formatWeight(item.weight_kg)}</td>
      <td>Rs.${item.price_per_maund.toFixed(2)}</td>
      <td>Rs.${item.subtotal.toFixed(2)}</td>
      <td>
        <button class="action-btn delete" onclick="removeItem(${index})" title="Remove"><img src="../assets/delete.png" alt="Delete" style="width: 16px; height: 16px;"></button>
      </td>
    </tr>
  `).join('');
}

// Calculate totals
function calculateTotals() {
  // Use money rounding to prevent floating point errors (Issue 2)
  const total = billItems.reduce((sum, item) => roundMoney(sum + item.subtotal), 0);
  document.getElementById('totalAmount').value = formatMoney(total);
  
  // Set paid amount to total by default if it's 0
  const paidInput = document.getElementById('paidAmount');
  if (parseFloat(paidInput.value) === 0) {
    paidInput.value = formatMoney(total);
  }
  
  calculateBalance();
}

// Calculate balance change
function calculateBalance() {
  const total = parseFloat(document.getElementById('totalAmount').value) || 0;
  const paid = parseFloat(document.getElementById('paidAmount').value) || 0;
  // Use money rounding (Issue 2)
  const balanceChange = roundMoney(paid - total);
  
  const balanceInput = document.getElementById('balanceChange');
  const absBalance = Math.abs(balanceChange);
  
  if (balanceChange < 0) {
    balanceInput.value = `-Rs.${absBalance.toFixed(2)} (Outstanding)`;
    balanceInput.style.color = '#d32f2f';
  } else if (balanceChange > 0) {
    balanceInput.value = `+Rs.${absBalance.toFixed(2)} (Prepaid)`;
    balanceInput.style.color = '#388e3c';
  } else {
    balanceInput.value = 'Rs.0.00 (Balanced)';
    balanceInput.style.color = 'var(--text-secondary)';
  }
}

// Save transaction
async function saveTransaction() {
  // Loading state (Issue 16)
  const saveBtn = document.querySelector('.btn-primary');
  setButtonLoading(saveBtn, true);
  
  try {
    const customerId = parseInt(document.getElementById('customerId').value);
    const totalAmount = parseFloat(document.getElementById('totalAmount').value);
    const paidAmount = parseFloat(document.getElementById('paidAmount').value) || 0;
    const notes = document.getElementById('notes').value.trim();

    // Validation
    if (!customerId) {
      showAlert('Please select a customer', 'warning');
      return;
    }

    if (billItems.length === 0) {
      showAlert('Please add at least one item to the bill', 'warning');
      return;
    }

    // Validate paid amount (Issue 4)
    const paidValidation = Validators.paidAmount(paidAmount, totalAmount);
    if (!paidValidation.valid) {
      showAlert(paidValidation.error, 'warning');
      return;
    }

  // Confirm if partially paid or unpaid
  if (paidAmount < totalAmount) {
    const confirmSave = confirm(
      `Outstanding amount: Rs.${(totalAmount - paidAmount).toFixed(2)}\n\nThis will be added to the customer's balance. Continue?`
    );
    if (!confirmSave) return;
  }

  // Calculate balance change and payment status (Issue 2 - money rounding)
  const balanceChange = roundMoney(paidAmount - totalAmount);
  const currentBalance = currentCustomer ? parseFloat(currentCustomer.balance) : 0;
  const newBalance = roundMoney(currentBalance + balanceChange);

  let paymentStatus;
  if (paidAmount >= totalAmount) {
    paymentStatus = 'paid';
  } else if (paidAmount > 0) {
    paymentStatus = 'partial';
  } else {
    paymentStatus = 'unpaid';
  }

  // Get current date and time using local timezone (Issue 15)
  const transactionDate = getCurrentDate();
  const transactionTime = getCurrentTime();

  const transaction = {
    customer_id: customerId,
    transaction_date: transactionDate,
    transaction_time: transactionTime,
    total_amount: totalAmount,
    paid_amount: paidAmount,
    balance_change: balanceChange,
    balance_after: newBalance,
    payment_status: paymentStatus,
    notes: notes || null,
    items: billItems
  };

    const transactionId = await window.electronAPI.addTransaction(transaction);
    showAlert('Transaction saved successfully!', 'success');
    
    // Show bill preview
    setTimeout(() => {
      viewTransaction(transactionId);
    }, 500);
    
    // Clear form and reload
    clearForm();
    await loadCustomers(); // Reload to get updated balances
    await loadTransactions();
  } catch (error) {
    // Better error messages (Issue 25, 28)
    let errorMessage = 'Failed to save transaction';
    if (error && error.message) {
      errorMessage = `Error: ${error.message}`;
    }
    showAlert(errorMessage, 'error');
  } finally {
    setButtonLoading(saveBtn, false); // Issue 16
  }
}

// Clear form
function clearForm() {
  document.getElementById('customerId').value = '';
  document.getElementById('customerSearch').value = '';
  document.getElementById('customerBalance').innerHTML = 'Search and select a customer';
  document.getElementById('customerBalance').className = '';
  document.getElementById('weightMaund').value = '0';
  document.getElementById('weightKg').value = '0';
  document.getElementById('totalWeight').value = '0 Maund 0 KG';
  document.getElementById('fishCategoryId').value = '';
  document.getElementById('pricePerMaund').value = '';
  document.getElementById('itemSubtotal').value = '0.00';
  document.getElementById('totalAmount').value = '0.00';
  document.getElementById('paidAmount').value = '0';
  document.getElementById('balanceChange').value = '0.00';
  document.getElementById('notes').value = '';
  
  billItems = [];
  currentCustomer = null;
  renderBillItems();
}

// Toggle transaction form
function toggleTransactionForm() {
  const form = document.getElementById('transactionForm');
  const icon = document.getElementById('toggleIcon');
  
  if (form.style.display === 'none') {
    form.style.display = 'block';
    icon.textContent = '▼';
  } else {
    form.style.display = 'none';
    icon.textContent = '▶';
  }
}

// Load recent transactions with pagination and filters (Issue 23)
async function loadTransactions(options = {}) {
  try {
    const offset = (currentTransPage - 1) * transPageSize;
    const result = await window.electronAPI.getTransactions({ 
      limit: transPageSize,
      offset: offset,
      customerName: currentFilters.customerName || null,
      paymentStatus: currentFilters.paymentStatus || null,
      ...options
    });
    
    // Handle paginated response
    let transactions;
    if (result.data) {
      transactions = result.data;
      totalTransactions = result.total;
      totalTransPages = Math.ceil(result.total / transPageSize);
    } else {
      transactions = result;
      totalTransactions = result.length;
      totalTransPages = 1;
    }
    
    const tbody = document.getElementById('transactionsTable');
    
    if (transactions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="no-data">No transactions found</td></tr>';
      updateTransPaginationUI();
      return;
    }

    tbody.innerHTML = transactions.map(txn => {
      const date = new Date(txn.transaction_date);
      return `
        <tr>
          <td>#${txn.id}</td>
          <td>${date.toLocaleDateString('en-IN')}</td>
          <td>${txn.customer_name}</td>
          <td>Rs.${txn.total_amount.toFixed(2)}</td>
          <td>Rs.${txn.paid_amount.toFixed(2)}</td>
          <td><span class="status-badge ${txn.payment_status}">${txn.payment_status}</span></td>
          <td class="action-buttons">
            <button class="action-btn view" onclick="viewTransaction(${txn.id})" title="View Bill">👁️</button>
            <button class="action-btn edit" onclick="editTransaction(${txn.id})" title="Edit"><img src="../assets/edit.png" alt="Edit" style="width: 16px; height: 16px;"></button>
          </td>
        </tr>
      `;
    }).join('');
    
    updateTransPaginationUI();
  } catch (error) {
    console.error('Error loading transactions:', error);
    showAlert('Failed to load transactions', 'error');
  }
}

// Update transaction pagination UI
function updateTransPaginationUI() {
  const prevBtn = document.getElementById('prevTransBtn');
  const nextBtn = document.getElementById('nextTransBtn');
  const pageInfo = document.getElementById('transPageInfo');
  
  if (prevBtn && nextBtn && pageInfo) {
    prevBtn.disabled = currentTransPage === 1;
    nextBtn.disabled = currentTransPage >= totalTransPages;
    pageInfo.textContent = `Page ${currentTransPage} of ${totalTransPages} (${totalTransactions} transactions)`;
  }
}

// Transaction pagination controls
function nextTransPage() {
  if (currentTransPage < totalTransPages) {
    currentTransPage++;
    loadTransactions();
  }
}

function previousTransPage() {
  if (currentTransPage > 1) {
    currentTransPage--;
    loadTransactions();
  }
}

function changeTransPageSize() {
  transPageSize = parseInt(document.getElementById('transPageSize').value);
  currentTransPage = 1;
  loadTransactions();
}

// Apply search filters
function applyFilters() {
  clearTimeout(searchTimeout);
  searchTimeout = safeSetTimeout(() => {
    currentFilters.customerName = document.getElementById('filterCustomerName').value.trim();
    currentFilters.paymentStatus = document.getElementById('filterPaymentStatus').value;
    currentTransPage = 1; // Reset to first page
    loadTransactions();
  }, 500); // Debounce
}

// Clear search filters
function clearFilters() {
  document.getElementById('filterCustomerName').value = '';
  document.getElementById('filterPaymentStatus').value = '';
  currentFilters = { customerName: '', paymentStatus: '' };
  currentTransPage = 1;
  loadTransactions();
}

// View transaction details
async function viewTransaction(id) {
  try {
    const txn = await window.electronAPI.getTransactionById(id);
    if (!txn) {
      showAlert('Transaction not found', 'error');
      return;
    }

    const date = new Date(txn.transaction_date);
    const billContent = document.getElementById('billContent');
    
    billContent.innerHTML = `
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
          <p>Thank you for your business!</p>
        </div>
      </div>
    `;

    document.getElementById('viewBillModal').classList.add('active');
  } catch (error) {
    console.error('Error viewing transaction:', error);
    showAlert('Failed to load transaction details', 'error');
  }
}

// Close view bill modal
function closeViewBillModal() {
  document.getElementById('viewBillModal').classList.remove('active');
}

// Edit transaction
let editingTransactionId = null;
let editingTransactionData = null;

async function editTransaction(id) {
  try {
    const txn = await window.electronAPI.getTransactionById(id);
    if (!txn) {
      showAlert('Transaction not found', 'error');
      return;
    }
    
    editingTransactionId = id;
    editingTransactionData = txn;
    
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
  editingTransactionData = null;
}

async function saveEditedTransaction() {
  const saveBtn = event.target;
  setButtonLoading(saveBtn, true);
  
  try {
    const newPaidAmount = parseFloat(document.getElementById('editPaidAmount').value) || 0;
    const newNotes = document.getElementById('editNotes').value.trim();
    const totalAmount = editingTransactionData.total_amount;
    
    // Validate paid amount
    const paidValidation = Validators.paidAmount(newPaidAmount, totalAmount);
    if (!paidValidation.valid) {
      showEditAlert(paidValidation.error, 'warning');
      return;
    }
    
    // Confirm if making major changes
    if (Math.abs(newPaidAmount - editingTransactionData.paid_amount) > totalAmount * 0.5) {
      const confirm = window.confirm(
        `You're changing the paid amount significantly (from Rs.${editingTransactionData.paid_amount.toFixed(2)} to Rs.${newPaidAmount.toFixed(2)}). Are you sure?`
      );
      if (!confirm) return;
    }
    
    // Calculate new balance
    const balanceChange = roundMoney(newPaidAmount - totalAmount);
    const oldBalanceChange = editingTransactionData.balance_change;
    const balanceDifference = roundMoney(balanceChange - oldBalanceChange);
    
    // Get customer current balance and calculate new balance
    const customer = await window.electronAPI.getCustomerById(editingTransactionData.customer_id);
    const newCustomerBalance = roundMoney(customer.balance + balanceDifference);
    
    // Determine payment status
    let paymentStatus;
    if (newPaidAmount >= totalAmount) {
      paymentStatus = 'paid';
    } else if (newPaidAmount > 0) {
      paymentStatus = 'partial';
    } else {
      paymentStatus = 'unpaid';
    }
    
    // Update transaction
    const updates = {
      customer_id: editingTransactionData.customer_id,
      transaction_date: editingTransactionData.transaction_date,
      transaction_time: editingTransactionData.transaction_time,
      total_amount: totalAmount,
      paid_amount: newPaidAmount,
      balance_change: balanceChange,
      balance_after: newCustomerBalance,
      payment_status: paymentStatus,
      notes: newNotes || null,
      items: editingTransactionData.items
    };
    
    await window.electronAPI.updateTransaction(editingTransactionId, updates);
    
    showAlert('Transaction updated successfully!', 'success');
    closeEditTransactionModal();
    await loadTransactions();
    
  } catch (error) {
    let errorMessage = 'Failed to update transaction';
    if (error && error.message) {
      errorMessage = `Error: ${error.message}`;
    }
    showEditAlert(errorMessage, 'error');
  } finally {
    setButtonLoading(saveBtn, false);
  }
}

function showEditAlert(message, type = 'info') {
  const alertContainer = document.getElementById('editAlertContainer');
  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  
  alertContainer.innerHTML = ''; // Clear previous alerts
  alertContainer.appendChild(alert);
  
  setTimeout(() => {
    alert.remove();
  }, 5000);
}

// Print bill
function printBill() {
  const billContent = document.getElementById('billContent').innerHTML;
  const printWindow = window.open('', '', 'height=600,width=800');
  
  printWindow.document.write('<html><head><title>Print Bill</title>');
  printWindow.document.write('</head><body>');
  printWindow.document.write(billContent);
  printWindow.document.write('</body></html>');
  
  printWindow.document.close();
  printWindow.print();
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
  const viewModal = document.getElementById('viewBillModal');
  const editModal = document.getElementById('editTransactionModal');
  
  if (event.target === viewModal) {
    closeViewBillModal();
  }
  if (event.target === editModal) {
    closeEditTransactionModal();
  }
}

