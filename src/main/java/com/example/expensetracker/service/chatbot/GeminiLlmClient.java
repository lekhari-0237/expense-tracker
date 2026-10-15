package com.example.expensetracker.service.chatbot;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.*;

@Component
public class GeminiLlmClient implements LlmClient {

    private static final Logger log = LoggerFactory.getLogger(GeminiLlmClient.class);
    private static final String GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s";

    @Value("${app.chatbot.api-key:}")
    private String apiKey;

    @Value("${app.chatbot.model:gemini-3.8-flash}")
    private String model;

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public boolean isConfigured() {
        return apiKey != null && !apiKey.trim().isEmpty() && !apiKey.contains("your_") && !apiKey.equals("helloworld");
    }

    @Override
    public String chat(String systemPrompt, String userMessage) {
        if (!isConfigured()) {
            return null;
        }

        try {
            String targetModel = (model != null && !model.trim().isEmpty()) ? model.trim() : "gemini-3.8-flash";
            String url = String.format(GEMINI_API_URL, targetModel, apiKey.trim());

            Map<String, Object> requestBody = new LinkedHashMap<>();

            // System instruction
            if (systemPrompt != null && !systemPrompt.trim().isEmpty()) {
                Map<String, Object> systemPart = Collections.singletonMap("text", systemPrompt);
                Map<String, Object> systemInstruction = Collections.singletonMap("parts", Collections.singletonList(systemPart));
                requestBody.put("system_instruction", systemInstruction);
            }

            // User message
            Map<String, Object> userPart = Collections.singletonMap("text", userMessage);
            Map<String, Object> userContent = new LinkedHashMap<>();
            userContent.put("role", "user");
            userContent.put("parts", Collections.singletonList(userPart));
            requestBody.put("contents", Collections.singletonList(userContent));

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(url, entity, String.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                JsonNode root = objectMapper.readTree(response.getBody());
                JsonNode candidates = root.path("candidates");
                if (candidates.isArray() && !candidates.isEmpty()) {
                    JsonNode parts = candidates.get(0).path("content").path("parts");
                    if (parts.isArray() && !parts.isEmpty()) {
                        String text = parts.get(0).path("text").asText();
                        if (text != null && !text.trim().isEmpty()) {
                            return text.trim();
                        }
                    }
                }
            }
        } catch (Exception ex) {
            log.warn("Gemini API call failed: {}", ex.getMessage());
        }

        return null;
    }
}
