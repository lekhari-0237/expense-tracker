/**
 * Mock Bank Transaction Service (Fictional Demonstration)
 * Generates realistic bank feed data with deterministic IDs for testing synchronization & duplicate protection.
 */

const MERCHANT_CATEGORY_MAP = {
    'swiggy': 'Food',
    'zomato': 'Food',
    'mcdonalds': 'Food',
    'starbucks': 'Food',
    'dominos': 'Food',
    'chai point': 'Food',
    'dmart': 'Groceries',
    'blinkit': 'Groceries',
    'zepto': 'Groceries',
    'bigbasket': 'Groceries',
    'nature basket': 'Groceries',
    'amazon': 'Shopping',
    'flipkart': 'Shopping',
    'myntra': 'Shopping',
    'zara': 'Shopping',
    'h&m': 'Shopping',
    'uber': 'Transport',
    'ola': 'Transport',
    'rapido': 'Transport',
    'shell petrol': 'Transport',
    'hpcl fuel': 'Transport',
    'airtel broadband': 'Bills',
    'jio prepaid': 'Bills',
    'bescom electricity': 'Bills',
    'igl piped gas': 'Bills',
    'netflix': 'Entertainment',
    'spotify': 'Entertainment',
    'pvr cinemas': 'Entertainment',
    'bookmyshow': 'Entertainment',
    'apollo pharmacy': 'Healthcare',
    'medplus chemist': 'Healthcare',
    '1mg healthcare': 'Healthcare',
    'udemy course': 'Education',
    'coursera subscription': 'Education',
    'irctc train': 'Travel',
    'makemytrip flight': 'Travel',
    'uber intercity': 'Travel',
    'salary deposit': 'Salary',
    'freelance client payout': 'Freelance',
    'dividend payout': 'Investment'
};

/**
 * Categorizes a transaction description or merchant name automatically
 */
function categorizeMerchant(description, rawCategory) {
    if (rawCategory && rawCategory !== 'Other') return rawCategory;
    const lower = (description || '').toLowerCase();
    for (const [merchantKey, category] of Object.entries(MERCHANT_CATEGORY_MAP)) {
        if (lower.includes(merchantKey)) {
            return category;
        }
    }
    return 'Other';
}

/**
 * Returns a list of realistic fictional mock transactions
 */
function getMockBankFeed() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    // Helper to format ISO date string relative to current month/year
    const getDateStr = (dayOffset, hour = 14, min = 30) => {
        const d = new Date(currentYear, currentMonth, Math.max(1, Math.min(28, now.getDate() - dayOffset)), hour, min);
        return d.toISOString();
    };

    return [
        {
            externalId: 'TXN_MB_1001',
            merchant: 'Swiggy',
            description: 'Swiggy Gourmet Order #9842',
            amount: 450.00,
            type: 'DEBIT',
            category: 'Food',
            date: getDateStr(0, 20, 15),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        },
        {
            externalId: 'TXN_MB_1002',
            merchant: 'Uber',
            description: 'Uber Ride - Office Commute',
            amount: 220.00,
            type: 'DEBIT',
            category: 'Transport',
            date: getDateStr(0, 9, 30),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        },
        {
            externalId: 'TXN_MB_1003',
            merchant: 'Amazon',
            description: 'Amazon Retail Order #AZ-8921',
            amount: 1499.00,
            type: 'DEBIT',
            category: 'Shopping',
            date: getDateStr(1, 16, 45),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        },
        {
            externalId: 'TXN_MB_1004',
            merchant: 'DMart',
            description: 'DMart Supermarket Monthly Groceries',
            amount: 3250.00,
            type: 'DEBIT',
            category: 'Groceries',
            date: getDateStr(2, 11, 20),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        },
        {
            externalId: 'TXN_MB_1005',
            merchant: 'Netflix',
            description: 'Netflix Monthly Premium Subscription',
            amount: 649.00,
            type: 'DEBIT',
            category: 'Entertainment',
            date: getDateStr(3, 8, 0),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        },
        {
            externalId: 'TXN_MB_1006',
            merchant: 'Airtel Broadband',
            description: 'Airtel Fiber 200Mbps Monthly Bill',
            amount: 1179.00,
            type: 'DEBIT',
            category: 'Bills',
            date: getDateStr(4, 15, 10),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        },
        {
            externalId: 'TXN_MB_1007',
            merchant: 'Apollo Pharmacy',
            description: 'Apollo Pharmacy Medicines & Health Check',
            amount: 850.00,
            type: 'DEBIT',
            category: 'Healthcare',
            date: getDateStr(5, 18, 40),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        },
        {
            externalId: 'TXN_MB_1008',
            merchant: 'Shell Petrol',
            description: 'Shell Auto Fuel Refill',
            amount: 1200.00,
            type: 'DEBIT',
            category: 'Transport',
            date: getDateStr(6, 17, 15),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        },
        {
            externalId: 'TXN_MB_1009',
            merchant: 'Zomato',
            description: 'Zomato Dining Dinner Payment',
            amount: 1120.00,
            type: 'DEBIT',
            category: 'Food',
            date: getDateStr(7, 21, 30),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        },
        {
            externalId: 'TXN_MB_1010',
            merchant: 'Flipkart',
            description: 'Flipkart Electronics & Accessories',
            amount: 2490.00,
            type: 'DEBIT',
            category: 'Shopping',
            date: getDateStr(8, 14, 10),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        },
        {
            externalId: 'TXN_MB_1011',
            merchant: 'Udemy Course',
            description: 'Udemy React & FullStack Masterclass',
            amount: 499.00,
            type: 'DEBIT',
            category: 'Education',
            date: getDateStr(9, 19, 0),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        },
        {
            externalId: 'TXN_MB_1012',
            merchant: 'Blinkit',
            description: 'Blinkit Quick Grocery Delivery',
            amount: 380.00,
            type: 'DEBIT',
            category: 'Groceries',
            date: getDateStr(10, 8, 45),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        },
        {
            externalId: 'TXN_MB_1013',
            merchant: 'Spotify',
            description: 'Spotify Premium Individual Monthly',
            amount: 119.00,
            type: 'DEBIT',
            category: 'Entertainment',
            date: getDateStr(11, 7, 30),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        },
        {
            externalId: 'TXN_MB_1014',
            merchant: 'Bescom Electricity',
            description: 'Bescom Power Utility Monthly Bill',
            amount: 1840.00,
            type: 'DEBIT',
            category: 'Bills',
            date: getDateStr(12, 10, 0),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        },
        {
            externalId: 'TXN_MB_1015',
            merchant: 'IRCTC Train',
            description: 'IRCTC Executive Ticket Booking',
            amount: 1650.00,
            type: 'DEBIT',
            category: 'Travel',
            date: getDateStr(14, 13, 25),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        },
        {
            externalId: 'TXN_MB_1016',
            merchant: 'Salary Deposit',
            description: 'Tech Corp Monthly Payroll Direct Deposit',
            amount: 65000.00,
            type: 'CREDIT',
            category: 'Salary',
            date: getDateStr(15, 6, 0),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        },
        {
            externalId: 'TXN_MB_1017',
            merchant: 'Freelance Client Payout',
            description: 'Design Project Milestone Payout via Wire',
            amount: 15000.00,
            type: 'CREDIT',
            category: 'Freelance',
            date: getDateStr(18, 12, 0),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        },
        {
            externalId: 'TXN_MB_1018',
            merchant: 'Starbucks Coffee',
            description: 'Starbucks Coffee & Snacks',
            amount: 580.00,
            type: 'DEBIT',
            category: 'Food',
            date: getDateStr(19, 16, 20),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        },
        {
            externalId: 'TXN_MB_1019',
            merchant: 'PVR Cinemas',
            description: 'PVR Cinemas 2x Movie Tickets & Popcorn',
            amount: 920.00,
            type: 'DEBIT',
            category: 'Entertainment',
            date: getDateStr(21, 18, 30),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        },
        {
            externalId: 'TXN_MB_1020',
            merchant: 'Jio Prepaid',
            description: 'Jio 5G Unlimited Recharge Plan',
            amount: 749.00,
            type: 'DEBIT',
            category: 'Bills',
            date: getDateStr(22, 11, 5),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        },
        {
            externalId: 'TXN_MB_1021',
            merchant: 'MakeMyTrip Flight',
            description: 'MakeMyTrip Domestic Flight Booking',
            amount: 4300.00,
            type: 'DEBIT',
            category: 'Travel',
            date: getDateStr(24, 15, 40),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        },
        {
            externalId: 'TXN_MB_1022',
            merchant: 'Zara Fashion',
            description: 'Zara Apparel & Casual Wear',
            amount: 2990.00,
            type: 'DEBIT',
            category: 'Shopping',
            date: getDateStr(25, 17, 50),
            accountNumber: '**** 4582',
            bankName: 'Apex Demo Bank'
        }
    ];
}

module.exports = {
    getMockBankFeed,
    categorizeMerchant
};
