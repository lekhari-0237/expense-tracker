const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/authMiddleware');
const { resolvePeriod, zonedTimeToUtc, formatDate } = require('../utils/dateUtil');

function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Custom ranges are wall-clock days in APP_TIMEZONE, so "2026-10-01" means October
// 1st for the user, not the UTC instant a browser would guess.
function customRange(startStr, endStr) {
    const s = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(startStr || ''));
    const e = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(endStr || ''));
    if (!s || !e) return null;
    let start = { y: +s[1], m: +s[2], d: +s[3] };
    let end = { y: +e[1], m: +e[2], d: +e[3] };
    if (end.y * 10000 + end.m * 100 + end.d < start.y * 10000 + start.m * 100 + start.d) {
        [start, end] = [end, start];
    }
    return {
        startDate: zonedTimeToUtc(start.y, start.m, start.d, 0, 0, 0, 0),
        endDate: zonedTimeToUtc(end.y, end.m, end.d, 23, 59, 59, 999),
        label: `${start.y}-${String(start.m).padStart(2, '0')}-${String(start.d).padStart(2, '0')} to ${end.y}-${String(end.m).padStart(2, '0')}-${String(end.d).padStart(2, '0')}`
    };
}

function resolveRange(query) {
    const custom = customRange(query.startDate, query.endDate);
    if (custom) return custom;
    return resolvePeriod(query.period || 'current_month');
}

function isIncome(type) {
    return String(type || '').toUpperCase() === 'INCOME';
}

function summarize(transactions) {
    let income = 0;
    let expense = 0;
    for (const t of transactions) {
        const amt = Number(t.amount) || 0;
        if (isIncome(t.type)) income += amt;
        else expense += amt;
    }
    return { income: round2(income), expense: round2(expense), balance: round2(income - expense), count: transactions.length };
}

async function loadReport(userId, query) {
    const { startDate, endDate, label } = resolveRange(query);
    const dateQuery = { user: userId };
    if (startDate && endDate) dateQuery.date = { $gte: startDate, $lte: endDate };

    const docs = await Transaction.find(dateQuery).sort({ date: -1, createdAt: -1 });
    const rows = docs.map(t => ({
        date: formatDate(t.date),
        type: isIncome(t.type) ? 'INCOME' : 'EXPENSE',
        category: t.category || 'General',
        description: t.description || t.merchant || t.category || '',
        merchant: t.merchant || '',
        source: t.source || 'manual',
        paymentMethod: t.paymentMethod || '',
        notes: t.notes || '',
        amount: round2(Number(t.amount) || 0)
    }));

    return { rows, totals: summarize(rows), label, startDate, endDate };
}

// ---------------------------------------------------------------- PDF ---------
// The 14 core PDF fonts carry no rupee glyph, so amounts are labelled "INR" here.
// Column x positions are chosen for 9pt Helvetica (~4.8pt per character) so the
// clipped text of one column never runs under the next one.
const PDF_COLUMNS = [
    { key: 'date', title: 'Date', x: 40, max: 10 },
    { key: 'type', title: 'Type', x: 90, max: 7 },
    { key: 'category', title: 'Category', x: 128, max: 16 },
    { key: 'description', title: 'Description', x: 210, max: 24 },
    { key: 'paymentMethod', title: 'Method', x: 330, max: 14 },
    { key: 'notes', title: 'Notes', x: 402, max: 24 },
    { key: 'amount', title: 'Amount INR', x: 522, max: 12 }
];

const PDF_LEFT = 40;
const PDF_RIGHT = 572;
const PDF_TOP = 750;
const PDF_BOTTOM = 56;
const PDF_ROW_HEIGHT = 15;

function pdfText(value) {
    // PDF literal strings: only ASCII is safe without an embedded font, and
    // \ ( ) must be escaped. Stripping is limited to what the encoding cannot hold.
    const clipped = String(value === null || value === undefined ? '' : value)
        .replace(/\r?\n/g, ' ')
        .slice(0, 200);
    return clipped
        .split('')
        .map(ch => {
            const code = ch.charCodeAt(0);
            if (code === 92 || code === 40 || code === 41) return '\\' + ch;
            if (code < 32 || code > 126) return '?';
            return ch;
        })
        .join('');
}

function clipTo(value, maxChars) {
    const s = String(value || '');
    return s.length > maxChars ? `${s.slice(0, Math.max(1, maxChars - 3))}...` : s;
}

function pdfRow(x, y, text, font = 'F1', size = 9) {
    return `BT\n/${font} ${size} Tf\n${x} ${y} Td\n(${pdfText(text)}) Tj\nET\n`;
}

function pdfRule(y) {
    return `${PDF_LEFT} ${y} m ${PDF_RIGHT} ${y} l S\n`;
}

function pdfTableHeader(y) {
    let out = pdfRule(y + 12);
    for (const col of PDF_COLUMNS) out += pdfRow(col.x, y, col.title, 'F2', 9);
    out += pdfRule(y + 4);
    return out;
}

function assemblePdf(pagesContent) {
    const pageCount = pagesContent.length;
    // 1 Catalog, 2 Pages root, 3/4 fonts, then page + content pair per page.
    const firstPageObj = 5;
    const kids = [];
    for (let i = 0; i < pageCount; i++) kids.push(`${firstPageObj + i * 2} 0 R`);

    const objects = [];
    objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
    objects.push(`2 0 obj\n<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pageCount} >>\nendobj\n`);
    objects.push(`3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);
    objects.push(`4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`);

    pagesContent.forEach((content, i) => {
        const pageNum = firstPageObj + i * 2;
        const contentNum = pageNum + 1;
        objects.push(`${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] `
            + `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNum} 0 R >>\nendobj\n`);
        objects.push(`${contentNum} 0 obj\n<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream\nendobj\n`);
    });

    let out = `%PDF-1.4\n`;
    const xrefRows = ['0000000000 65535 f \n'];
    for (const obj of objects) {
        xrefRows.push(`${String(Buffer.byteLength(out, 'utf8')).padStart(10, '0')} 00000 n \n`);
        out += obj;
    }
    const startxref = Buffer.byteLength(out, 'utf8');
    out += `xref\n0 ${objects.length + 1}\n${xrefRows.join('')}`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
    return Buffer.from(out, 'utf8');
}

function generatePdfBuffer(userName, dateLabel, rows, totals) {
    const generatedOn = formatDate(new Date());
    const summary = `Income INR ${totals.income.toFixed(2)}   Expense INR ${totals.expense.toFixed(2)}   Net INR ${totals.balance.toFixed(2)}   Transactions ${totals.count}`;

    const pages = [];
    let index = 0;
    let pageIndex = 0;

    do {
        const isFirstPage = pageIndex === 0;
        let y = isFirstPage ? PDF_TOP : PDF_TOP - 10;
        let content = '';

        if (isFirstPage) {
            content += pdfRow(PDF_LEFT, y, 'Smart Expense Tracker Report', 'F2', 17); y -= 18;
            content += pdfRow(PDF_LEFT, y, `User: ${userName || 'User'}   Period: ${dateLabel}   Generated: ${generatedOn}`, 'F1', 10); y -= 15;
            content += pdfRow(PDF_LEFT, y, summary, 'F1', 10); y -= 14;
        } else {
            content += pdfRow(PDF_LEFT, y, `Smart Expense Tracker Report - ${dateLabel} (continued)`, 'F2', 11); y -= 12;
        }

        content += pdfTableHeader(y - 6);
        y -= 22;

        const capacity = Math.floor((y - PDF_BOTTOM) / PDF_ROW_HEIGHT) + 1;
        const end = Math.min(index + capacity, rows.length);
        for (; index < end; index++) {
            const row = rows[index];
            content += pdfRow(PDF_COLUMNS[0].x, y, row.date);
            content += pdfRow(PDF_COLUMNS[1].x, y, row.type);
            content += pdfRow(PDF_COLUMNS[2].x, y, clipTo(row.category, PDF_COLUMNS[2].max));
            content += pdfRow(PDF_COLUMNS[3].x, y, clipTo(row.description || row.merchant, PDF_COLUMNS[3].max));
            content += pdfRow(PDF_COLUMNS[4].x, y, clipTo(row.paymentMethod || '-', PDF_COLUMNS[4].max));
            content += pdfRow(PDF_COLUMNS[5].x, y, clipTo(row.notes, PDF_COLUMNS[5].max));
            content += pdfRow(PDF_COLUMNS[6].x, y, clipTo(`${row.type === 'INCOME' ? '+' : '-'}${row.amount.toFixed(2)}`, PDF_COLUMNS[6].max));
            y -= PDF_ROW_HEIGHT;
        }

        if (rows.length === 0) {
            content += pdfRow(PDF_COLUMNS[0].x, y, 'No transactions recorded for this period.', 'F1', 10);
        }

        pages.push(content);
        pageIndex++;
    } while (index < rows.length);

    const total = pages.length;
    const bodies = pages.map((content, i) => {
        let footer = pdfRule(46);
        footer += pdfRow(PDF_LEFT, 34, `Page ${i + 1} of ${total}`, 'F1', 8);
        footer += pdfRow(PDF_RIGHT - 150, 34, `Net balance INR ${totals.balance.toFixed(2)}`, 'F1', 8);
        return content + footer;
    });

    return assemblePdf(bodies);
}

// ------------------------------------------------------------ EXCEL ----------
// SpreadsheetML 2003 (the format Excel opens as .xls). Producing a real .xlsx would
// need a zipped OOXML writer, so the payload keeps its honest name and MIME type.
function xmlEscape(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function xmlCell(value, type = 'String', styleId = null) {
    const style = styleId ? ` ss:StyleID="${styleId}"` : '';
    return `<Cell${style}><Data ss:Type="${type}">${type === 'String' ? xmlEscape(value) : value}</Data></Cell>`;
}

function generateExcelXml(userName, dateLabel, rows, totals, generatedOn) {
    const headerTitles = ['Date', 'Type', 'Category', 'Description', 'Merchant', 'Source', 'Payment method', 'Notes', 'Amount (INR)'];

    let body = `<Row>${xmlCell('Smart Expense Tracker Financial Report', 'String', 'Title')}</Row>\n`;
    body += `<Row>${xmlCell(`User: ${userName || 'User'}`)}${xmlCell(`Period: ${dateLabel}`)}${xmlCell(`Generated: ${generatedOn}`)}</Row>\n`;
    body += `<Row>${xmlCell('Total Income (INR):')}${xmlCell(totals.income.toFixed(2), 'Number')}</Row>\n`;
    body += `<Row>${xmlCell('Total Expense (INR):')}${xmlCell(totals.expense.toFixed(2), 'Number')}</Row>\n`;
    body += `<Row>${xmlCell('Net Savings / Balance (INR):')}${xmlCell(totals.balance.toFixed(2), 'Number')}</Row>\n`;
    body += `<Row>${xmlCell('Transactions:')}${xmlCell(totals.count, 'Number')}</Row>\n`;
    body += `<Row></Row>\n`;
    body += `<Row>${headerTitles.map(t => xmlCell(t, 'String', 'Header')).join('')}</Row>\n`;

    for (const row of rows) {
        body += '<Row>' + [
            xmlCell(row.date),
            xmlCell(row.type),
            xmlCell(row.category),
            xmlCell(row.description),
            xmlCell(row.merchant),
            xmlCell(row.source),
            xmlCell(row.paymentMethod),
            xmlCell(row.notes),
            xmlCell(row.amount.toFixed(2), 'Number')
        ].join('') + '</Row>\n';
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Bottom"/></Style>
  <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="13" ss:Color="#111827"/></Style>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#2563EB" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Transactions">
  <Table ss:StyleID="Default">
    <Column ss:Width="80"/><Column ss:Width="60"/><Column ss:Width="100"/>
    <Column ss:Width="170"/><Column ss:Width="110"/><Column ss:Width="70"/>
    <Column ss:Width="90"/><Column ss:Width="150"/><Column ss:Width="90"/>
    ${body}
  </Table>
 </Worksheet>
</Workbook>`;
}

// GET /api/export/pdf
router.get('/pdf', protect, async (req, res) => {
    try {
        const { rows, totals, label } = await loadReport(req.user._id, req.query);
        const pdfBuffer = generatePdfBuffer(req.user.username, label, rows, totals);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="ExpenseTracker_Report_${req.query.period || 'month'}.pdf"`);
        res.send(pdfBuffer);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/export/excel
router.get('/excel', protect, async (req, res) => {
    try {
        const { rows, totals, label } = await loadReport(req.user._id, req.query);
        const excelXml = generateExcelXml(req.user.username, label, rows, totals, formatDate(new Date()));

        res.setHeader('Content-Type', 'application/vnd.ms-excel');
        res.setHeader('Content-Disposition', `attachment; filename="ExpenseTracker_Report_${req.query.period || 'month'}.xls"`);
        res.send(Buffer.from(excelXml, 'utf8'));
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
