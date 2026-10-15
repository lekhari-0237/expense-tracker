package com.example.expensetracker.service.chatbot;

import java.math.BigDecimal;
import java.time.LocalDate;

public class PendingDelete {
    private final String transactionId;
    private final BigDecimal amount;
    private final String category;
    private final LocalDate date;
    private final String description;
    private final long createdAtMillis;

    public PendingDelete(String transactionId, BigDecimal amount, String category, LocalDate date, String description) {
        this.transactionId = transactionId;
        this.amount = amount;
        this.category = category;
        this.date = date;
        this.description = description;
        this.createdAtMillis = System.currentTimeMillis();
    }

    public boolean isExpired(long timeoutMillis) {
        return (System.currentTimeMillis() - createdAtMillis) > timeoutMillis;
    }

    public String getTransactionId() {
        return transactionId;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public String getCategory() {
        return category;
    }

    public LocalDate getDate() {
        return date;
    }

    public String getDescription() {
        return description;
    }

    public long getCreatedAtMillis() {
        return createdAtMillis;
    }
}
