package com.example.expensetracker.repository;

import com.example.expensetracker.entity.MonthlyIncome;
import com.example.expensetracker.entity.User;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MonthlyIncomeRepository extends MongoRepository<MonthlyIncome, String> {
    Optional<MonthlyIncome> findByUserAndMonthAndYear(User user, Integer month, Integer year);
    List<MonthlyIncome> findByUserIdAndYear(String userId, Integer year);
    List<MonthlyIncome> findByUserId(String userId);
}
