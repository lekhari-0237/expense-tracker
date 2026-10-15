package com.example.expensetracker.dto;

import java.time.LocalDateTime;

public class BankSyncResultDto {
    private int totalFetched;
    private int newImported;
    private int duplicatesSkipped;
    private int expensesCreated;
    private int incomeCreated;
    private LocalDateTime lastSynced;

    public BankSyncResultDto() {}

    public BankSyncResultDto(int totalFetched, int newImported, int duplicatesSkipped, int expensesCreated, int incomeCreated, LocalDateTime lastSynced) {
        this.totalFetched = totalFetched;
        this.newImported = newImported;
        this.duplicatesSkipped = duplicatesSkipped;
        this.expensesCreated = expensesCreated;
        this.incomeCreated = incomeCreated;
        this.lastSynced = lastSynced;
    }

    public int getTotalFetched() {
        return totalFetched;
    }

    public void setTotalFetched(int totalFetched) {
        this.totalFetched = totalFetched;
    }

    public int getNewImported() {
        return newImported;
    }

    public void setNewImported(int newImported) {
        this.newImported = newImported;
    }

    public int getDuplicatesSkipped() {
        return duplicatesSkipped;
    }

    public void setDuplicatesSkipped(int duplicatesSkipped) {
        this.duplicatesSkipped = duplicatesSkipped;
    }

    public int getExpensesCreated() {
        return expensesCreated;
    }

    public void setExpensesCreated(int expensesCreated) {
        this.expensesCreated = expensesCreated;
    }

    public int getIncomeCreated() {
        return incomeCreated;
    }

    public void setIncomeCreated(int incomeCreated) {
        this.incomeCreated = incomeCreated;
    }

    public LocalDateTime getLastSynced() {
        return lastSynced;
    }

    public void setLastSynced(LocalDateTime lastSynced) {
        this.lastSynced = lastSynced;
    }
}
