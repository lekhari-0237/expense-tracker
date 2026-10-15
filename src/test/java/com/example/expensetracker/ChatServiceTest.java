package com.example.expensetracker;

import com.example.expensetracker.entity.Transaction;
import com.example.expensetracker.entity.TransactionType;
import com.example.expensetracker.entity.User;
import com.example.expensetracker.repository.TransactionRepository;
import com.example.expensetracker.service.AuthService;
import com.example.expensetracker.service.TransactionService;
import com.example.expensetracker.service.chatbot.ChatIntentClassifier;
import com.example.expensetracker.service.chatbot.ChatService;
import com.example.expensetracker.service.chatbot.ChatToolsService;
import com.example.expensetracker.service.chatbot.LlmClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

public class ChatServiceTest {

    @InjectMocks
    private ChatService chatService;

    @Mock
    private ChatToolsService chatToolsService;

    @Mock
    private ChatIntentClassifier chatIntentClassifier;

    @Mock
    private LlmClient llmClient;

    @Mock
    private AuthService authService;

    @Mock
    private TransactionRepository transactionRepository;

    @Mock
    private TransactionService transactionService;

    private User testUser;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        ReflectionTestUtils.setField(chatService, "resourceLoader", new DefaultResourceLoader());

        testUser = new User("testuser", "hashedpass");
        testUser.setId("user_123");
    }

    @Test
    void testRefuseBulkDataReset() {
        String reply = chatService.processMessage("Reset all my data");
        assertTrue(reply.contains("I can't delete everything from chat"));
    }

    @Test
    void testRefuseBudgets() {
        String reply = chatService.processMessage("Set a monthly budget of ₹20,000");
        assertTrue(reply.contains("Budgets aren't available in the app yet"));
        assertTrue(reply.contains("20,000"));
    }

    @Test
    void testRefuseCustomCategories() {
        String reply = chatService.processMessage("Create a category called Pets");
        assertTrue(reply.contains("Custom categories aren't supported yet"));
    }

    @Test
    void testRefuseCurrencySwitch() {
        String reply = chatService.processMessage("Change my currency to USD");
        assertTrue(reply.contains("Currency switching is not available"));
    }

    @Test
    void testExportPdfReportLink() {
        when(chatToolsService.exportReport("pdf")).thenReturn("Here is your PDF report:\n\n[Download PDF Report](/api/export/pdf)");
        String reply = chatService.processMessage("export to pdf");
        assertTrue(reply.contains("[Download PDF Report](/api/export/pdf)"));
    }

    @Test
    void testExportExcelReportLink() {
        when(chatToolsService.exportReport("excel")).thenReturn("Here is your Excel report:\n\n[Download Excel Report](/api/export/excel)");
        String reply = chatService.processMessage("download report in excel");
        assertTrue(reply.contains("[Download Excel Report](/api/export/excel)"));
    }

    @Test
    void testTwoStepDeleteFlow() {
        // Step 1: Request delete
        when(chatToolsService.prepareDeleteLast()).thenReturn("Your last expense is ₹500, Transport, 12 Oct (auto fare). Delete it? (yes/no)");
        String reply1 = chatService.processMessage("Delete my last expense");
        assertEquals("Your last expense is ₹500, Transport, 12 Oct (auto fare). Delete it? (yes/no)", reply1);

        // Step 2: Confirm with yes
        when(chatToolsService.hasPendingDelete()).thenReturn(true);
        when(chatToolsService.executePendingDelete()).thenReturn("Deleted ₹500 Transport (12 Oct).");
        String reply2 = chatService.processMessage("yes");
        assertEquals("Deleted ₹500 Transport (12 Oct).", reply2);

        // Or confirm with no
        when(chatToolsService.hasPendingDelete()).thenReturn(true);
        when(chatToolsService.cancelPendingDelete()).thenReturn("Okay, I've kept it.");
        String reply3 = chatService.processMessage("no");
        assertEquals("Okay, I've kept it.", reply3);
    }
}
