package com.example.expensetracker.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public class DashboardSummaryDto {
    private BigDecimal totalIncome;
    private BigDecimal totalExpenses;
    private BigDecimal currentBalance;
    private BigDecimal savings;
    private Long transactionCount;
    private Double savingsPercentage;
    private String periodName;
    private Map<String, Object> comparison;
    private Map<String, Object> bankInfo;

    public DashboardSummaryDto() {}

    public DashboardSummaryDto(BigDecimal totalIncome, BigDecimal totalExpenses, BigDecimal currentBalance, BigDecimal savings, Double savingsPercentage, String periodName) {
        this(totalIncome, totalExpenses, currentBalance, savings, savingsPercentage, periodName, 0L);
    }

    public DashboardSummaryDto(BigDecimal totalIncome, BigDecimal totalExpenses, BigDecimal currentBalance, BigDecimal savings, Double savingsPercentage, String periodName, Long transactionCount) {
        this.totalIncome = totalIncome;
        this.totalExpenses = totalExpenses;
        this.currentBalance = currentBalance;
        this.savings = savings;
        this.savingsPercentage = savingsPercentage;
        this.periodName = periodName;
        this.transactionCount = transactionCount != null ? transactionCount : 0L;
    }

    public BigDecimal getTotalIncome() {
        return totalIncome;
    }

    public void setTotalIncome(BigDecimal totalIncome) {
        this.totalIncome = totalIncome;
    }

    public BigDecimal getTotalExpenses() {
        return totalExpenses;
    }

    public void setTotalExpenses(BigDecimal totalExpenses) {
        this.totalExpenses = totalExpenses;
    }

    public BigDecimal getCurrentBalance() {
        return currentBalance;
    }

    public void setCurrentBalance(BigDecimal currentBalance) {
        this.currentBalance = currentBalance;
    }

    public BigDecimal getSavings() {
        return savings;
    }

    public void setSavings(BigDecimal savings) {
        this.savings = savings;
    }

    public Double getSavingsPercentage() {
        return savingsPercentage;
    }

    public void setSavingsPercentage(Double savingsPercentage) {
        this.savingsPercentage = savingsPercentage;
    }

    public BigDecimal getBalance() {
        return currentBalance;
    }

    public Long getTransactionCount() {
        return transactionCount;
    }

    public void setTransactionCount(Long transactionCount) {
        this.transactionCount = transactionCount;
    }

    public String getPeriodName() {
        return periodName;
    }

    public void setPeriodName(String periodName) {
        this.periodName = periodName;
    }

    public Map<String, Object> getComparison() {
        return comparison;
    }

    public void setComparison(Map<String, Object> comparison) {
        this.comparison = comparison;
    }

    public Map<String, Object> getBankInfo() {
        return bankInfo;
    }

    public void setBankInfo(Map<String, Object> bankInfo) {
        this.bankInfo = bankInfo;
    }
}
