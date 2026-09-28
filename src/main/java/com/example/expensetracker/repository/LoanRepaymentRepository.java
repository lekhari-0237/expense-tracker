package com.example.expensetracker.repository;

import com.example.expensetracker.entity.LoanRepayment;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface LoanRepaymentRepository extends MongoRepository<LoanRepayment, String> {
    List<LoanRepayment> findByLoanIdOrderByRepaymentDateDescCreatedAtDesc(String loanId);
}
