package com.example.expensetracker.service;

import com.example.expensetracker.dto.BankStatusDto;
import com.example.expensetracker.dto.BankSyncResultDto;
import com.example.expensetracker.dto.MockBankTransactionDto;
import com.example.expensetracker.entity.Transaction;
import com.example.expensetracker.entity.TransactionType;
import com.example.expensetracker.entity.User;
import com.example.expensetracker.repository.TransactionRepository;
import com.example.expensetracker.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class BankService {

    @Autowired
    private AuthService authService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TransactionRepository transactionRepository;

    public BankStatusDto getStatus() {
        User user = authService.getCurrentAuthenticatedUser();
        boolean connected = user.getBankConnected() != null && user.getBankConnected();
        long count = transactionRepository.countByUserIdAndSource(user.getId(), "mock_bank");
        String bankName = user.getBankName() != null ? user.getBankName() : "Apex Demo Bank (Fictional)";
        String mask = user.getBankAccountMask() != null ? user.getBankAccountMask() : "**** 4582";
        return new BankStatusDto(connected, bankName, mask, user.getBankLastSynced(), count);
    }

    @Transactional
    public BankStatusDto connect() {
        User user = authService.getCurrentAuthenticatedUser();
        user.setBankConnected(true);
        user.setBankName("Apex Demo Bank (Fictional)");
        user.setBankAccountMask("**** 4582");
        userRepository.save(user);

        long count = transactionRepository.countByUserIdAndSource(user.getId(), "mock_bank");
        return new BankStatusDto(true, user.getBankName(), user.getBankAccountMask(), user.getBankLastSynced(), count);
    }

    @Transactional
    public BankStatusDto disconnect() {
        User user = authService.getCurrentAuthenticatedUser();
        user.setBankConnected(false);
        userRepository.save(user);

        long count = transactionRepository.countByUserIdAndSource(user.getId(), "mock_bank");
        return new BankStatusDto(false, user.getBankName(), user.getBankAccountMask(), user.getBankLastSynced(), count);
    }

    public List<MockBankTransactionDto> getMockTransactions() {
        LocalDate today = LocalDate.now();
        DateTimeFormatter fmt = DateTimeFormatter.ISO_LOCAL_DATE;

        List<MockBankTransactionDto> feed = new ArrayList<>();
        feed.add(new MockBankTransactionDto("TXN_MB_1001", "Swiggy", "Swiggy Gourmet Order #9842", new BigDecimal("450.00"), "DEBIT", "Food", today.minusDays(0).format(fmt), "**** 4582", "Apex Demo Bank"));
        feed.add(new MockBankTransactionDto("TXN_MB_1002", "Uber", "Uber Ride - Office Commute", new BigDecimal("220.00"), "DEBIT", "Transport", today.minusDays(0).format(fmt), "**** 4582", "Apex Demo Bank"));
        feed.add(new MockBankTransactionDto("TXN_MB_1003", "Amazon", "Amazon Retail Order #AZ-8921", new BigDecimal("1499.00"), "DEBIT", "Shopping", today.minusDays(1).format(fmt), "**** 4582", "Apex Demo Bank"));
        feed.add(new MockBankTransactionDto("TXN_MB_1004", "DMart", "DMart Supermarket Monthly Groceries", new BigDecimal("3250.00"), "DEBIT", "Food", today.minusDays(2).format(fmt), "**** 4582", "Apex Demo Bank"));
        feed.add(new MockBankTransactionDto("TXN_MB_1005", "Netflix", "Netflix Monthly Premium Subscription", new BigDecimal("649.00"), "DEBIT", "Entertainment", today.minusDays(2).format(fmt), "**** 4582", "Apex Demo Bank"));
        feed.add(new MockBankTransactionDto("TXN_MB_1006", "Airtel Broadband", "Airtel Fiber 200Mbps Monthly Bill", new BigDecimal("1179.00"), "DEBIT", "Bills", today.minusDays(3).format(fmt), "**** 4582", "Apex Demo Bank"));
        feed.add(new MockBankTransactionDto("TXN_MB_1007", "Apollo Pharmacy", "Apollo Pharmacy Medicines & Health Check", new BigDecimal("850.00"), "DEBIT", "Healthcare", today.minusDays(4).format(fmt), "**** 4582", "Apex Demo Bank"));
        feed.add(new MockBankTransactionDto("TXN_MB_1008", "Shell Petrol", "Shell Auto Fuel Refill", new BigDecimal("1200.00"), "DEBIT", "Transport", today.minusDays(5).format(fmt), "**** 4582", "Apex Demo Bank"));
        feed.add(new MockBankTransactionDto("TXN_MB_1009", "Zomato", "Zomato Dining Dinner Payment", new BigDecimal("1120.00"), "DEBIT", "Food", today.minusDays(6).format(fmt), "**** 4582", "Apex Demo Bank"));
        feed.add(new MockBankTransactionDto("TXN_MB_1010", "Bescom Electricity", "Bescom Power Utility Monthly Bill", new BigDecimal("1840.00"), "DEBIT", "Bills", today.minusDays(7).format(fmt), "**** 4582", "Apex Demo Bank"));
        feed.add(new MockBankTransactionDto("TXN_MB_1011", "Jio Prepaid", "Jio 5G Unlimited Recharge Plan", new BigDecimal("749.00"), "DEBIT", "Bills", today.minusDays(7).format(fmt), "**** 4582", "Apex Demo Bank"));
        feed.add(new MockBankTransactionDto("TXN_MB_1012", "Salary Deposit", "Tech Corp Monthly Payroll Direct Deposit", new BigDecimal("65000.00"), "CREDIT", "Salary", today.minusDays(8).format(fmt), "**** 4582", "Apex Demo Bank"));
        feed.add(new MockBankTransactionDto("TXN_MB_1013", "Freelance Client Payout", "Design Project Milestone Payout via Wire", new BigDecimal("15000.00"), "CREDIT", "Other", today.minusDays(9).format(fmt), "**** 4582", "Apex Demo Bank"));
        feed.add(new MockBankTransactionDto("TXN_MB_1014", "Starbucks Coffee", "Starbucks Coffee & Snacks", new BigDecimal("580.00"), "DEBIT", "Food", today.minusDays(10).format(fmt), "**** 4582", "Apex Demo Bank"));
        feed.add(new MockBankTransactionDto("TXN_MB_1015", "PVR Cinemas", "PVR Cinemas 2x Movie Tickets & Popcorn", new BigDecimal("920.00"), "DEBIT", "Entertainment", today.minusDays(11).format(fmt), "**** 4582", "Apex Demo Bank"));

        return feed;
    }

    @Transactional
    public BankSyncResultDto sync() {
        User user = authService.getCurrentAuthenticatedUser();
        if (user.getBankConnected() == null || !user.getBankConnected()) {
            user.setBankConnected(true);
            user.setBankName("Apex Demo Bank (Fictional)");
            user.setBankAccountMask("**** 4582");
        }

        List<MockBankTransactionDto> feed = getMockTransactions();
        List<String> externalIds = feed.stream().map(MockBankTransactionDto::getExternalId).collect(Collectors.toList());

        List<Transaction> existingTxns = transactionRepository.findByUserIdAndExternalIdIn(user.getId(), externalIds);
        Set<String> existingIds = existingTxns.stream()
                .map(Transaction::getExternalId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        int newImported = 0;
        int duplicatesSkipped = 0;
        int expensesCreated = 0;
        int incomeCreated = 0;

        List<Transaction> toSave = new ArrayList<>();
        for (MockBankTransactionDto item : feed) {
            if (existingIds.contains(item.getExternalId())) {
                duplicatesSkipped++;
                continue;
            }

            boolean isCredit = "CREDIT".equalsIgnoreCase(item.getType());
            TransactionType type = isCredit ? TransactionType.INCOME : TransactionType.EXPENSE;
            LocalDate date = LocalDate.parse(item.getDate());

            Transaction txn = new Transaction(
                    user,
                    item.getAmount(),
                    item.getCategory(),
                    date,
                    item.getDescription(),
                    type
            );
            txn.setExternalId(item.getExternalId());
            txn.setSource("mock_bank");
            txn.setMerchant(item.getMerchant());
            toSave.add(txn);

            if (isCredit) {
                incomeCreated++;
            } else {
                expensesCreated++;
            }
            newImported++;
        }

        if (!toSave.isEmpty()) {
            transactionRepository.saveAll(toSave);
        }

        LocalDateTime now = LocalDateTime.now();
        user.setBankLastSynced(now);
        userRepository.save(user);

        return new BankSyncResultDto(feed.size(), newImported, duplicatesSkipped, expensesCreated, incomeCreated, now);
    }
}
