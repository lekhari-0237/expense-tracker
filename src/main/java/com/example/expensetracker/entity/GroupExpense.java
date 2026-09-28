package com.example.expensetracker.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.DBRef;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Document(collection = "group_expenses")
public class GroupExpense {

    @Id
    private String id;

    @JsonIgnore
    @DBRef
    private Group group;

    private String description;

    private BigDecimal totalAmount;

    private String paidByName;

    private LocalDate date;

    @DBRef
    private List<GroupExpenseSplit> splits = new ArrayList<>();

    public GroupExpense() {}

    public GroupExpense(Group group, String description, BigDecimal totalAmount, String paidByName, LocalDate date) {
        this.group = group;
        this.description = description;
        this.totalAmount = totalAmount;
        this.paidByName = paidByName;
        this.date = date;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public Group getGroup() {
        return group;
    }

    public void setGroup(Group group) {
        this.group = group;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public BigDecimal getTotalAmount() {
        return totalAmount;
    }

    public void setTotalAmount(BigDecimal totalAmount) {
        this.totalAmount = totalAmount;
    }

    public String getPaidByName() {
        return paidByName;
    }

    public void setPaidByName(String paidByName) {
        this.paidByName = paidByName;
    }

    public LocalDate getDate() {
        return date;
    }

    public void setDate(LocalDate date) {
        this.date = date;
    }

    public List<GroupExpenseSplit> getSplits() {
        return splits;
    }

    public void setSplits(List<GroupExpenseSplit> splits) {
        this.splits = splits;
    }
}
