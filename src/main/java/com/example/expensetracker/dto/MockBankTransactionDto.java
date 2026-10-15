package com.example.expensetracker.dto;

import java.math.BigDecimal;

public class MockBankTransactionDto {
    private String externalId;
    private String merchant;
    private String description;
    private BigDecimal amount;
    private String type; // "DEBIT" or "CREDIT"
    private String category;
    private String date;
    private String accountNumber;
    private String bankName;

    public MockBankTransactionDto() {}

    public MockBankTransactionDto(String externalId, String merchant, String description, BigDecimal amount, String type, String category, String date, String accountNumber, String bankName) {
        this.externalId = externalId;
        this.merchant = merchant;
        this.description = description;
        this.amount = amount;
        this.type = type;
        this.category = category;
        this.date = date;
        this.accountNumber = accountNumber;
        this.bankName = bankName;
    }

    public String getExternalId() {
        return externalId;
    }

    public void setExternalId(String externalId) {
        this.externalId = externalId;
    }

    public String getMerchant() {
        return merchant;
    }

    public void setMerchant(String merchant) {
        this.merchant = merchant;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getDate() {
        return date;
    }

    public void setDate(String date) {
        this.date = date;
    }

    public String getAccountNumber() {
        return accountNumber;
    }

    public void setAccountNumber(String accountNumber) {
        this.accountNumber = accountNumber;
    }

    public String getBankName() {
        return bankName;
    }

    public void setBankName(String bankName) {
        this.bankName = bankName;
    }
}
