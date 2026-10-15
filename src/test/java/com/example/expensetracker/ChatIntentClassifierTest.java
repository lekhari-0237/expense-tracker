package com.example.expensetracker;

import com.example.expensetracker.service.chatbot.ChatIntent;
import com.example.expensetracker.service.chatbot.ChatIntentClassifier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.*;

public class ChatIntentClassifierTest {

    private ChatIntentClassifier classifier;
    private final ZoneId zoneId = ZoneId.of("Asia/Kolkata");

    @BeforeEach
    void setUp() {
        classifier = new ChatIntentClassifier();
    }

    @Test
    void testCommandClassification() {
        assertEquals(ChatIntent.COMMAND, classifier.classify("Add ₹250 for lunch today"));
        assertEquals(ChatIntent.COMMAND, classifier.classify("I spent ₹1,200 on groceries yesterday"));
        assertEquals(ChatIntent.COMMAND, classifier.classify("Log a ₹500 auto fare under transport"));
        assertEquals(ChatIntent.COMMAND, classifier.classify("Delete my last expense"));
        assertEquals(ChatIntent.COMMAND, classifier.classify("Edit the amount of my last entry to ₹300"));
        assertEquals(ChatIntent.COMMAND, classifier.classify("Record my electricity bill of ₹1,850"));
        assertEquals(ChatIntent.COMMAND, classifier.classify("yes"));
        assertEquals(ChatIntent.COMMAND, classifier.classify("no"));
    }

    @Test
    void testQuestionClassification() {
        assertEquals(ChatIntent.QUESTION, classifier.classify("How much did I spend on food last month?"));
        assertEquals(ChatIntent.QUESTION, classifier.classify("Which category do I spend most on?"));
        assertEquals(ChatIntent.QUESTION, classifier.classify("Show my recent transactions"));
        assertEquals(ChatIntent.QUESTION, classifier.classify("What is my biggest expense this month?"));
        assertEquals(ChatIntent.QUESTION, classifier.classify("Spending trend for the last 6 months"));
    }

    @Test
    void testDateResolution() {
        LocalDate today = LocalDate.now(zoneId);
        assertEquals(today, classifier.resolveDate("Add ₹250 for lunch today", zoneId));
        assertEquals(today.minusDays(1), classifier.resolveDate("I spent ₹1,200 on groceries yesterday", zoneId));

        LocalDate fifth = classifier.resolveDate("Record electricity bill paid on the 5th", zoneId);
        assertEquals(5, fifth.getDayOfMonth());
    }

    @Test
    void testCategoryResolution() {
        assertEquals("Food", classifier.resolveCategory("Add ₹250 for lunch today"));
        assertEquals("Transport", classifier.resolveCategory("Log a ₹500 auto fare"));
        assertEquals("Bills", classifier.resolveCategory("electricity bill of ₹1,850"));
        assertEquals("Rent", classifier.resolveCategory("paid rent ₹15,000"));
        assertEquals("Entertainment", classifier.resolveCategory("netflix subscription ₹499"));
        assertEquals("Healthcare", classifier.resolveCategory("medicine at pharmacy ₹320"));
        assertEquals("Education", classifier.resolveCategory("college fees ₹4,500"));
        assertEquals("Shopping", classifier.resolveCategory("clothes from myntra ₹1,400"));
    }
}
