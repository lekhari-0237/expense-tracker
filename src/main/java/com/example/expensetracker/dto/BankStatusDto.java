package com.example.expensetracker.dto;

import java.time.LocalDateTime;

public class BankStatusDto {
    private boolean connected;
    private String bankName;
    private String accountMask;
    private LocalDateTime lastSynced;
    private long syncedTransactionsCount;

    public BankStatusDto() {}

    public BankStatusDto(boolean connected, String bankName, String accountMask, LocalDateTime lastSynced, long syncedTransactionsCount) {
        this.connected = connected;
        this.bankName = bankName;
        this.accountMask = accountMask;
        this.lastSynced = lastSynced;
        this.syncedTransactionsCount = syncedTransactionsCount;
    }

    public boolean isConnected() {
        return connected;
    }

    public void setConnected(boolean connected) {
        this.connected = connected;
    }

    public String getBankName() {
        return bankName;
    }

    public void setBankName(String bankName) {
        this.bankName = bankName;
    }

    public String getAccountMask() {
        return accountMask;
    }

    public void setAccountMask(String accountMask) {
        this.accountMask = accountMask;
    }

    public LocalDateTime getLastSynced() {
        return lastSynced;
    }

    public void setLastSynced(LocalDateTime lastSynced) {
        this.lastSynced = lastSynced;
    }

    public long getSyncedTransactionsCount() {
        return syncedTransactionsCount;
    }

    public void setSyncedTransactionsCount(long syncedTransactionsCount) {
        this.syncedTransactionsCount = syncedTransactionsCount;
    }
}
