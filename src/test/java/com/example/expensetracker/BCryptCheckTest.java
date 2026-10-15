package com.example.expensetracker;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

public class BCryptCheckTest {
    @Test
    public void testBCrypt() {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        String hash = "$2a$10$6ulE0yGAHBosghJpOr8QWOj7fnBmeaT2sWbHm/jgUxJYaeRO5YZAq";
        System.out.println("Java BCrypt match 'Password123!': " + encoder.matches("Password123!", hash));
        
        String sri7Hash = "$2a$10$YOijHThMJnrNs3rHUt.yOOcOYpi30b6zhjGlmbbJhxrLIQnbVJ7Um";
        System.out.println("Java BCrypt match sri7 'Password123!': " + encoder.matches("Password123!", sri7Hash));
        System.out.println("Java BCrypt match sri7 'password123': " + encoder.matches("password123", sri7Hash));
    }
}
