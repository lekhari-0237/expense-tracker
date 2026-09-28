package com.example.expensetracker.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.DBRef;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Document(collection = "loan_repayments")
public class LoanRepayment {

    @Id
    private String id;

    @JsonIgnore
    @DBRef
    private Loan loan;

    private BigDecimal amount;

    private LocalDate repaymentDate;

    private String notes;

    private LocalDateTime createdAt;

    public LoanRepayment() {
        this.createdAt = LocalDateTime.now();
    }

    public LoanRepayment(Loan loan, BigDecimal amount, LocalDate repaymentDate, String notes) {
        this.loan = loan;
        this.amount = amount;
        this.repaymentDate = repaymentDate;
        this.notes = notes;
        this.createdAt = LocalDateTime.now();
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public Loan getLoan() {
        return loan;
    }

    public void setLoan(Loan loan) {
        this.loan = loan;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public LocalDate getRepaymentDate() {
        return repaymentDate;
    }

    public void setRepaymentDate(LocalDate repaymentDate) {
        this.repaymentDate = repaymentDate;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
