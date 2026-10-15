package com.example.expensetracker.repository;

import com.example.expensetracker.entity.Transaction;
import com.example.expensetracker.entity.TransactionType;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

@Repository
public interface TransactionRepository extends MongoRepository<Transaction, String> {
    List<Transaction> findByUserIdOrderByDateDescCreatedAtDesc(String userId);
    Optional<Transaction> findByIdAndUserId(String id, String userId);
    List<Transaction> findByUserIdAndDateBetweenOrderByDateDesc(String userId, LocalDate startDate, LocalDate endDate);
    List<Transaction> findByUserIdAndDate(String userId, LocalDate date);
    List<Transaction> findByUserIdAndType(String userId, TransactionType type);
    List<Transaction> findByUserIdAndTypeAndDateBetween(String userId, TransactionType type, LocalDate startDate, LocalDate endDate);
    List<Transaction> findByUserIdOrderByDateDesc(String userId);
    Optional<Transaction> findFirstByUserIdOrderByIdDesc(String userId);
    Optional<Transaction> findFirstByUserIdOrderByCreatedAtDesc(String userId);
    List<Transaction> findByUserIdAndExternalIdIn(String userId, List<String> externalIds);
    Optional<Transaction> findByUserIdAndExternalId(String userId, String externalId);
    long countByUserIdAndSource(String userId, String source);
    List<Transaction> findByUserIdAndSourceOrderByDateDescCreatedAtDesc(String userId, String source);
    long countByUserIdAndDateBetween(String userId, LocalDate startDate, LocalDate endDate);

    default BigDecimal sumAmountByUserIdAndTypeAndDateBetween(String userId, TransactionType type, LocalDate startDate, LocalDate endDate) {
        List<Transaction> list = findByUserIdAndTypeAndDateBetween(userId, type, startDate, endDate);
        return list.stream()
                .map(Transaction::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    default BigDecimal sumAmountByUserIdAndType(String userId, TransactionType type) {
        List<Transaction> list = findByUserIdAndType(userId, type);
        return list.stream()
                .map(Transaction::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    default List<Object[]> sumExpensesByCategoryAndDateBetween(String userId, LocalDate startDate, LocalDate endDate) {
        List<Transaction> list = findByUserIdAndTypeAndDateBetween(userId, TransactionType.EXPENSE, startDate, endDate);
        Map<String, BigDecimal> sumByCategory = list.stream()
                .filter(t -> t.getCategory() != null && t.getAmount() != null)
                .collect(Collectors.groupingBy(
                        Transaction::getCategory,
                        Collectors.reducing(BigDecimal.ZERO, Transaction::getAmount, BigDecimal::add)
                ));
        return sumByCategory.entrySet().stream()
                .map(e -> new Object[]{e.getKey(), e.getValue()})
                .collect(Collectors.toList());
    }
}
