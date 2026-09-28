package com.example.expensetracker.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.DBRef;
import java.math.BigDecimal;

@Document(collection = "group_expense_splits")
public class GroupExpenseSplit {

    @Id
    private String id;

    @JsonIgnore
    @DBRef
    private GroupExpense groupExpense;

    private String memberName;

    private BigDecimal amountOwed;

    private Boolean isSettled = false;

    public GroupExpenseSplit() {}

    public GroupExpenseSplit(GroupExpense groupExpense, String memberName, BigDecimal amountOwed, Boolean isSettled) {
        this.groupExpense = groupExpense;
        this.memberName = memberName;
        this.amountOwed = amountOwed;
        this.isSettled = isSettled != null ? isSettled : false;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public GroupExpense getGroupExpense() {
        return groupExpense;
    }

    public void setGroupExpense(GroupExpense groupExpense) {
        this.groupExpense = groupExpense;
    }

    public String getMemberName() {
        return memberName;
    }

    public void setMemberName(String memberName) {
        this.memberName = memberName;
    }

    public BigDecimal getAmountOwed() {
        return amountOwed;
    }

    public void setAmountOwed(BigDecimal amountOwed) {
        this.amountOwed = amountOwed;
    }

    public Boolean getIsSettled() {
        return isSettled;
    }

    public void setIsSettled(Boolean isSettled) {
        this.isSettled = isSettled;
    }
}
