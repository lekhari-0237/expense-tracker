package com.example.expensetracker.service.chatbot;

public interface LlmClient {
    boolean isConfigured();
    String chat(String systemPrompt, String userMessage);
}
