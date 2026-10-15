package com.example.expensetracker.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDateTime;

@Document(collection = "users")
public class User {

    @Id
    private String id;

    private String username;

    @JsonIgnore
    private String passwordHash;

    private Boolean bankConnected = false;

    private String bankName;

    private String bankAccountMask;

    private LocalDateTime bankLastSynced;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    public User() {}

    public User(String username, String passwordHash) {
        this.username = username;
        this.passwordHash = passwordHash;
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public Boolean getBankConnected() {
        return bankConnected;
    }

    public void setBankConnected(Boolean bankConnected) {
        this.bankConnected = bankConnected;
    }

    public String getBankName() {
        return bankName;
    }

    public void setBankName(String bankName) {
        this.bankName = bankName;
    }

    public String getBankAccountMask() {
        return bankAccountMask;
    }

    public void setBankAccountMask(String bankAccountMask) {
        this.bankAccountMask = bankAccountMask;
    }

    public LocalDateTime getBankLastSynced() {
        return bankLastSynced;
    }

    public void setBankLastSynced(LocalDateTime bankLastSynced) {
        this.bankLastSynced = bankLastSynced;
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
