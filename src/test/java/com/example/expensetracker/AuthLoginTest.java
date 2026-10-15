package com.example.expensetracker;

import com.example.expensetracker.dto.AuthRequest;
import com.example.expensetracker.dto.AuthResponse;
import com.example.expensetracker.dto.RegisterRequest;
import com.example.expensetracker.entity.User;
import com.example.expensetracker.repository.UserRepository;
import com.example.expensetracker.service.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
public class AuthLoginTest {

    @Autowired
    private AuthService authService;

    @Autowired
    private UserRepository userRepository;

    @Test
    public void testRegisterAndLogin() {
        String username = "authtest_" + System.currentTimeMillis() + "@gmail.com";
        String password = "password123";

        System.out.println("--- Registering test user: " + username);
        RegisterRequest registerRequest = new RegisterRequest(username, password, password);
        User registeredUser = authService.registerUser(registerRequest);
        assertNotNull(registeredUser);
        assertNotNull(registeredUser.getId());
        System.out.println("Registered user ID: " + registeredUser.getId());

        System.out.println("--- Attempting login for: " + username);
        AuthRequest authRequest = new AuthRequest(username, password);
        AuthResponse authResponse = authService.loginUser(authRequest);

        assertNotNull(authResponse);
        assertNotNull(authResponse.getToken());
        assertEquals(username, authResponse.getUsername());
        System.out.println("Login SUCCESS! Token: " + authResponse.getToken().substring(0, 20) + "...");

        // Clean up
        userRepository.deleteById(registeredUser.getId());
        System.out.println("Cleaned up test user: " + registeredUser.getId());
    }
}
