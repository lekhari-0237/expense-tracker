package com.example.expensetracker.repository;

import com.example.expensetracker.entity.Loan;
import com.example.expensetracker.entity.LoanStatus;
import com.example.expensetracker.entity.LoanType;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface LoanRepository extends MongoRepository<Loan, String> {
    List<Loan> findByUserIdOrderByDueDateAsc(String userId);
    List<Loan> findByUserIdAndTypeOrderByDueDateAsc(String userId, LoanType type);
    Optional<Loan> findByIdAndUserId(String id, String userId);
    List<Loan> findByStatusNot(LoanStatus status);
}
