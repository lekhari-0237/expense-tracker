package com.example.expensetracker.repository;

import com.example.expensetracker.entity.SavingsGoal;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SavingsGoalRepository extends MongoRepository<SavingsGoal, String> {
    List<SavingsGoal> findByUserIdOrderByTargetDateAsc(String userId);
    Optional<SavingsGoal> findByIdAndUserId(String id, String userId);
}
