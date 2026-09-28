package com.example.expensetracker.repository;

import com.example.expensetracker.entity.Bill;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface BillRepository extends MongoRepository<Bill, String> {
    List<Bill> findByUserIdOrderByDueDateAsc(String userId);
    Optional<Bill> findByIdAndUserId(String id, String userId);
    List<Bill> findByUserIdAndIsPaidFalse(String userId);
    List<Bill> findByIsPaidFalse();
}
