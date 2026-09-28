package com.example.expensetracker.repository;

import com.example.expensetracker.entity.Group;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface GroupRepository extends MongoRepository<Group, String> {
    List<Group> findByCreatorIdOrderByIdDesc(String creatorId);
    
    @Query("SELECT g FROM Group g JOIN g.members m WHERE g.creator.id = :userId OR m.user.id = :userId")
    List<Group> findAllUserGroups(@Param("userId") String userId);

    Optional<Group> findByIdAndCreatorId(String id, String creatorId);
}
