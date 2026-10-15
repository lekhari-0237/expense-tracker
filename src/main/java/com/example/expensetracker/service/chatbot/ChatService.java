package com.example.expensetracker.service.chatbot;

import com.example.expensetracker.entity.RecurringFrequency;
import com.example.expensetracker.entity.TransactionType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.Month;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.TextStyle;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);
    private static final ZoneId KOLKATA_ZONE = ZoneId.of("Asia/Kolkata");

    private static final Pattern AMOUNT_PATTERN = Pattern.compile(
            "(?:₹|rs\\.?|inr)?\\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]+)?|[0-9]+(?:\\.[0-9]+)?)",
            Pattern.CASE_INSENSITIVE
    );

    @Autowired
    private ChatToolsService chatToolsService;

    @Autowired
    private ChatIntentClassifier chatIntentClassifier;

    @Autowired
    private LlmClient llmClient;

    @Autowired
    private ResourceLoader resourceLoader;

    private String rawSystemPrompt = null;

    /**
     * Loads system-prompt.md without modifying it, and injects runtime today's date & timezone.
     */
    public synchronized String getEnrichedSystemPrompt() {
        if (rawSystemPrompt == null) {
            try {
                Resource resource = resourceLoader.getResource("classpath:chatbot/system-prompt.md");
                try (InputStream is = resource.getInputStream()) {
                    rawSystemPrompt = new String(is.readAllBytes(), StandardCharsets.UTF_8);
                }
            } catch (Exception e) {
                log.error("Failed to load system-prompt.md: {}", e.getMessage());
                rawSystemPrompt = "# ROLE\nYou are ExpenseBot, the personal finance assistant.";
            }
        }

        LocalDate today = LocalDate.now(KOLKATA_ZONE);
        String runtimeContext = "\n\n# RUNTIME CONTEXT\n" +
                "Today's date is: " + today + " (" + today.getDayOfMonth() + " " +
                today.getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH) + " " + today.getYear() + ").\n" +
                "Timezone: Asia/Kolkata.\n";

        return rawSystemPrompt + runtimeContext;
    }

    private String fromRuleEngine(String message, String reply) {
        log.info("[CHATBOT_SOURCE: RULE_ENGINE] message='{}' -> reply='{}'", message, reply);
        return reply;
    }

    private String fromLlm(String message, String reply) {
        log.info("[CHATBOT_SOURCE: LLM] message='{}' -> reply='{}'", message, reply);
        return reply;
    }

    public String processMessage(String message) {
        if (message == null || message.trim().isEmpty()) {
            return fromRuleEngine("", "How can I help you today?");
        }

        String trimmed = message.trim();
        String lower = trimmed.toLowerCase(Locale.ENGLISH);

        // 1. Pending delete confirmation check (Step 2 of two-step delete flow)
        if (chatToolsService.hasPendingDelete()) {
            if (lower.equals("yes") || lower.equals("y") || lower.equals("confirm") || lower.startsWith("yes")) {
                return fromRuleEngine(trimmed, chatToolsService.executePendingDelete());
            } else if (lower.equals("no") || lower.equals("n") || lower.equals("cancel") || lower.startsWith("no")) {
                return fromRuleEngine(trimmed, chatToolsService.cancelPendingDelete());
            }
        }

        // 2. Protect data: Bulk delete refusal (Rule 92)
        if (lower.contains("reset all") || lower.contains("delete everything") || lower.contains("reset data") || lower.contains("delete all")) {
            return fromRuleEngine(trimmed, "I can't delete everything from chat. Please do it from the app, or I can delete individual transactions for you.");
        }

        // 3. Budgets: Explicit refusal & advice (Rule 69, 126)
        if (lower.contains("budget")) {
            BigDecimal amount = extractAmount(lower);
            if (amount != null) {
                return fromRuleEngine(trimmed, "Budgets aren't available in the app yet, so I haven't saved that. If you like, I can tell you how much of ₹" +
                        ChatToolsService.formatCurrency(amount) + " you've used this month.");
            }
            return fromRuleEngine(trimmed, "Budgets aren't available in the app yet, so I haven't saved that. If you like, I can tell you how much of your spending you've used this month.");
        }

        // 4. Custom categories refusal (Rule 83)
        if (lower.contains("create a category") || lower.contains("new category called") || lower.contains("add a category")) {
            return fromRuleEngine(trimmed, "Custom categories aren't supported yet. I can log it under 'Other' with that in the description for you if you'd like.");
        }

        // 5. Currency change refusal (Rule 91)
        if (lower.contains("change my currency") || lower.contains("change currency") || lower.contains("switch currency")) {
            return fromRuleEngine(trimmed, "The app already uses Indian Rupees (₹) INR. Currency switching is not available.");
        }

        // 6. Delete last expense (Step 1 of two-step delete flow)
        if ((lower.contains("delete") || lower.contains("remove")) && (lower.contains("last expense") || lower.contains("last entry") || lower.contains("previous expense"))) {
            return fromRuleEngine(trimmed, chatToolsService.prepareDeleteLast());
        }

        // 7. Edit last entry
        if (lower.contains("edit") && (lower.contains("last entry") || lower.contains("last expense"))) {
            BigDecimal newAmount = extractAmount(lower);
            if (newAmount != null) {
                return fromRuleEngine(trimmed, chatToolsService.updateLastEntry(newAmount, null, null, null));
            }
            return fromRuleEngine(trimmed, "What amount would you like to update your last entry to?");
        }

        // 8. Export report
        if (lower.contains("export") || lower.contains("download report")) {
            if (lower.contains("pdf")) {
                return fromRuleEngine(trimmed, chatToolsService.exportReport("pdf"));
            } else if (lower.contains("excel") || lower.contains("xlsx") || lower.contains("sheet")) {
                return fromRuleEngine(trimmed, chatToolsService.exportReport("excel"));
            }
            return fromRuleEngine(trimmed, chatToolsService.exportReport(null));
        }

        // 9. Show categories
        if (lower.contains("show all my categories") || lower.contains("what categories") || lower.contains("list categories")) {
            return fromRuleEngine(trimmed, "The available categories are: Food, Transport, Shopping, Bills, Healthcare, Entertainment, Education, Rent, Salary, and Other.");
        }

        // 10. Classified Intent
        ChatIntent intent = chatIntentClassifier.classify(trimmed);

        if (intent == ChatIntent.COMMAND) {
            // Check missing amount rule
            BigDecimal amount = extractAmount(trimmed);
            if (amount == null) {
                // Command like "Add lunch" without amount -> "How much was it?"
                if (lower.startsWith("add") || lower.startsWith("log") || lower.startsWith("record") || lower.startsWith("spent") || lower.startsWith("paid")) {
                    return fromRuleEngine(trimmed, "How much was it?");
                }
            } else {
                // Command like "Add 250" without description -> "Got it, ₹250. What was it for?"
                String withoutCommandAndAmount = lower
                        .replaceAll("^(add|log|record|spent|paid|put|save)", "")
                        .replaceAll("(?:₹|rs\\.?|inr)?\\s*" + amount.toString(), "")
                        .trim();
                if (withoutCommandAndAmount.isEmpty()) {
                    return fromRuleEngine(trimmed, "Got it, ₹" + ChatToolsService.formatCurrency(amount) + ". What was it for?");
                }

                // Check for recurring bill command
                if (lower.contains("recurring") || lower.contains("every month") || lower.contains("subscription") || lower.contains("remind me about")) {
                    String billName = "Bill";
                    if (lower.contains("netflix")) billName = "Netflix";
                    else if (lower.contains("rent")) billName = "Rent";
                    else if (lower.contains("wifi") || lower.contains("internet")) billName = "Internet";
                    else if (lower.contains("electricity")) billName = "Electricity";

                    String cat = chatIntentClassifier.resolveCategory(lower);
                    boolean hasExplicitDate = lower.contains("today") || lower.contains("yesterday") || lower.contains("on the ");
                    LocalDate due = hasExplicitDate ? chatIntentClassifier.resolveDate(lower, KOLKATA_ZONE) : LocalDate.now(KOLKATA_ZONE).plusMonths(1);
                    return fromRuleEngine(trimmed, chatToolsService.createBill(billName, amount, cat, due, RecurringFrequency.MONTHLY, 3));
                }

                // Normal expense / income logging
                TransactionType type = (lower.contains("salary") || lower.contains("income") || lower.contains("received"))
                        ? TransactionType.INCOME
                        : TransactionType.EXPENSE;
                String category = chatIntentClassifier.resolveCategory(trimmed);
                LocalDate date = chatIntentClassifier.resolveDate(trimmed, KOLKATA_ZONE);
                String description = extractDescription(trimmed, category, amount);

                return fromRuleEngine(trimmed, chatToolsService.addTransaction(amount, category, date, description, type));
            }
        }

        // 11. Question / Query Handling
        if (lower.contains("balance")) {
            return fromRuleEngine(trimmed, chatToolsService.getCurrentBalance());
        }

        if (lower.contains("overspend") || lower.contains("overspending")) {
            return fromRuleEngine(trimmed, chatToolsService.checkOverspending());
        }

        if (lower.contains("compare") && (lower.contains("last month") || lower.contains("this month"))) {
            return fromRuleEngine(trimmed, chatToolsService.compareWithLastMonth());
        }

        if (lower.contains("upcoming bills") || lower.contains("bills due") || lower.contains("unpaid bills")) {
            return fromRuleEngine(trimmed, chatToolsService.listUpcomingBills());
        }

        if (lower.contains("monthly summary") || lower.contains("summary report")) {
            return fromRuleEngine(trimmed, chatToolsService.getMonthlySummaryReport());
        }

        if (lower.contains("how much did i save") || lower.contains("savings this month")) {
            return fromRuleEngine(trimmed, chatToolsService.getSavingsThisMonth());
        }

        if (lower.contains("biggest expense") || lower.contains("highest expense")) {
            LocalDate today = LocalDate.now(KOLKATA_ZONE);
            YearMonth ym = YearMonth.from(today);
            return fromRuleEngine(trimmed, chatToolsService.getBiggestExpense(ym.atDay(1), ym.atEndOfMonth()));
        }

        if (lower.contains("spend the most") || lower.contains("spend most") || lower.contains("which category") || lower.contains("top category") || lower.contains("highest category")) {
            return fromRuleEngine(trimmed, chatToolsService.getTopCategorySummary());
        }

        if (lower.contains("trend") || lower.contains("last 6 months")) {
            return fromRuleEngine(trimmed, chatToolsService.getSpendingTrend());
        }

        if (lower.contains("last 10") || lower.contains("recent transactions") || lower.contains("show transactions") || lower.contains("show my recent")) {
            return fromRuleEngine(trimmed, chatToolsService.listRecentTransactions(10));
        }

        if (lower.contains("last month")) {
            LocalDate today = LocalDate.now(KOLKATA_ZONE);
            YearMonth prev = YearMonth.from(today).minusMonths(1);
            String cat = null;
            if (lower.contains("food")) cat = "Food";
            else if (lower.contains("transport")) cat = "Transport";
            else if (lower.contains("shopping")) cat = "Shopping";

            String monthName = prev.getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH);
            return fromRuleEngine(trimmed, chatToolsService.getSpendingSummary(prev.atDay(1), prev.atEndOfMonth(), cat, "in " + monthName));
        }

        if (lower.contains("today")) {
            LocalDate today = LocalDate.now(KOLKATA_ZONE);
            return fromRuleEngine(trimmed, chatToolsService.getSpendingSummary(today, today, null, "today"));
        }

        if (lower.contains("this month") || lower.contains("how much did i spend")) {
            LocalDate today = LocalDate.now(KOLKATA_ZONE);
            YearMonth ym = YearMonth.from(today);
            String cat = null;
            if (lower.contains("food")) cat = "Food";
            else if (lower.contains("transport")) cat = "Transport";
            else if (lower.contains("shopping")) cat = "Shopping";

            return fromRuleEngine(trimmed, chatToolsService.getSpendingSummary(ym.atDay(1), ym.atEndOfMonth(), cat, "this month"));
        }

        // 12. If LLM is configured, query Gemini for conversational answers
        if (llmClient.isConfigured()) {
            String enrichedPrompt = getEnrichedSystemPrompt();
            String llmReply = llmClient.chat(enrichedPrompt, trimmed);
            if (llmReply != null && !llmReply.trim().isEmpty()) {
                return fromLlm(trimmed, llmReply.trim());
            }
        }

        // Default polite financial response if nothing matched
        return fromRuleEngine(trimmed, "I can help you add expenses, check spending by category, track bills, or export reports. What would you like to do?");
    }

    private BigDecimal extractAmount(String text) {
        if (text == null) return null;
        Matcher m = AMOUNT_PATTERN.matcher(text);
        BigDecimal found = null;
        while (m.find()) {
            String raw = m.group(1).replace(",", "");
            try {
                BigDecimal val = new BigDecimal(raw);
                if (val.compareTo(BigDecimal.ZERO) > 0) {
                    found = val;
                    // Prefer the first non-zero number
                    break;
                }
            } catch (Exception ignored) {
            }
        }
        return found;
    }

    private String extractDescription(String text, String category, BigDecimal amount) {
        String lower = text.toLowerCase(Locale.ENGLISH);
        // Identify descriptive parts like "for lunch", "on groceries", "auto fare"
        if (lower.contains("lunch")) return "lunch";
        if (lower.contains("dinner")) return "dinner";
        if (lower.contains("groceries") || lower.contains("grocery")) return "groceries";
        if (lower.contains("coffee")) return "coffee";
        if (lower.contains("auto fare") || lower.contains("auto")) return "auto fare";
        if (lower.contains("cab") || lower.contains("uber") || lower.contains("ola")) return "cab";
        if (lower.contains("electricity")) return "electricity bill";
        if (lower.contains("internet") || lower.contains("wifi")) return "internet bill";
        if (lower.contains("movie")) return "movie";
        return category;
    }
}
