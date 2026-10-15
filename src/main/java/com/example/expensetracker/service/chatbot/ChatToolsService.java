package com.example.expensetracker.service.chatbot;

import com.example.expensetracker.dto.BillDto;
import com.example.expensetracker.dto.CategorySummaryDto;
import com.example.expensetracker.dto.DashboardSummaryDto;
import com.example.expensetracker.dto.IncomeRequest;
import com.example.expensetracker.dto.LoanDto;
import com.example.expensetracker.dto.SavingsGoalDto;
import com.example.expensetracker.dto.TransactionDto;
import com.example.expensetracker.dto.TrendSummaryDto;
import com.example.expensetracker.entity.*;
import com.example.expensetracker.repository.TransactionRepository;
import com.example.expensetracker.service.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class ChatToolsService {

    public static final ZoneId KOLKATA_ZONE = ZoneId.of("Asia/Kolkata");
    private static final DateTimeFormatter DAY_MONTH_FMT = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH);
    private static final long PENDING_TIMEOUT_MS = 5 * 60 * 1000L; // 5 minutes

    @Autowired
    private TransactionService transactionService;

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private DashboardService dashboardService;

    @Autowired
    private IncomeService incomeService;

    @Autowired
    private BillService billService;

    @Autowired
    private SavingsGoalService savingsGoalService;

    @Autowired
    private LoanService loanService;

    @Autowired
    private AuthService authService;

    // In-memory pending delete store keyed by userId (expires in 5 minutes)
    private final Map<String, PendingDelete> pendingDeletes = new ConcurrentHashMap<>();

    public static String formatCurrency(BigDecimal amount) {
        if (amount == null) return "0";
        NumberFormat fmt = NumberFormat.getNumberInstance(new Locale("en", "IN"));
        fmt.setMaximumFractionDigits(2);
        fmt.setMinimumFractionDigits(0);
        return fmt.format(amount);
    }

    /**
     * Add transaction (EXPENSE or INCOME)
     */
    public String addTransaction(BigDecimal amount, String category, LocalDate date, String description, TransactionType type) {
        User user = authService.getCurrentAuthenticatedUser();
        if (date == null) {
            date = LocalDate.now(KOLKATA_ZONE);
        }
        if (category == null || category.trim().isEmpty()) {
            category = "Other";
        }
        if (type == null) {
            type = TransactionType.EXPENSE;
        }

        TransactionDto dto = new TransactionDto(null, amount, category, date, description, type);
        TransactionDto saved = transactionService.createTransaction(dto);

        // Fetch category total this month
        YearMonth ym = YearMonth.from(date);
        LocalDate startOfMonth = ym.atDay(1);
        LocalDate endOfMonth = ym.atEndOfMonth();

        final String finalCategory = category;
        List<Transaction> monthlyCategoryTxs = transactionRepository
                .findByUserIdAndTypeAndDateBetween(user.getId(), type, startOfMonth, endOfMonth)
                .stream()
                .filter(t -> finalCategory.equalsIgnoreCase(t.getCategory()))
                .collect(Collectors.toList());

        BigDecimal catTotal = monthlyCategoryTxs.stream()
                .map(Transaction::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        LocalDate today = LocalDate.now(KOLKATA_ZONE);
        String dateStr;
        if (date.isEqual(today)) {
            dateStr = "today (" + date.format(DAY_MONTH_FMT) + ")";
        } else if (date.isEqual(today.minusDays(1))) {
            dateStr = "yesterday (" + date.format(DAY_MONTH_FMT) + ")";
        } else {
            dateStr = date.format(DAY_MONTH_FMT);
        }

        return "Added ₹" + formatCurrency(amount) + " under " + category + " for " + dateStr +
                ". " + category + " total this month: ₹" + formatCurrency(catTotal) + ".";
    }

    /**
     * Checks if there is an active pending delete for the user
     */
    public boolean hasPendingDelete() {
        User user = authService.getCurrentAuthenticatedUser();
        PendingDelete pending = pendingDeletes.get(user.getId());
        if (pending == null) return false;
        if (pending.isExpired(PENDING_TIMEOUT_MS)) {
            pendingDeletes.remove(user.getId());
            return false;
        }
        return true;
    }

    /**
     * Prepare delete for the last expense (highest ID for current user)
     */
    public String prepareDeleteLast() {
        User user = authService.getCurrentAuthenticatedUser();
        List<Transaction> expenses = transactionRepository.findByUserIdAndType(user.getId(), TransactionType.EXPENSE);
        if (expenses.isEmpty()) {
            return "No expenses found for that period.";
        }

        // Highest ID for current user
        Transaction lastExpense = expenses.stream()
                .max(Comparator.comparing(Transaction::getId))
                .orElse(null);

        if (lastExpense == null) {
            return "No expenses found for that period.";
        }

        pendingDeletes.put(user.getId(), new PendingDelete(
                lastExpense.getId(),
                lastExpense.getAmount(),
                lastExpense.getCategory(),
                lastExpense.getDate(),
                lastExpense.getDescription()
        ));

        String descPart = (lastExpense.getDescription() != null && !lastExpense.getDescription().trim().isEmpty())
                ? " (" + lastExpense.getDescription().trim() + ")"
                : "";

        return "Your last expense is ₹" + formatCurrency(lastExpense.getAmount()) + ", " +
                lastExpense.getCategory() + ", " + lastExpense.getDate().format(DAY_MONTH_FMT) +
                descPart + ". Delete it? (yes/no)";
    }

    /**
     * Confirms deletion of the pending transaction
     */
    public String executePendingDelete() {
        User user = authService.getCurrentAuthenticatedUser();
        PendingDelete pending = pendingDeletes.get(user.getId());
        if (pending == null || pending.isExpired(PENDING_TIMEOUT_MS)) {
            pendingDeletes.remove(user.getId());
            return "No pending delete request found, or the request has expired.";
        }

        transactionService.deleteTransaction(pending.getTransactionId());
        pendingDeletes.remove(user.getId());

        return "Deleted ₹" + formatCurrency(pending.getAmount()) + " " +
                pending.getCategory() + " (" + pending.getDate().format(DAY_MONTH_FMT) + ").";
    }

    /**
     * Cancels pending delete
     */
    public String cancelPendingDelete() {
        User user = authService.getCurrentAuthenticatedUser();
        pendingDeletes.remove(user.getId());
        return "Okay, I've kept it.";
    }

    /**
     * Update the last entry (highest ID for current user)
     */
    public String updateLastEntry(BigDecimal newAmount, String newCategory, LocalDate newDate, String newDesc) {
        User user = authService.getCurrentAuthenticatedUser();
        List<Transaction> all = transactionRepository.findByUserIdOrderByDateDesc(user.getId());
        if (all.isEmpty()) {
            return "No transactions found to edit.";
        }

        // Highest ID for current user
        Transaction last = all.stream()
                .max(Comparator.comparing(Transaction::getId))
                .orElse(null);

        if (last == null) {
            return "No transactions found to edit.";
        }

        BigDecimal oldAmount = last.getAmount();
        String oldCat = last.getCategory();
        LocalDate oldDate = last.getDate();

        if (newAmount != null) last.setAmount(newAmount);
        if (newCategory != null) last.setCategory(newCategory);
        if (newDate != null) last.setDate(newDate);
        if (newDesc != null) last.setDescription(newDesc);

        transactionService.updateTransaction(last.getId(), transactionService.convertToDto(last));

        return "Updated your last entry (" + oldCat + ", " + oldDate.format(DAY_MONTH_FMT) +
                ") from ₹" + formatCurrency(oldAmount) + " to ₹" + formatCurrency(last.getAmount()) + ".";
    }

    /**
     * Spending summary for range
     */
    public String getSpendingSummary(LocalDate start, LocalDate end, String category, String label) {
        User user = authService.getCurrentAuthenticatedUser();
        List<Transaction> txs = transactionRepository.findByUserIdAndTypeAndDateBetween(
                user.getId(), TransactionType.EXPENSE, start, end);

        if (category != null && !category.trim().isEmpty()) {
            txs = txs.stream()
                    .filter(t -> category.equalsIgnoreCase(t.getCategory()))
                    .collect(Collectors.toList());
        }

        if (txs.isEmpty()) {
            return "No expenses found for that period.";
        }

        BigDecimal total = txs.stream()
                .map(Transaction::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        int count = txs.size();
        String catPart = (category != null && !category.trim().isEmpty()) ? " on " + category : "";
        return "You spent ₹" + formatCurrency(total) + catPart + " " + label + " across " + count + " transaction" + (count == 1 ? "" : "s") + ".";
    }

    /**
     * Biggest expense in range
     */
    public String getBiggestExpense(LocalDate start, LocalDate end) {
        User user = authService.getCurrentAuthenticatedUser();
        List<Transaction> txs = transactionRepository.findByUserIdAndTypeAndDateBetween(
                user.getId(), TransactionType.EXPENSE, start, end);

        if (txs.isEmpty()) {
            return "No expenses found for that period.";
        }

        Transaction max = txs.stream()
                .max(Comparator.comparing(Transaction::getAmount))
                .orElse(null);

        if (max == null) {
            return "No expenses found for that period.";
        }

        String desc = (max.getDescription() != null && !max.getDescription().trim().isEmpty())
                ? " (" + max.getDescription().trim() + ")"
                : "";

        return "Your biggest expense this month is ₹" + formatCurrency(max.getAmount()) + " on " +
                max.getCategory() + " on " + max.getDate().format(DAY_MONTH_FMT) + desc + ".";
    }

    /**
     * List recent transactions
     */
    public String listRecentTransactions(int limit) {
        User user = authService.getCurrentAuthenticatedUser();
        List<Transaction> txs = transactionRepository.findByUserIdOrderByDateDescCreatedAtDesc(user.getId());
        if (txs.isEmpty()) {
            return "No expenses found for that period.";
        }

        List<Transaction> subset = txs.stream().limit(limit).collect(Collectors.toList());
        StringBuilder sb = new StringBuilder("Here are your last " + subset.size() + " transactions:\n");
        for (Transaction t : subset) {
            String desc = (t.getDescription() != null && !t.getDescription().trim().isEmpty()) ? " - " + t.getDescription().trim() : "";
            sb.append("• ").append(t.getDate().format(DAY_MONTH_FMT))
                    .append(": ₹").append(formatCurrency(t.getAmount()))
                    .append(" (").append(t.getCategory()).append(")")
                    .append(desc).append("\n");
        }
        return sb.toString().trim();
    }

    /**
     * Top category spending
     */
    public String getTopCategorySummary() {
        User user = authService.getCurrentAuthenticatedUser();
        List<CategorySummaryDto> list = dashboardService.getCategorySummary("current_month", null, null);
        if (list.isEmpty()) {
            return "No expenses found for that period.";
        }

        CategorySummaryDto top = list.stream().max(Comparator.comparing(CategorySummaryDto::getAmount)).orElse(null);
        if (top == null) {
            return "No expenses found for that period.";
        }

        return "You spend the most on " + top.getCategory() + " this month: ₹" +
                formatCurrency(top.getAmount()) + " (" + Math.round(top.getPercentage()) + "% of total spending).";
    }

    /**
     * 6-Month trend overview
     */
    public String getSpendingTrend() {
        User user = authService.getCurrentAuthenticatedUser();
        List<TrendSummaryDto> trend = dashboardService.getTrendData(LocalDate.now(KOLKATA_ZONE).getYear());
        if (trend.isEmpty()) {
            return "No expenses found for that period.";
        }

        StringBuilder sb = new StringBuilder("Spending trend for this year:\n");
        int currentMonth = LocalDate.now(KOLKATA_ZONE).getMonthValue();
        int start = Math.max(0, currentMonth - 6);
        for (int i = start; i < currentMonth && i < trend.size(); i++) {
            TrendSummaryDto m = trend.get(i);
            sb.append("• ").append(m.getMonth()).append(": Expenses ₹")
                    .append(formatCurrency(m.getExpense())).append("\n");
        }
        return sb.toString().trim();
    }

    /**
     * Export report
     */
    public String exportReport(String format) {
        if (format == null || format.trim().isEmpty()) {
            return "PDF or Excel?";
        }
        String f = format.trim().toLowerCase(Locale.ENGLISH);
        if (f.contains("pdf")) {
            return "Here is your PDF report:\n\n[Download PDF Report](/api/export/pdf)";
        } else if (f.contains("excel") || f.contains("xlsx") || f.contains("sheet")) {
            return "Here is your Excel report:\n\n[Download Excel Report](/api/export/excel)";
        }
        return "PDF or Excel?";
    }

    /**
     * List upcoming bills
     */
    public String listUpcomingBills() {
        User user = authService.getCurrentAuthenticatedUser();
        List<BillDto> bills = billService.getAllBills();
        List<BillDto> unpaid = bills.stream()
                .filter(b -> Boolean.FALSE.equals(b.getIsPaid()))
                .sorted(Comparator.comparing(BillDto::getDueDate))
                .collect(Collectors.toList());

        if (unpaid.isEmpty()) {
            return "You have no upcoming bills.";
        }

        LocalDate today = LocalDate.now(KOLKATA_ZONE);
        StringBuilder sb = new StringBuilder("Upcoming bills:\n");
        for (BillDto b : unpaid) {
            long days = ChronoUnit.DAYS.between(today, b.getDueDate());
            String status = days < 0 ? " (OVERDUE)" : (days == 0 ? " (Due today!)" : " (due in " + days + " days)");
            sb.append("• ").append(b.getBillName()).append(": ₹").append(formatCurrency(b.getAmount()))
                    .append(" on ").append(b.getDueDate().format(DAY_MONTH_FMT))
                    .append(status).append("\n");
        }
        return sb.toString().trim();
    }

    /**
     * Create a recurring bill
     */
    public String createBill(String name, BigDecimal amount, String category, LocalDate dueDate, RecurringFrequency freq, Integer reminderDays) {
        if (freq == null) freq = RecurringFrequency.MONTHLY;
        if (reminderDays == null) reminderDays = 3;
        if (dueDate == null) dueDate = LocalDate.now(KOLKATA_ZONE).plusMonths(1);
        if (category == null) category = "Bills";

        BillDto dto = new BillDto();
        dto.setBillName(name);
        dto.setAmount(amount);
        dto.setCategory(category);
        dto.setDueDate(dueDate);
        dto.setRecurringFrequency(freq);
        dto.setReminderDays(reminderDays);
        dto.setIsPaid(false);

        BillDto saved = billService.createBill(dto);

        return "Created bill reminder for " + saved.getBillName() + " (₹" + formatCurrency(saved.getAmount()) +
                ") due " + saved.getDueDate().format(DAY_MONTH_FMT) + ".";
    }

    /**
     * Monthly summary report block
     */
    public String getMonthlySummaryReport() {
        User user = authService.getCurrentAuthenticatedUser();
        DashboardSummaryDto summary = dashboardService.getDashboardSummary("current_month", null, null);
        List<CategorySummaryDto> cats = dashboardService.getCategorySummary("current_month", null, null);

        StringBuilder sb = new StringBuilder("Monthly summary for " + summary.getPeriodName() + ":\n");
        sb.append("• Income: ₹").append(formatCurrency(summary.getTotalIncome())).append("\n");
        sb.append("• Total Expenses: ₹").append(formatCurrency(summary.getTotalExpenses())).append("\n");
        sb.append("• Balance: ₹").append(formatCurrency(summary.getCurrentBalance())).append("\n");

        if (!cats.isEmpty()) {
            sb.append("\nTop categories:\n");
            cats.stream().limit(3).forEach(c ->
                    sb.append("• ").append(c.getCategory()).append(": ₹").append(formatCurrency(c.getAmount()))
                            .append(" (").append(Math.round(c.getPercentage())).append("%)\n")
            );
        }

        return sb.toString().trim();
    }

    /**
     * How much did I save this month
     */
    public String getSavingsThisMonth() {
        DashboardSummaryDto summary = dashboardService.getDashboardSummary("current_month", null, null);
        if (summary.getTotalIncome().compareTo(BigDecimal.ZERO) == 0) {
            return "Add your monthly income to see savings.";
        }
        return "You saved ₹" + formatCurrency(summary.getSavings()) + " this month (" +
                summary.getSavingsPercentage() + "% of income).";
    }

    /**
     * What is my current balance
     */
    public String getCurrentBalance() {
        DashboardSummaryDto summary = dashboardService.getDashboardSummary("current_month", null, null);
        if (summary.getTotalIncome().compareTo(BigDecimal.ZERO) == 0) {
            return "Add your monthly income to see your current balance.";
        }
        return "Your current balance is ₹" + formatCurrency(summary.getCurrentBalance()) +
                " (Total Income: ₹" + formatCurrency(summary.getTotalIncome()) +
                ", Total Expenses: ₹" + formatCurrency(summary.getTotalExpenses()) + ").";
    }

    /**
     * Am I overspending
     */
    public String checkOverspending() {
        DashboardSummaryDto currentSummary = dashboardService.getDashboardSummary("current_month", null, null);
        BigDecimal income = currentSummary.getTotalIncome();
        BigDecimal expenses = currentSummary.getTotalExpenses();

        if (income.compareTo(BigDecimal.ZERO) == 0) {
            return "Add your monthly income to see if you are overspending.";
        }

        if (expenses.compareTo(income) > 0) {
            BigDecimal over = expenses.subtract(income);
            return "Yes, you are overspending this month. Your expenses (₹" + formatCurrency(expenses) +
                    ") exceed your income (₹" + formatCurrency(income) + ") by ₹" + formatCurrency(over) + ".";
        } else {
            BigDecimal remaining = income.subtract(expenses);
            return "No, you are within your income. You have spent ₹" + formatCurrency(expenses) +
                    " out of ₹" + formatCurrency(income) + " (₹" + formatCurrency(remaining) + " remaining).";
        }
    }

    /**
     * Compare this month's spending with last month
     */
    public String compareWithLastMonth() {
        User user = authService.getCurrentAuthenticatedUser();
        DashboardSummaryDto currentSummary = dashboardService.getDashboardSummary("current_month", null, null);
        DashboardSummaryDto prevSummary = dashboardService.getDashboardSummary("previous_month", null, null);

        BigDecimal currentExp = currentSummary.getTotalExpenses();
        BigDecimal prevExp = prevSummary.getTotalExpenses();
        BigDecimal diff = currentExp.subtract(prevExp);

        String direction = diff.compareTo(BigDecimal.ZERO) >= 0 ? "higher" : "lower";
        if (prevExp.compareTo(BigDecimal.ZERO) > 0) {
            double pct = diff.multiply(new BigDecimal(100)).divide(prevExp, 1, java.math.RoundingMode.HALF_UP).doubleValue();
            return "You spent ₹" + formatCurrency(currentExp) + " this month vs ₹" + formatCurrency(prevExp) +
                    " last month (₹" + formatCurrency(diff.abs()) + " " + direction + ", " + Math.abs(pct) + "%).";
        } else {
            return "You spent ₹" + formatCurrency(currentExp) + " this month vs ₹0 last month (₹" +
                    formatCurrency(diff.abs()) + " " + direction + ").";
        }
    }
}
