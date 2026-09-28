package com.example.expensetracker.entity;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.DBRef;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Document(collection = "loans")
public class Loan {

    @Id
    private String id;

    @DBRef
    private User user;

    private String personName;

    private LoanType type;

    private BigDecimal amount;

    private BigDecimal remainingAmount;

    private LocalDate dateGivenTaken;

    private LocalDate dueDate;

    private LoanStatus status = LoanStatus.PENDING;

    private Integer reminderDays = 3;

    private String notes;

    @DBRef
    private List<LoanRepayment> repayments = new ArrayList<>();

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    public Loan() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    public Loan(User user, String personName, LoanType type, BigDecimal amount, LocalDate dateGivenTaken, LocalDate dueDate, Integer reminderDays, String notes) {
        this.user = user;
        this.personName = personName;
        this.type = type;
        this.amount = amount;
        this.remainingAmount = amount;
        this.dateGivenTaken = dateGivenTaken;
        this.dueDate = dueDate;
        this.reminderDays = reminderDays != null ? reminderDays : 3;
        this.notes = notes;
        this.status = LoanStatus.PENDING;
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public String getPersonName() {
        return personName;
    }

    public void setPersonName(String personName) {
        this.personName = personName;
    }

    public LoanType getType() {
        return type;
    }

    public void setType(LoanType type) {
        this.type = type;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public BigDecimal getRemainingAmount() {
        return remainingAmount;
    }

    public void setRemainingAmount(BigDecimal remainingAmount) {
        this.remainingAmount = remainingAmount;
    }

    public LocalDate getDateGivenTaken() {
        return dateGivenTaken;
    }

    public void setDateGivenTaken(LocalDate dateGivenTaken) {
        this.dateGivenTaken = dateGivenTaken;
    }

    public LocalDate getDueDate() {
        return dueDate;
    }

    public void setDueDate(LocalDate dueDate) {
        this.dueDate = dueDate;
    }

    public LoanStatus getStatus() {
        return status;
    }

    public void setStatus(LoanStatus status) {
        this.status = status;
    }

    public Integer getReminderDays() {
        return reminderDays;
    }

    public void setReminderDays(Integer reminderDays) {
        this.reminderDays = reminderDays;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public List<LoanRepayment> getRepayments() {
        return repayments;
    }

    public void setRepayments(List<LoanRepayment> repayments) {
        this.repayments = repayments;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
