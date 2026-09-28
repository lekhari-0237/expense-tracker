package com.example.expensetracker.repository;

import com.example.expensetracker.entity.GroupExpenseSplit;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface GroupExpenseSplitRepository extends MongoRepository<GroupExpenseSplit, String> {
    List<GroupExpenseSplit> findByGroupExpenseId(String groupExpenseId);
}
