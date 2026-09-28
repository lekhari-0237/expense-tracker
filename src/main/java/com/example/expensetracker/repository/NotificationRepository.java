package com.example.expensetracker.repository;

import com.example.expensetracker.entity.Notification;
import com.example.expensetracker.entity.NotificationType;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface NotificationRepository extends MongoRepository<Notification, String> {
    List<Notification> findByUserIdOrderByCreatedAtDesc(String userId);
    List<Notification> findByUserIdAndIsReadFalseOrderByCreatedAtDesc(String userId);
    Optional<Notification> findByIdAndUserId(String id, String userId);
    Boolean existsByUserIdAndTypeAndReferenceIdAndTitle(String userId, NotificationType type, String referenceId, String title);
}
