package com.example.expensetracker.controller;

import com.example.expensetracker.dto.ChatRequest;
import com.example.expensetracker.dto.ChatResponse;
import com.example.expensetracker.service.chatbot.ChatService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/chat")
public class ChatController {

    @Autowired
    private ChatService chatService;

    @PostMapping
    public ResponseEntity<ChatResponse> chat(@RequestBody ChatRequest request) {
        String message = request != null ? request.getMessage() : "";
        String reply = chatService.processMessage(message);
        return ResponseEntity.ok(new ChatResponse(reply));
    }
}
