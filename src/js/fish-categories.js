// Fish categories page functionality
let allFish = [];
let currentEditingId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadFishCategories();
});

// Load all fish categories
async function loadFishCategories() {
  try {
    allFish = await window.electronAPI.getFishCategories();
    displayFishCategories(allFish);
  } catch (error) {
    console.error('Error loading fish categories:', error);
    showAlert('Failed to load fish categories', 'error');
  }
}

// Display fish categories in table
function displayFishCategories(fishList) {
  const tbody = document.getElementById('fishTable');
  
  if (fishList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="no-data">No fish categories found. Add your first category!</td></tr>';
    return;
  }

  tbody.innerHTML = fishList.map(fish => {
    const statusClass = fish.active ? 'active' : 'inactive';
    const statusText = fish.active ? 'Active' : 'Inactive';

    return `
      <tr style="${!fish.active ? 'opacity: 0.6;' : ''}">
        <td>#${fish.id}</td>
        <td>${fish.name}</td>
        <td>Rs.${parseFloat(fish.price_per_maund).toFixed(2)}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td class="action-buttons">
          <button class="action-btn edit" onclick="editFish(${fish.id})" title="Edit"><img src="../assets/edit.png" alt="Edit" style="width: 16px; height: 16px;"></button>
          <button class="action-btn ${fish.active ? 'delete' : 'edit'}" 
                  onclick="toggleFishStatus(${fish.id}, ${!fish.active})" 
                  title="${fish.active ? 'Deactivate' : 'Activate'}">
            ${fish.active ? '<img src="../assets/delete.png" alt="Deactivate" style="width: 16px; height: 16px;">' : '✅'}
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Search fish categories
function searchFish() {
  const searchInput = document.getElementById('searchInput');
  const query = searchInput.value.trim().toLowerCase();
  
  if (!query) {
    displayFishCategories(allFish);
    return;
  }

  const filtered = allFish.filter(fish => 
    fish.name.toLowerCase().includes(query)
  );
  displayFishCategories(filtered);
}

// Open add fish modal
function openAddFishModal() {
  currentEditingId = null;
  document.getElementById('modalTitle').textContent = 'Add Fish Category';
  document.getElementById('fishForm').reset();
  document.getElementById('fishId').value = '';
  document.getElementById('statusGroup').style.display = 'none';
  document.getElementById('fishModal').classList.add('active');
}

// Open edit fish modal
async function editFish(id) {
  try {
    const fish = await window.electronAPI.getFishCategoryById(id);
    if (!fish) {
      showAlert('Fish category not found', 'error');
      return;
    }

    currentEditingId = id;
    document.getElementById('modalTitle').textContent = 'Edit Fish Category';
    document.getElementById('fishId').value = fish.id;
    document.getElementById('fishName').value = fish.name;
    document.getElementById('fishPrice').value = fish.price_per_maund;
    document.getElementById('fishActive').checked = fish.active === 1;
    document.getElementById('statusGroup').style.display = 'block';
    
    document.getElementById('fishModal').classList.add('active');
  } catch (error) {
    console.error('Error loading fish category:', error);
    showAlert('Failed to load fish category details', 'error');
  }
}

// Close fish modal
function closeFishModal() {
  document.getElementById('fishModal').classList.remove('active');
  document.getElementById('fishForm').reset();
  currentEditingId = null;
}

// Save fish (add or update)
async function saveFish() {
  const saveBtn = document.querySelector('.btn-primary');
  setButtonLoading(saveBtn, true);
  
  try {
    const name = document.getElementById('fishName').value.trim();
    const price = parseFloat(document.getElementById('fishPrice').value);

    // Validate fish name (Issue 4)
    const nameValidation = Validators.fishName(name);
    if (!nameValidation.valid) {
      showAlert(nameValidation.error, 'warning');
      return;
    }

    // Validate price (Issue 4)
    const priceValidation = Validators.price(price);
    if (!priceValidation.valid) {
      showAlert(priceValidation.error, 'warning');
      return;
    }

    const fishData = { 
      name: nameValidation.value, 
      price_per_maund: roundMoney(priceValidation.value) // Issue 2
    };
    if (currentEditingId) {
      // Update existing fish
      await window.electronAPI.updateFishCategory(currentEditingId, fishData);
      
      // Update active status if changed
      const active = document.getElementById('fishActive').checked;
      const currentFish = allFish.find(f => f.id === currentEditingId);
      if (currentFish && currentFish.active !== (active ? 1 : 0)) {
        await window.electronAPI.toggleFishCategory(currentEditingId, active);
      }
      
      showAlert('Fish category updated successfully', 'success');
    } else {
      // Add new fish
      fishData.active = 1; // New categories are active by default
      await window.electronAPI.addFishCategory(fishData);
      showAlert('Fish category added successfully', 'success');
    }

    closeFishModal();
    await loadFishCategories();
  } catch (error) {
    // Better error messages (Issue 25)
    let errorMessage = 'Failed to save fish category';
    if (error && error.message) {
      if (error.message.includes('UNIQUE constraint') || error.message.includes('already exists')) {
        errorMessage = 'A fish category with this name already exists';
      } else {
        errorMessage = `Error: ${error.message}`;
      }
    }
    showAlert(errorMessage, 'error');
  } finally {
    setButtonLoading(saveBtn, false); // Issue 16
  }
}

// Toggle fish category active status
async function toggleFishStatus(id, active) {
  const fish = allFish.find(f => f.id === id);
  if (!fish) return;

  const action = active ? 'activate' : 'deactivate';
  const confirmToggle = confirm(
    `Are you sure you want to ${action} "${fish.name}"?\n\n${
      active 
        ? 'This will make it available for transactions.' 
        : 'This will hide it from new transactions but keep historical data.'
    }`
  );

  if (!confirmToggle) return;

  try {
    await window.electronAPI.toggleFishCategory(id, active);
    showAlert(`Fish category ${active ? 'activated' : 'deactivated'} successfully`, 'success');
    await loadFishCategories();
  } catch (error) {
    console.error('Error toggling fish category:', error);
    showAlert('Failed to update fish category status', 'error');
  }
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
  const fishModal = document.getElementById('fishModal');
  
  if (event.target === fishModal) {
    closeFishModal();
  }
}

