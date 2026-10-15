package com.example.expensetracker.service;

import com.example.expensetracker.dto.TransactionDto;
import com.example.expensetracker.entity.Transaction;
import com.example.expensetracker.entity.User;
import com.example.expensetracker.exception.ResourceNotFoundException;
import com.example.expensetracker.repository.TransactionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class TransactionService {

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private AuthService authService;

    public List<TransactionDto> getAllTransactions() {
        User currentUser = authService.getCurrentAuthenticatedUser();
        return transactionRepository.findByUserIdOrderByDateDescCreatedAtDesc(currentUser.getId())
                .stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    public List<TransactionDto> getTransactionsForDate(LocalDate date) {
        User currentUser = authService.getCurrentAuthenticatedUser();
        return transactionRepository.findByUserIdAndDate(currentUser.getId(), date)
                .stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    public List<TransactionDto> getTransactionsBetween(LocalDate startDate, LocalDate endDate) {
        User currentUser = authService.getCurrentAuthenticatedUser();
        return transactionRepository.findByUserIdAndDateBetweenOrderByDateDesc(currentUser.getId(), startDate, endDate)
                .stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    public TransactionDto getTransactionById(String id) {
        User currentUser = authService.getCurrentAuthenticatedUser();
        Transaction transaction = transactionRepository.findByIdAndUserId(id, currentUser.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Transaction not found with id: " + id));
        return convertToDto(transaction);
    }

    public List<TransactionDto> getFilteredTransactions(LocalDate startDate, LocalDate endDate, String source, Integer limit) {
        User currentUser = authService.getCurrentAuthenticatedUser();
        List<Transaction> list;
        if (startDate != null && endDate != null) {
            list = transactionRepository.findByUserIdAndDateBetweenOrderByDateDesc(currentUser.getId(), startDate, endDate);
        } else if (source != null && !source.trim().isEmpty()) {
            list = transactionRepository.findByUserIdAndSourceOrderByDateDescCreatedAtDesc(currentUser.getId(), source);
        } else {
            list = transactionRepository.findByUserIdOrderByDateDescCreatedAtDesc(currentUser.getId());
        }

        if (source != null && !source.trim().isEmpty() && startDate != null && endDate != null) {
            list = list.stream().filter(t -> source.equalsIgnoreCase(t.getSource())).collect(Collectors.toList());
        }

        if (limit != null && limit > 0) {
            list = list.stream().limit(limit).collect(Collectors.toList());
        }

        return list.stream().map(this::convertToDto).collect(Collectors.toList());
    }

    @Transactional
    public TransactionDto createTransaction(TransactionDto dto) {
        User currentUser = authService.getCurrentAuthenticatedUser();
        Transaction transaction = new Transaction(
                currentUser,
                dto.getAmount(),
                dto.getCategory(),
                dto.getDate(),
                dto.getDescription(),
                dto.getType()
        );
        transaction.setExternalId(dto.getExternalId());
        transaction.setSource(dto.getSource());
        transaction.setMerchant(dto.getMerchant());
        Transaction saved = transactionRepository.save(transaction);
        return convertToDto(saved);
    }

    @Transactional
    public TransactionDto updateTransaction(String id, TransactionDto dto) {
        User currentUser = authService.getCurrentAuthenticatedUser();
        Transaction transaction = transactionRepository.findByIdAndUserId(id, currentUser.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Transaction not found with id: " + id));

        transaction.setAmount(dto.getAmount());
        transaction.setCategory(dto.getCategory());
        transaction.setDate(dto.getDate());
        transaction.setDescription(dto.getDescription());
        transaction.setType(dto.getType());
        if (dto.getExternalId() != null) transaction.setExternalId(dto.getExternalId());
        if (dto.getSource() != null) transaction.setSource(dto.getSource());
        if (dto.getMerchant() != null) transaction.setMerchant(dto.getMerchant());

        Transaction updated = transactionRepository.save(transaction);
        return convertToDto(updated);
    }

    @Transactional
    public void deleteTransaction(String id) {
        User currentUser = authService.getCurrentAuthenticatedUser();
        Transaction transaction = transactionRepository.findByIdAndUserId(id, currentUser.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Transaction not found with id: " + id));
        transactionRepository.delete(transaction);
    }

    public TransactionDto convertToDto(Transaction t) {
        TransactionDto dto = new TransactionDto(
                t.getId(),
                t.getAmount(),
                t.getCategory(),
                t.getDate(),
                t.getDescription(),
                t.getType()
        );
        dto.setExternalId(t.getExternalId());
        dto.setSource(t.getSource());
        dto.setMerchant(t.getMerchant());
        return dto;
    }
}
