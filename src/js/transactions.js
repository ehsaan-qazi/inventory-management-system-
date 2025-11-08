// Transactions page functionality
let customers = [];
let fishCategories = [];
let billItems = [];
let currentCustomer = null;
let searchTimeout;
let customerSuggestionsDiv;

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
          <span>📱 ${customer.phone || 'No phone'}</span>
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
      option.dataset.price = fish.price_per_kg;
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

// Update item price when fish is selected
function updateItemPrice() {
  const select = document.getElementById('fishCategoryId');
  const priceInput = document.getElementById('pricePerKg');
  
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
  const weight = parseFloat(document.getElementById('weight').value) || 0;
  const price = parseFloat(document.getElementById('pricePerKg').value) || 0;
  const subtotal = weight * price;
  document.getElementById('itemSubtotal').value = subtotal.toFixed(2);
}

// Add item to bill
function addItem() {
  const fishSelect = document.getElementById('fishCategoryId');
  const weight = parseFloat(document.getElementById('weight').value);
  const price = parseFloat(document.getElementById('pricePerKg').value);

  if (!fishSelect.value) {
    showAlert('Please select a fish type', 'warning');
    return;
  }

  if (!weight || weight <= 0) {
    showAlert('Please enter a valid weight', 'warning');
    return;
  }

  const fishName = fishSelect.options[fishSelect.selectedIndex].text;
  const subtotal = weight * price;

  const item = {
    fish_category_id: parseInt(fishSelect.value),
    fish_name: fishName,
    weight_kg: weight,
    price_per_kg: price,
    subtotal: subtotal
  };

  billItems.push(item);
  renderBillItems();
  
  // Clear item form
  fishSelect.value = '';
  document.getElementById('weight').value = '';
  document.getElementById('pricePerKg').value = '';
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
      <td>${item.weight_kg.toFixed(2)} KG</td>
      <td>Rs.${item.price_per_kg.toFixed(2)}</td>
      <td>Rs.${item.subtotal.toFixed(2)}</td>
      <td>
        <button class="action-btn delete" onclick="removeItem(${index})" title="Remove">🗑️</button>
      </td>
    </tr>
  `).join('');
}

// Calculate totals
function calculateTotals() {
  const total = billItems.reduce((sum, item) => sum + item.subtotal, 0);
  document.getElementById('totalAmount').value = total.toFixed(2);
  
  // Set paid amount to total by default if it's 0
  const paidInput = document.getElementById('paidAmount');
  if (parseFloat(paidInput.value) === 0) {
    paidInput.value = total.toFixed(2);
  }
  
  calculateBalance();
}

// Calculate balance change
function calculateBalance() {
  const total = parseFloat(document.getElementById('totalAmount').value) || 0;
  const paid = parseFloat(document.getElementById('paidAmount').value) || 0;
  const balanceChange = paid - total;
  
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

  if (paidAmount < 0) {
    showAlert('Paid amount cannot be negative', 'warning');
    return;
  }

  // Confirm if partially paid or unpaid
  if (paidAmount < totalAmount) {
    const confirmSave = confirm(
      `Outstanding amount: Rs.${(totalAmount - paidAmount).toFixed(2)}\n\nThis will be added to the customer's balance. Continue?`
    );
    if (!confirmSave) return;
  }

  // Calculate balance change and payment status
  const balanceChange = paidAmount - totalAmount;
  const currentBalance = currentCustomer ? parseFloat(currentCustomer.balance) : 0;
  const newBalance = currentBalance + balanceChange;

  let paymentStatus;
  if (paidAmount >= totalAmount) {
    paymentStatus = 'paid';
  } else if (paidAmount > 0) {
    paymentStatus = 'partial';
  } else {
    paymentStatus = 'unpaid';
  }

  // Get current date and time
  const now = new Date();
  const transactionDate = now.toISOString().split('T')[0];
  const transactionTime = now.toTimeString().split(' ')[0];

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

  try {
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
    console.error('Error saving transaction:', error);
    showAlert('Failed to save transaction', 'error');
  }
}

// Clear form
function clearForm() {
  document.getElementById('customerId').value = '';
  document.getElementById('customerSearch').value = '';
  document.getElementById('customerBalance').innerHTML = 'Search and select a customer';
  document.getElementById('customerBalance').className = '';
  document.getElementById('weight').value = '';
  document.getElementById('fishCategoryId').value = '';
  document.getElementById('pricePerKg').value = '';
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

// Load recent transactions
async function loadTransactions() {
  try {
    const transactions = await window.electronAPI.getTransactions(50);
    const tbody = document.getElementById('transactionsTable');
    
    if (transactions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="no-data">No transactions yet</td></tr>';
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
          <td>
            <button class="action-btn view" onclick="viewTransaction(${txn.id})" title="View Bill">👁️</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading transactions:', error);
    showAlert('Failed to load transactions', 'error');
  }
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
              <th style="text-align: right; padding: 8px;">Price/KG</th>
              <th style="text-align: right; padding: 8px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${txn.items.map(item => `
              <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 8px;">${item.fish_name}</td>
                <td style="text-align: right; padding: 8px;">${item.weight_kg.toFixed(2)} KG</td>
                <td style="text-align: right; padding: 8px;">Rs.${item.price_per_kg.toFixed(2)}</td>
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
  
  if (event.target === viewModal) {
    closeViewBillModal();
  }
}

