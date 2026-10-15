'use strict';

/** Indian-rupee formatting: ₹1,20,000 */
function formatRupees(amount) {
    if (amount === undefined || amount === null || isNaN(amount)) return '₹0';
    const n = Number(amount);
    const sign = n < 0 ? '-' : '';
    return `${sign}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatList(items) {
    return items.join('\n');
}

module.exports = { formatRupees, formatList };
