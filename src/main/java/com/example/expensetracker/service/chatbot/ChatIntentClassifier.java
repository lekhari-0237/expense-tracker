package com.example.expensetracker.service.chatbot;

import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class ChatIntentClassifier {

    private static final Pattern COMMAND_PATTERN = Pattern.compile(
            "\\b(add|log|record|spent|paid|delete|remove|edit|change|set|create|export|remind|save|put|enter)\\b",
            Pattern.CASE_INSENSITIVE
    );

    private static final Pattern QUESTION_PATTERN = Pattern.compile(
            "\\b(how much|how many|what|which|show|list|compare|am i|can i|trend|breakdown|summary|status|report)\\b|\\?",
            Pattern.CASE_INSENSITIVE
    );

    private static final Pattern ON_THE_DAY_PATTERN = Pattern.compile(
            "\\bon the (\\d{1,2})(?:st|nd|rd|th)?\\b",
            Pattern.CASE_INSENSITIVE
    );

    public ChatIntent classify(String message) {
        if (message == null || message.trim().isEmpty()) {
            return ChatIntent.QUESTION;
        }

        String trimmed = message.trim().toLowerCase(Locale.ENGLISH);

        // Confirmation words for pending actions act as command responses
        if (trimmed.equals("yes") || trimmed.equals("y") || trimmed.equals("confirm")
                || trimmed.equals("no") || trimmed.equals("n") || trimmed.equals("cancel")) {
            return ChatIntent.COMMAND;
        }

        boolean hasCommand = COMMAND_PATTERN.matcher(trimmed).find();
        boolean hasQuestion = QUESTION_PATTERN.matcher(trimmed).find();

        // If it starts with an imperative command word, prioritize COMMAND
        if (hasCommand && (!hasQuestion || startsWithCommand(trimmed))) {
            return ChatIntent.COMMAND;
        }

        if (hasCommand) {
            return ChatIntent.COMMAND;
        }

        return ChatIntent.QUESTION;
    }

    private boolean startsWithCommand(String text) {
        String[] words = text.split("\\s+");
        if (words.length > 0) {
            String first = words[0];
            return first.matches("^(add|log|record|delete|remove|edit|change|set|create|export|remind)$");
        }
        return false;
    }

    /**
     * Resolves date expressions: "today", "yesterday", "on the 5th", or default today
     */
    public LocalDate resolveDate(String text, ZoneId zoneId) {
        if (zoneId == null) {
            zoneId = ZoneId.of("Asia/Kolkata");
        }
        LocalDate today = LocalDate.now(zoneId);
        if (text == null || text.trim().isEmpty()) {
            return today;
        }

        String lower = text.toLowerCase(Locale.ENGLISH);
        if (lower.contains("yesterday")) {
            return today.minusDays(1);
        }
        if (lower.contains("today")) {
            return today;
        }

        Matcher matcher = ON_THE_DAY_PATTERN.matcher(lower);
        if (matcher.find()) {
            try {
                int day = Integer.parseInt(matcher.group(1));
                if (day >= 1 && day <= 31) {
                    // Start with current month
                    LocalDate candidate = today.withDayOfMonth(Math.min(day, today.lengthOfMonth()));
                    // "on the 5th of current month, or the most recent past 5th if that date is in the future"
                    if (candidate.isAfter(today)) {
                        LocalDate prevMonth = today.minusMonths(1);
                        candidate = prevMonth.withDayOfMonth(Math.min(day, prevMonth.lengthOfMonth()));
                    }
                    return candidate;
                }
            } catch (Exception ignored) {
            }
        }

        return today;
    }

    /**
     * Resolves category from text using prompt category mapping rules
     */
    public String resolveCategory(String text) {
        if (text == null) return "Other";
        String lower = text.toLowerCase(Locale.ENGLISH);

        if (lower.contains("lunch") || lower.contains("dinner") || lower.contains("groceries")
                || lower.contains("grocery") || lower.contains("snacks") || lower.contains("coffee")
                || lower.contains("tea") || lower.contains("food") || lower.contains("breakfast")
                || lower.contains("swiggy") || lower.contains("zomato")) {
            return "Food";
        }
        if (lower.contains("auto") || lower.contains("cab") || lower.contains("bus")
                || lower.contains("fuel") || lower.contains("petrol") || lower.contains("diesel")
                || lower.contains("metro") || lower.contains("uber") || lower.contains("ola")
                || lower.contains("transport") || lower.contains("fare") || lower.contains("travel")) {
            return "Transport";
        }
        if (lower.contains("electricity") || lower.contains("water") || lower.contains("phone")
                || lower.contains("internet") || lower.contains("wifi") || lower.contains("emi")
                || lower.contains("bill") || lower.contains("bills") || lower.contains("recharge")) {
            return "Bills";
        }
        if (lower.contains("rent")) {
            return "Rent";
        }
        if (lower.contains("movie") || lower.contains("netflix") || lower.contains("games")
                || lower.contains("entertainment") || lower.contains("spotify") || lower.contains("cinema")) {
            return "Entertainment";
        }
        if (lower.contains("medicine") || lower.contains("doctor") || lower.contains("pharmacy")
                || lower.contains("hospital") || lower.contains("healthcare") || lower.contains("medical")) {
            return "Healthcare";
        }
        if (lower.contains("fees") || lower.contains("books") || lower.contains("school")
                || lower.contains("college") || lower.contains("tuition") || lower.contains("education")
                || lower.contains("course")) {
            return "Education";
        }
        if (lower.contains("clothes") || lower.contains("clothing") || lower.contains("online order")
                || lower.contains("shopping") || lower.contains("amazon") || lower.contains("flipkart")
                || lower.contains("myntra")) {
            return "Shopping";
        }
        if (lower.contains("salary") || lower.contains("income")) {
            return "Salary";
        }

        return "Other";
    }
}
