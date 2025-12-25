import re

# Read the HTML file
with open('src/pages/transactions.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace labour charges label
content = content.replace(
    '<label for="labourCharges">Labour Charges (Rs.)</label>',
    '<label for="labourRatePerKg">Labour Rate (Rs./KG)</label>'
)

# Replace the input ID
content = content.replace(
    'id="labourCharges"',
    'id="labourRatePerKg"'
)

# Add the live total display after the labour rate input
# Find the closing tag and insert the small element
pattern = r'(<input type="number" id="labourRatePerKg"[^>]*>)'
replacement = r'\1\n                                    <small style="color: var(--text-secondary); font-size: 11px;">Total: Rs.<span id="labourChargesTotal">0.00</span></small>'
content = re.sub(pattern, replacement, content)

# Write back
with open('src/pages/transactions.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("HTML updated successfully!")
