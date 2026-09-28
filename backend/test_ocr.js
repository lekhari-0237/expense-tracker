const { parseReceiptOcr } = require('./services/receiptOcrService');

const tests = [
    {
        name: 'User Real Receipt (FreshMart)',
        text: `FreshMart
YOUR DAILY NEEDS
#12 Green Park Road
Chennai
Phone: 044 1234 5678
Date: 06-09-2025
Milk ₹52
Bread ₹40
Eggs ₹60
Maggi Noodles ₹64
Tomato ₹30
Onion ₹28
Sub Total ₹274
Discount ₹14
Total ₹260`,
        expectedTotal: 260,
        expectedMerchant: 'FreshMart',
        expectedCategory: 'Food',
        expectedDate: '2025-09-06'
    },
    {
        name: 'Test 1 - Basic Subtotal + Discount + Total',
        text: `Milk 52
Bread 40
Eggs 60
Onion 28
Subtotal 180
Discount 10
Total 170`,
        expectedTotal: 170
    },
    {
        name: 'Test 2 - Grand Total',
        text: `Item A 100
Item B 200
Grand Total: 300`,
        expectedTotal: 300
    },
    {
        name: 'Test 3 - Tax + Amount Payable',
        text: `Item A Rs 100
Tax Rs 18
Amount Payable Rs 118`,
        expectedTotal: 118
    },
    {
        name: 'Test 4 - GST + Decimal Total Amount',
        text: `Item A 50
Item B 75
Subtotal 125
GST 22.50
Total Amount 147.50`,
        expectedTotal: 147.50
    },
    {
        name: 'Test 5 - Comma formatted Amount Due',
        text: `Item A ₹999
Item B ₹100
Amount Due ₹1,099`,
        expectedTotal: 1099
    },
    {
        name: 'Test 6 - Net Payable',
        text: `Subtotal ₹500
Discount ₹50
Net Payable ₹450`,
        expectedTotal: 450
    },
    {
        name: 'Test 7 - Heavy Metadata (Phone, Invoice, GSTIN, Items, Subtotal, Discount)',
        text: `Phone: 9876543210
Invoice: INV20250906123
GSTIN: 33XXXXXXXXXXXXXX
Item: ₹28
Item: ₹60
Subtotal: ₹274
Discount: ₹14
Total: ₹260`,
        expectedTotal: 260
    }
];

let allPassed = true;

tests.forEach((t, index) => {
    const result = parseReceiptOcr(t.text);
    const passed = result.amount === t.expectedTotal &&
        (!t.expectedMerchant || result.merchantName.toLowerCase() === t.expectedMerchant.toLowerCase()) &&
        (!t.expectedCategory || result.category === t.expectedCategory) &&
        (!t.expectedDate || result.date === t.expectedDate);

    console.log(`\n==============================================`);
    console.log(`TEST ${index + 1}: ${t.name}`);
    console.log(`Extracted Total: ₹${result.amount} (Expected: ₹${t.expectedTotal}) -> ${result.amount === t.expectedTotal ? '✅ PASS' : '❌ FAIL'}`);
    if (t.expectedMerchant) {
        console.log(`Extracted Merchant: "${result.merchantName}" (Expected: "${t.expectedMerchant}") -> ${result.merchantName.toLowerCase() === t.expectedMerchant.toLowerCase() ? '✅ PASS' : '❌ FAIL'}`);
    }
    if (t.expectedCategory) {
        console.log(`Extracted Category: "${result.category}" (Expected: "${t.expectedCategory}") -> ${result.category === t.expectedCategory ? '✅ PASS' : '❌ FAIL'}`);
    }
    if (t.expectedDate) {
        console.log(`Extracted Date: "${result.date}" (Expected: "${t.expectedDate}") -> ${result.date === t.expectedDate ? '✅ PASS' : '❌ FAIL'}`);
    }
    console.log(`Result: ${passed ? '🎉 PASSED' : '💥 FAILED'}`);

    if (!passed) allPassed = false;
});

console.log(`\n==============================================`);
console.log(`FINAL RESULT: ${allPassed ? 'ALL TESTS PASSED SUCCESSFULLY! 🚀' : 'SOME TESTS FAILED ❌'}`);
