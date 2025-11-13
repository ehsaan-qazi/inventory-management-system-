// Input validation utilities

const Validators = {
  customerName(name) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return { valid: false, error: 'Customer name is required' };
    }
    
    const trimmed = name.trim();
    
    if (trimmed.length > 100) {
      return { valid: false, error: 'Customer name is too long (maximum 100 characters)' };
    }
    
    if (trimmed.length < 2) {
      return { valid: false, error: 'Customer name is too short (minimum 2 characters)' };
    }
    
    return { valid: true, value: trimmed };
  },

  phoneNumber(phone) {
    // Optional field
    if (!phone || phone.trim().length === 0) {
      return { valid: true, value: null };
    }
    
    // Pakistani format: 03XX-XXXXXXX or 03XXXXXXXXX
    const cleaned = phone.replace(/[\s-]/g, ''); // Remove spaces and dashes
    const phoneRegex = /^03\d{9}$/;
    
    if (!phoneRegex.test(cleaned)) {
      return { 
        valid: false, 
        error: 'Invalid phone format. Use: 03XX-XXXXXXX (e.g., 0300-1234567)' 
      };
    }
    
    // Format it nicely
    const formatted = cleaned.slice(0, 4) + '-' + cleaned.slice(4);
    return { valid: true, value: formatted };
  },

  price(price) {
    const num = parseFloat(price);
    
    if (isNaN(num)) {
      return { valid: false, error: 'Price must be a number' };
    }
    
    if (num <= 0) {
      return { valid: false, error: 'Price must be greater than 0' };
    }
    
    if (num > 10000000) {
      return { valid: false, error: 'Price is too large (maximum Rs.10,000,000)' };
    }
    
    return { valid: true, value: Math.round(num * 100) / 100 };
  },

  weight(weight) {
    const num = parseFloat(weight);
    
    if (isNaN(num) || num < 0) {
      return { valid: false, error: 'Weight must be a positive number' };
    }
    
    if (num > 50000) {
      return { valid: false, error: 'Weight is too large (maximum 50,000 KG)' };
    }
    
    return { valid: true, value: Math.round(num * 100) / 100 };
  },

  paidAmount(paid, total) {
    const paidNum = parseFloat(paid);
    const totalNum = parseFloat(total);
    
    if (isNaN(paidNum)) {
      return { valid: false, error: 'Paid amount must be a number' };
    }
    
    if (paidNum < 0) {
      return { valid: false, error: 'Paid amount cannot be negative' };
    }
    
    if (paidNum > totalNum * 2) {
      return { 
        valid: false, 
        error: 'Paid amount seems too high. Please verify.' 
      };
    }
    
    return { valid: true, value: Math.round(paidNum * 100) / 100 };
  },

  address(address) {
    // Optional field
    if (!address || address.trim().length === 0) {
      return { valid: true, value: null };
    }
    
    if (address.length > 500) {
      return { valid: false, error: 'Address is too long (maximum 500 characters)' };
    }
    
    return { valid: true, value: address.trim() };
  },

  fishName(name) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return { valid: false, error: 'Fish name is required' };
    }
    
    const trimmed = name.trim();
    
    if (trimmed.length > 50) {
      return { valid: false, error: 'Fish name is too long (maximum 50 characters)' };
    }
    
    return { valid: true, value: trimmed };
  },

  paymentStatus(status) {
    const validStatuses = ['paid', 'partial', 'unpaid'];
    
    if (!validStatuses.includes(status)) {
      return { 
        valid: false, 
        error: 'Invalid payment status. Must be: paid, partial, or unpaid' 
      };
    }
    
    return { valid: true, value: status };
  }
};

// Export for browser
if (typeof window !== 'undefined') {
  window.Validators = Validators;
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Validators };
}

