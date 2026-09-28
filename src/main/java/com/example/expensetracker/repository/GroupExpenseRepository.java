package com.example.expensetracker.repository;

import com.example.expensetracker.entity.GroupExpense;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface GroupExpenseRepository extends MongoRepository<GroupExpense, String> {
    List<GroupExpense> findByGroupIdOrderByDateDesc(String groupId);
}
