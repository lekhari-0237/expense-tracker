/**
 * Robust Receipt OCR Parsing Service
 * Designed for real-world receipts (supermarkets, restaurants, retail, utilities, transport, etc.)
 */

// Category keyword mapping
const CATEGORY_RULES = [
    {
        category: 'Food',
        keywords: [
            'fresh', 'mart', 'supermarket', 'grocer', 'grocery', 'bakery', 'cafe', 'restaurant',
            'dine', 'dining', 'kitchen', 'food', 'foods', 'bistro', 'dhaba', 'hotel', 'sweets',
            'milk', 'bread', 'egg', 'eggs', 'noodle', 'noodles', 'tomato', 'onion', 'potato',
            'vegetable', 'fruit', 'fruits', 'snack', 'snacks', 'tea', 'coffee', 'burger', 'pizza',
            'biryani', 'rice', 'flour', 'atta', 'dal', 'oil', 'sugar', 'salt', 'chicken', 'paneer',
            'butter', 'cheese', 'juice', 'biscuit', 'maggi'
        ]
    },
    {
        category: 'Transport',
        keywords: [
            'fuel', 'petrol', 'diesel', 'cng', 'hpcl', 'bpcl', 'ioc', 'indian oil', 'shell',
            'uber', 'ola', 'rapido', 'cab', 'taxi', 'toll', 'parking', 'metro', 'railway', 'irctc'
        ]
    },
    {
        category: 'Healthcare',
        keywords: [
            'pharmacy', 'chemist', 'medicals', 'medical', 'pharma', 'hospital', 'clinic', 'doctor',
            'apollo', 'medplus', 'healthcare', 'diagnostic', 'tablet', 'syrup', 'capsule', 'medicine'
        ]
    },
    {
        category: 'Shopping',
        keywords: [
            'amazon', 'flipkart', 'myntra', 'zara', 'h&m', 'trends', 'lifestyle', 'pantaloons',
            'westside', 'decathlon', 'retail', 'clothing', 'apparel', 'fashion', 'footwear', 'mall',
            'store', 'electronics', 'croma', 'reliance digital'
        ]
    },
    {
        category: 'Bills',
        keywords: [
            'electricity', 'bescom', 'tneb', 'mseb', 'cesc', 'water', 'gas', 'indane', 'hp gas',
            'bharat gas', 'broadband', 'airtel', 'jio', 'vi', 'vodafone', 'bsnl', 'recharge', 'utility', 'bill'
        ]
    },
    {
        category: 'Entertainment',
        keywords: [
            'cinema', 'movie', 'theatre', 'theater', 'pvr', 'inox', 'cinepolis', 'netflix',
            'prime', 'spotify', 'hotstar', 'amusement', 'gaming'
        ]
    },
    {
        category: 'Education',
        keywords: [
            'book', 'books', 'stationery', 'school', 'college', 'university', 'tuition', 'course', 'udemy'
        ]
    }
];

/**
 * Normalizes raw OCR text for consistent parsing while preserving line structures
 */
function normalizeOcrText(rawText) {
    if (!rawText) return '';

    return rawText
        .split(/\r?\n/)
        .map(line => {
            let clean = line.trim();
            if (!clean) return '';

            // Normalize OCR common character replacements in label context
            // e.g. T0TAL -> TOTAL, T0tal -> Total
            clean = clean.replace(/\bT[0O]TAL\b/gi, 'TOTAL');
            clean = clean.replace(/\bSUB[ -]?T[0O]TAL\b/gi, 'SUBTOTAL');
            clean = clean.replace(/\bGR[A4]ND\s*T[0O]TAL\b/gi, 'GRAND TOTAL');
            clean = clean.replace(/\bAM[0O]UNT\b/gi, 'AMOUNT');

            // Standardize currency tokens
            clean = clean.replace(/(?:₹|rs\.?|inr)\s*/gi, '₹ ');

            // Normalize multiple spaces and tabs
            clean = clean.replace(/[ \t]+/g, ' ');

            return clean;
        })
        .join('\n');
}

/**
 * Extracts a numeric amount from a token string (decimal or integer safe)
 */
function parseAmountValue(str) {
    if (!str) return null;
    const cleanStr = str.replace(/,/g, '').trim();
    const val = parseFloat(cleanStr);
    return (!isNaN(val) && val > 0 && isFinite(val)) ? Math.round(val * 100) / 100 : null;
}

/**
 * Robust Total Amount Extraction using Multi-Stage Scoring and Cross-Validation
 */
function extractTotalAmount(lines) {
    const candidates = [];
    let extractedSubtotal = null;
    let extractedTax = null;
    let extractedDiscount = null;

    // Regex patterns for amounts: handles ₹260.00, Rs 260, 260.00, 260, 1,099.50, etc.
    const moneyMatchRegex = /(?:₹\s*|rs\.?\s*|inr\s*)?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/gi;

    // Semantic label regular expressions
    const grandTotalRegex = /\b(grand\s*total|final\s*total)\b/i;
    const highTotalRegex = /\b(total\s*amount|total\s*due|amount\s*due|net\s*payable|amount\s*payable|payable\s*amount|net\s*amount|net\s*total|bill\s*total|order\s*total|invoice\s*total)\b/i;
    const simpleTotalRegex = /\b(total|payable|balance\s*due|total\s*inr|total\s*rs)\b/i;
    const subtotalRegex = /\b(sub\s*total|subtotal|sub-total|taxable\s*amount|taxable\s*value|gross\s*amount|gross\s*total)\b/i;
    const discountRegex = /\b(discount|disc|savings|you\s*saved|less|coupon|rebate)\b/i;
    const taxRegex = /\b(cgst|sgst|igst|gst|tax\s*amount|vat|total\s*tax|service\s*tax)\b/i;
    const ignoreLineRegex = /\b(phone|ph:|tel|mobile|mob:|gstin|fssai|cin|pan|invoice\s*no|bill\s*no|order\s*no|txn|token|pin\s*code|pincode|date|time|table|cashier|pos|card\s*no|visa|mastercard|upi\s*ref|rrn)\b/i;

    // Step 1: Pre-scan for Subtotal, Tax, Discount values for cross-validation
    lines.forEach((line, idx) => {
        const lower = line.toLowerCase();
        
        // Find amounts in this line
        const numbersInLine = [];
        let match;
        const lineMoneyRegex = /(?:₹\s*|rs\.?\s*|inr\s*)?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/gi;
        while ((match = lineMoneyRegex.exec(line)) !== null) {
            const val = parseAmountValue(match[1]);
            // Exclude phone numbers, years, pin codes (> 5 digits without decimals)
            if (val && !(/^\d{5,}$/.test(match[1]))) {
                numbersInLine.push(val);
            }
        }

        if (numbersInLine.length > 0) {
            const lastVal = numbersInLine[numbersInLine.length - 1];
            if (subtotalRegex.test(lower) && !simpleTotalRegex.test(lower.replace(subtotalRegex, ''))) {
                extractedSubtotal = lastVal;
            } else if (discountRegex.test(lower)) {
                extractedDiscount = lastVal;
            } else if (taxRegex.test(lower)) {
                extractedTax = (extractedTax || 0) + lastVal;
            }
        }
    });

    // Step 2: Line by line scoring of every potential total amount
    lines.forEach((line, lineIndex) => {
        const lower = line.toLowerCase();
        const lineLength = lines.length;
        const isLowerHalf = lineIndex >= Math.floor(lineLength * 0.4);
        const isBottomQuarter = lineIndex >= Math.floor(lineLength * 0.7);

        // Find all numbers in the line
        const lineMoneyRegex = /(?:₹\s*|rs\.?\s*|inr\s*)?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/gi;
        let match;

        while ((match = lineMoneyRegex.exec(line)) !== null) {
            const rawNumStr = match[1];
            const amountVal = parseAmountValue(rawNumStr);

            if (!amountVal || amountVal <= 0) continue;

            // Ignore phone numbers, 6-digit pin codes, long barcode numbers (integers with 5+ digits unless explicitly labeled total)
            const isLongInt = /^\d{5,}$/.test(rawNumStr);
            if (isLongInt && !simpleTotalRegex.test(lower) && !highTotalRegex.test(lower)) {
                continue;
            }

            // Calculate base score based on line semantic priority
            let score = 0;
            let labelDetected = '';

            if (grandTotalRegex.test(lower)) {
                score += 300;
                labelDetected = 'GRAND TOTAL';
            } else if (highTotalRegex.test(lower)) {
                score += 250;
                labelDetected = 'HIGH TOTAL (e.g. Total Amount / Amount Due / Net Payable)';
            } else if (simpleTotalRegex.test(lower) && !subtotalRegex.test(lower)) {
                score += 200;
                labelDetected = 'TOTAL';
            } else if (subtotalRegex.test(lower)) {
                score -= 60; // Subtotal should not be the final payable
                labelDetected = 'SUBTOTAL';
            } else if (discountRegex.test(lower)) {
                score -= 150; // Discount should never be chosen as total
                labelDetected = 'DISCOUNT';
            } else if (taxRegex.test(lower)) {
                score -= 80; // Tax lines should not be total
                labelDetected = 'TAX';
            }

            // Check if line contains metadata to ignore (phone, gstin, invoice no)
            if (ignoreLineRegex.test(lower)) {
                score -= 150;
            }

            // Positional boosts (totals almost universally reside in the lower half of receipt)
            if (isBottomQuarter) {
                score += 25;
            } else if (isLowerHalf) {
                score += 15;
            } else {
                score -= 20; // Top half numbers are usually invoice #, phone, or line items
            }

            // Currency symbol presence boost (e.g. ₹ 260 or Rs. 260)
            if (/(?:₹|rs\.?|inr)/i.test(line)) {
                score += 15;
            }

            // Cross-validation boost: If subtotal and discount/tax exist, check if this candidate matches calculated final
            if (extractedSubtotal) {
                const calculatedTotal = Math.round((extractedSubtotal + (extractedTax || 0) - (extractedDiscount || 0)) * 100) / 100;
                if (Math.abs(amountVal - calculatedTotal) < 0.05) {
                    score += 120;
                }
            }

            candidates.push({
                amount: amountVal,
                score: score,
                label: labelDetected,
                line: line,
                lineIndex: lineIndex
            });
        }
    });

    // Step 3: Candidate Selection
    if (candidates.length === 0) {
        // Fallback: If calculated from subtotal + tax - discount exists
        if (extractedSubtotal) {
            const calculated = Math.round((extractedSubtotal + (extractedTax || 0) - (extractedDiscount || 0)) * 100) / 100;
            return {
                amount: calculated,
                confidence: 'MEDIUM',
                subtotal: extractedSubtotal,
                discount: extractedDiscount || 0,
                tax: extractedTax || 0,
                candidates: []
            };
        }
        return {
            amount: null,
            confidence: 'LOW',
            subtotal: null,
            discount: 0,
            tax: 0,
            candidates: []
        };
    }

    // Sort candidates by score descending, then by line index descending (prefer later total lines in tiebreaks)
    candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.lineIndex - a.lineIndex;
    });

    const bestCandidate = candidates[0];
    let confidence = 'LOW';
    if (bestCandidate.score >= 180) {
        confidence = 'HIGH';
    } else if (bestCandidate.score >= 80) {
        confidence = 'MEDIUM';
    }

    return {
        amount: bestCandidate.amount,
        confidence: confidence,
        subtotal: extractedSubtotal,
        discount: extractedDiscount || 0,
        tax: extractedTax || 0,
        candidates: candidates
    };
}

/**
 * Intelligent Merchant Extraction from header lines
 */
function extractMerchantName(lines) {
    if (!lines || lines.length === 0) return 'Store / Merchant';

    const ignoreHeadersRegex = /^(tax invoice|retail invoice|invoice|receipt|cash memo|bill of supply|estimate|bill|customer copy|original|duplicate|gstin|fssai|cin|tel|ph:|phone|date|time|order #|token #|table #|welcome|thank you|thanks)/i;
    const addressKeywords = /\b(road|rd|street|st|lane|nagar|cross|main|floor|block|sector|city|chennai|bangalore|bengaluru|mumbai|delhi|hyderabad|pune|kolkata|india|pin|pincode|opp|near|behind|plot)\b/i;
    const phoneRegex = /\b(\+91|0?[6-9]\d{9}|\d{3,5}[-\s]\d{6,8})\b/;

    // Scan the first 6 non-empty lines
    const topLines = lines.slice(0, 8);

    for (let line of topLines) {
        let clean = line.trim();

        // Strip leading/trailing OCR artifacts (/ FreshMart -> FreshMart, "FreshMart :" -> FreshMart)
        clean = clean.replace(/^[/\*#|:\-_~`\s]+/, '').replace(/[/\*#|:\-_~`\s]+$/, '').trim();

        if (clean.length < 3) continue;
        if (ignoreHeadersRegex.test(clean)) continue;
        if (phoneRegex.test(clean)) continue;
        if (addressKeywords.test(clean) && clean.length > 25) continue;
        if (/^[\d\s\-_.,:/]+$/.test(clean)) continue; // numbers/symbols only

        // Return the first high-quality merchant line
        // Clean up common suffix noise like " - Tax Invoice"
        clean = clean.replace(/\s*[-–|:]\s*(tax invoice|retail invoice|invoice|cash memo).*$/i, '');
        return clean;
    }

    return 'Store Purchase';
}

/**
 * Robust Date Extraction supporting multiple international and Indian receipt formats
 */
function extractDate(lines) {
    const monthMap = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };

    const datePatterns = [
        // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
        /\b([0-3]?[0-9])[-/.]([0-1]?[0-9])[-/.](20\d{2})\b/,
        // YYYY-MM-DD or YYYY/MM/DD
        /\b(20\d{2})[-/.]([0-1]?[0-9])[-/.]([0-3]?[0-9])\b/,
        // DD-Mon-YYYY (e.g. 06-Sep-2025 or 06 Sep 2025)
        /\b([0-3]?[0-9])[-/\s]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/\s]+(20\d{2})\b/i,
        // DD-MM-YY (e.g. 06-09-25 or 06/09/25)
        /\b([0-3]?[0-9])[-/.]([0-1]?[0-9])[-/.](2[0-9])\b/
    ];

    let foundDate = null;
    let labeledDate = null;

    for (const line of lines) {
        const isDateLabel = /\b(date|dt|dated|bill date|invoice date|time)\b/i.test(line);

        for (const pattern of datePatterns) {
            const match = line.match(pattern);
            if (match) {
                let formatted = null;

                if (pattern.source.includes('Jan|Feb')) {
                    const day = match[1].padStart(2, '0');
                    const month = monthMap[match[2].toLowerCase().slice(0, 3)] || '01';
                    const year = match[3];
                    formatted = `${year}-${month}-${day}`;
                } else if (match[1].length === 4) {
                    // YYYY-MM-DD
                    const year = match[1];
                    const month = match[2].padStart(2, '0');
                    const day = match[3].padStart(2, '0');
                    formatted = `${year}-${month}-${day}`;
                } else {
                    // DD-MM-YYYY or DD-MM-YY
                    let year = match[3];
                    if (year.length === 2) year = '20' + year;
                    const month = match[2].padStart(2, '0');
                    const day = match[1].padStart(2, '0');

                    // Validate ranges
                    const mNum = parseInt(month, 10);
                    const dNum = parseInt(day, 10);
                    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
                        formatted = `${year}-${month}-${day}`;
                    }
                }

                if (formatted) {
                    if (isDateLabel && !labeledDate) {
                        labeledDate = formatted;
                    } else if (!foundDate) {
                        foundDate = formatted;
                    }
                }
            }
        }
    }

    // Prefer explicitly labeled date, then fallback to first valid date, or current date
    const finalDate = labeledDate || foundDate || new Date().toISOString().split('T')[0];
    return finalDate;
}

/**
 * Intelligent Category Detection using merchant name and item descriptions
 */
function extractCategory(merchantName, rawText) {
    const combinedText = `${merchantName || ''} ${rawText || ''}`.toLowerCase();

    for (const rule of CATEGORY_RULES) {
        for (const kw of rule.keywords) {
            // Match word boundary to avoid false partial substring matches
            const regex = new RegExp(`\\b${kw}`, 'i');
            if (regex.test(combinedText)) {
                return rule.category;
            }
        }
    }

    return 'Food'; // Default standard expense category
}

/**
 * Main Receipt OCR Parsing Method
 */
function parseReceiptOcr(rawText) {
    const normalizedText = normalizeOcrText(rawText);
    const lines = normalizedText
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

    const merchantName = extractMerchantName(lines);
    const date = extractDate(lines);
    const category = extractCategory(merchantName, normalizedText);
    const totalResult = extractTotalAmount(lines);

    // Formulate clean user-facing status message
    let statusMessage = 'Receipt scanned successfully.';
    if (totalResult.confidence === 'LOW') {
        statusMessage = 'Receipt scanned. Please verify the extracted total amount before saving.';
    } else if (totalResult.amount != null) {
        statusMessage = `Extracted Total: ₹${totalResult.amount.toLocaleString()} from ${merchantName}`;
    }

    // --- PHASE 11 DEBUG LOGGING ---
    console.log('\n--- RECEIPT OCR DEBUG ---');
    console.log('Detected merchant:', merchantName);
    console.log('Detected date:', date);
    console.log('Detected category:', category);
    console.log('Subtotal:', totalResult.subtotal, '| Discount:', totalResult.discount, '| Tax:', totalResult.tax);
    console.log('Candidate total amounts:');
    (totalResult.candidates || []).slice(0, 5).forEach((c, idx) => {
        console.log(`  [${idx + 1}] Amount: ₹${c.amount} | Score: ${c.score} | Label: "${c.label || 'none'}" | Line: "${c.line}"`);
    });
    console.log('Selected total:', totalResult.amount);
    console.log('Total extraction confidence:', totalResult.confidence);
    console.log('-------------------------\n');

    return {
        merchantName: merchantName,
        date: date,
        category: category,
        amount: totalResult.amount,
        subtotal: totalResult.subtotal,
        discount: totalResult.discount,
        tax: totalResult.tax,
        confidence: {
            merchant: merchantName && merchantName !== 'Store Purchase' ? 95 : 60,
            date: date ? 95 : 50,
            total: totalResult.confidence === 'HIGH' ? 98 : (totalResult.confidence === 'MEDIUM' ? 85 : 50),
            level: totalResult.confidence
        },
        rawText: rawText || '',
        message: statusMessage
    };
}

module.exports = {
    parseReceiptOcr,
    normalizeOcrText,
    extractTotalAmount,
    extractMerchantName,
    extractDate,
    extractCategory
};
