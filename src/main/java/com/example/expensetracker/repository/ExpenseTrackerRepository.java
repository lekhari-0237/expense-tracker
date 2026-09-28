package com.example.expensetracker.repository;

import com.example.expensetracker.model.ExpenseTracker;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ExpenseTrackerRepository extends MongoRepository<ExpenseTracker, String> {
}
