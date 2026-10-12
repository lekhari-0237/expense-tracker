const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

function parseDateRange(period, customStart, customEnd) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let startDate = null;
    let endDate = new Date(now);

    if (period === 'custom' && customStart && customEnd) {
        startDate = new Date(customStart);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(customEnd);
        endDate.setHours(23, 59, 59, 999);
        return { startDate, endDate, label: `${customStart} to ${customEnd}` };
    }

    switch (period) {
        case 'previous_month':
        case 'last_month':
            startDate = new Date(currentYear, currentMonth - 1, 1);
            endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
            return { startDate, endDate, label: 'Previous Month' };
        case 'current_year':
            startDate = new Date(currentYear, 0, 1);
            endDate = new Date(currentYear, 11, 31, 23, 59, 59, 999);
            return { startDate, endDate, label: `Year ${currentYear}` };
        case 'current_month':
        default:
            startDate = new Date(currentYear, currentMonth, 1);
            endDate = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);
            return { startDate, endDate, label: 'Current Month' };
    }
}

// Generate simple valid standard PDF
function generatePdfBuffer(userName, dateLabel, transactions, totalIncome, totalExpense, balance) {
    // Generate standard PDF stream
    const title = `Smart Expense Tracker Report`;
    const subtitle = `User: ${userName || 'User'} | Period: ${dateLabel}`;
    const summary = `Total Income: INR ${totalIncome.toFixed(2)}  |  Total Expense: INR ${totalExpense.toFixed(2)}  |  Net Balance: INR ${balance.toFixed(2)}`;
    
    let contentStream = `BT\n/F1 18 Tf\n50 750 Td\n(${title}) Tj\nET\n`;
    contentStream += `BT\n/F1 11 Tf\n50 730 Td\n(${subtitle}) Tj\nET\n`;
    contentStream += `BT\n/F1 11 Tf\n50 710 Td\n(${summary}) Tj\nET\n`;
    contentStream += `50 695 m 550 695 l S\n`; // Horizontal line
    
    // Table Headers
    contentStream += `BT\n/F2 10 Tf\n50 680 Td\n(Date) Tj\nET\n`;
    contentStream += `BT\n/F2 10 Tf\n120 680 Td\n(Type) Tj\nET\n`;
    contentStream += `BT\n/F2 10 Tf\n180 680 Td\n(Category) Tj\nET\n`;
    contentStream += `BT\n/F2 10 Tf\n280 680 Td\n(Description) Tj\nET\n`;
    contentStream += `BT\n/F2 10 Tf\n480 680 Td\n(Amount (INR)) Tj\nET\n`;
    contentStream += `50 672 m 550 672 l S\n`;

    let y = 655;
    const maxTxns = Math.min(transactions.length, 30); // show up to 30 transactions on page
    for (let i = 0; i < maxTxns; i++) {
        const t = transactions[i];
        const dStr = t.date ? new Date(t.date).toISOString().split('T')[0] : '';
        const typeStr = (t.type || 'EXPENSE').toUpperCase();
        const catStr = (t.category || 'General').substring(0, 15).replace(/[()\\]/g, '');
        const descStr = (t.description || t.merchant || '').substring(0, 30).replace(/[()\\]/g, '');
        const amtStr = `${typeStr === 'INCOME' ? '+' : '-'} INR ${t.amount.toFixed(2)}`;

        contentStream += `BT\n/F1 9 Tf\n50 ${y} Td\n(${dStr}) Tj\nET\n`;
        contentStream += `BT\n/F1 9 Tf\n120 ${y} Td\n(${typeStr}) Tj\nET\n`;
        contentStream += `BT\n/F1 9 Tf\n180 ${y} Td\n(${catStr}) Tj\nET\n`;
        contentStream += `BT\n/F1 9 Tf\n280 ${y} Td\n(${descStr}) Tj\nET\n`;
        contentStream += `BT\n/F1 9 Tf\n480 ${y} Td\n(${amtStr}) Tj\nET\n`;
        y -= 18;
    }

    if (transactions.length > maxTxns) {
        contentStream += `BT\n/F1 9 Tf\n50 ${y} Td\n(... and ${transactions.length - maxTxns} more transactions) Tj\nET\n`;
    }

    // PDF Object structure
    const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
    const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
    const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n`;
    const obj4 = `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
    const obj5 = `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`;
    const obj6 = `6 0 obj\n<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream\nendobj\n`;

    const header = `%PDF-1.4\n`;
    const objects = [obj1, obj2, obj3, obj4, obj5, obj6];
    let offset = header.length;
    const xref = [`xref\n0 7\n0000000000 65535 f \n`];

    for (let i = 0; i < objects.length; i++) {
        xref.push(String(offset).padStart(10, '0') + ' 00000 n \n');
        offset += Buffer.byteLength(objects[i], 'utf8');
    }

    const xrefOffset = offset;
    const trailer = `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

    const pdfString = header + objects.join('') + xref.join('') + trailer;
    return Buffer.from(pdfString, 'utf8');
}

// Generate Excel XML Spreadsheet (native compatibility with MS Excel & LibreOffice)
function generateExcelXml(userName, dateLabel, transactions, totalIncome, totalExpense, balance) {
    let rowsXml = '';

    // Summary Header rows
    rowsXml += `
    <Row>
      <Cell><Data ss:Type="String">Smart Expense Tracker Financial Report</Data></Cell>
    </Row>
    <Row>
      <Cell><Data ss:Type="String">User: ${userName || 'User'}</Data></Cell>
      <Cell><Data ss:Type="String">Period: ${dateLabel}</Data></Cell>
    </Row>
    <Row>
      <Cell><Data ss:Type="String">Total Income (₹):</Data></Cell>
      <Cell><Data ss:Type="Number">${totalIncome}</Data></Cell>
    </Row>
    <Row>
      <Cell><Data ss:Type="String">Total Expense (₹):</Data></Cell>
      <Cell><Data ss:Type="Number">${totalExpense}</Data></Cell>
    </Row>
    <Row>
      <Cell><Data ss:Type="String">Net Savings / Balance (₹):</Data></Cell>
      <Cell><Data ss:Type="Number">${balance}</Data></Cell>
    </Row>
    <Row></Row>
    <Row>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Date</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Type</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Category</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Description</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Merchant</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Source</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Amount (INR)</Data></Cell>
    </Row>
  `;

    transactions.forEach(t => {
        const dStr = t.date ? new Date(t.date).toISOString().split('T')[0] : '';
        const typeStr = (t.type || 'EXPENSE').toUpperCase();
        const catStr = (t.category || 'General').replace(/[<>&'"]/g, '');
        const descStr = (t.description || '').replace(/[<>&'"]/g, '');
        const merchStr = (t.merchant || '').replace(/[<>&'"]/g, '');
        const srcStr = (t.source || 'manual').replace(/[<>&'"]/g, '');

        rowsXml += `
      <Row>
        <Cell><Data ss:Type="String">${dStr}</Data></Cell>
        <Cell><Data ss:Type="String">${typeStr}</Data></Cell>
        <Cell><Data ss:Type="String">${catStr}</Data></Cell>
        <Cell><Data ss:Type="String">${descStr}</Data></Cell>
        <Cell><Data ss:Type="String">${merchStr}</Data></Cell>
        <Cell><Data ss:Type="String">${srcStr}</Data></Cell>
        <Cell><Data ss:Type="Number">${t.amount}</Data></Cell>
      </Row>
    `;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Bottom"/>
  </Style>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#2563EB" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Transactions">
  <Table>
    <Column ss:Width="90"/>
    <Column ss:Width="80"/>
    <Column ss:Width="110"/>
    <Column ss:Width="180"/>
    <Column ss:Width="120"/>
    <Column ss:Width="90"/>
    <Column ss:Width="100"/>
    ${rowsXml}
  </Table>
 </Worksheet>
</Workbook>`;
}

// GET /api/export/pdf
router.get('/pdf', protect, async (req, res) => {
    try {
        const { period, startDate, endDate } = req.query;
        const { startDate: sDate, endDate: eDate, label } = parseDateRange(period, startDate, endDate);

        const dateQuery = { user: req.user._id };
        if (sDate && eDate) {
            dateQuery.date = { $gte: sDate, $lte: eDate };
        }

        const transactions = await Transaction.find(dateQuery).sort({ date: -1 });

        let totalIncome = 0;
        let totalExpense = 0;
        transactions.forEach(t => {
            if (t.type === 'INCOME' || t.type === 'income') totalIncome += t.amount;
            else totalExpense += t.amount;
        });

        const balance = totalIncome - totalExpense;
        const pdfBuffer = generatePdfBuffer(req.user.name, label, transactions, totalIncome, totalExpense, balance);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="ExpenseTracker_Report_${period || 'month'}.pdf"`);
        res.send(pdfBuffer);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/export/excel
router.get('/excel', protect, async (req, res) => {
    try {
        const { period, startDate, endDate } = req.query;
        const { startDate: sDate, endDate: eDate, label } = parseDateRange(period, startDate, endDate);

        const dateQuery = { user: req.user._id };
        if (sDate && eDate) {
            dateQuery.date = { $gte: sDate, $lte: eDate };
        }

        const transactions = await Transaction.find(dateQuery).sort({ date: -1 });

        let totalIncome = 0;
        let totalExpense = 0;
        transactions.forEach(t => {
            if (t.type === 'INCOME' || t.type === 'income') totalIncome += t.amount;
            else totalExpense += t.amount;
        });

        const balance = totalIncome - totalExpense;
        const excelXml = generateExcelXml(req.user.name, label, transactions, totalIncome, totalExpense, balance);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="ExpenseTracker_Report_${period || 'month'}.xlsx"`);
        res.send(Buffer.from(excelXml, 'utf8'));
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
